"""
Authorization: two steps (password → code), sessions, limits, log (§6.1–6.5, §18.1).
There is no registration — accounts are created by the administrator (seed.py).
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from flask import current_app, g, request

from ..db import execute, query
from ..domain.format import iso, parse_iso, utc_now
from ..errors import ApiError, unauthorized
from .security import (
    DUMMY_HASH, client_ip, new_id, new_token, verify_password, verify_totp,
)

#: Result levels in the attempts log (§4.4).
OK, BAD_PASSWORD, BAD_CODE, LOCKED = 'ok', 'bad_password', 'bad_code', 'locked'


def log_attempt(login: str, result: str) -> None:
    execute('INSERT INTO login_attempts (login, ip, at, result) VALUES (?,?,?,?)',
            (login, ip(), iso(utc_now()), result))


def ip() -> str:
    return client_ip(request.headers, request.remote_addr)


def _failures_since(column: str, value: str, seconds: int) -> tuple[int, str | None]:
    """
    Failed password attempts in the last `seconds` seconds, by login or IP (§6.5).
    Design (lockout window): failures are counted in a sliding window of length
    PASSWORD_LOCK_S; once the limit is reached, the lockout is measured from the
    last failure. This makes the "5 failures → 30 s" rule unambiguous and
    self-resetting without a separate lockout table.
    """
    since = iso(utc_now() - timedelta(seconds=seconds))
    row = query(f'SELECT COUNT(*) AS n, MAX(at) AS last FROM login_attempts '
                f'WHERE {column} = ? AND result = ? AND at > ?',
                (value, BAD_PASSWORD, since), one=True)
    return (row['n'] if row else 0), (row['last'] if row else None)


def _check_lock(login: str) -> None:
    cfg = current_app.config
    limit, lock_s = cfg['PASSWORD_MAX_ATTEMPTS'], cfg['PASSWORD_LOCK_S']
    for column, value in (('login', login), ('ip', ip())):
        n, last = _failures_since(column, value, lock_s)
        if n >= limit and last:
            elapsed = (utc_now() - parse_iso(last)).total_seconds()
            retry = max(1, int(lock_s - elapsed))
            log_attempt(login, LOCKED)
            raise ApiError(429, 'locked', retry_after_s=retry)


def attempts_left(login: str) -> int:
    cfg = current_app.config
    n, _ = _failures_since('login', login, cfg['PASSWORD_LOCK_S'])
    return max(0, cfg['PASSWORD_MAX_ATTEMPTS'] - n)


def login_step1(login: str, password: str) -> dict[str, Any]:
    """
    Step 1 (§6.1). Creates a session with stage password_ok.
    The response to "no such login" and "wrong password" is identical (§6.5).
    """
    login = (login or '').strip()
    _check_lock(login)

    row = query('SELECT * FROM users WHERE login = ? AND is_active = 1', (login,), one=True)
    # Always run the hash check — otherwise response time leaks whether the account exists.
    ok = verify_password(row['password_hash'] if row else DUMMY_HASH, password or '')

    if not row or not ok:
        log_attempt(login, BAD_PASSWORD)
        raise unauthorized('invalid_credentials', attempts_left=attempts_left(login))

    log_attempt(login, OK)
    return create_session(row['id'], stage='password_ok')


def create_session(user_id: str, stage: str) -> dict[str, Any]:
    now = utc_now()
    sid, csrf = new_id('s'), new_token()
    execute('INSERT INTO sessions (id, user_id, stage, csrf_token, created_at, last_seen_at, '
            'expires_at) VALUES (?,?,?,?,?,?,?)',
            (sid, user_id, stage, csrf, iso(now), iso(now),
             iso(now + timedelta(seconds=current_app.config['SESSION_ABSOLUTE_S']))))
    return {'id': sid, 'csrf': csrf}


def revoke(session_id: str) -> None:
    execute('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
            (iso(utc_now()), session_id))


def _load(session_id: str | None) -> Any:
    if not session_id:
        return None
    row = query('SELECT s.*, u.login, u.role, u.totp_secret, u.is_active '
                'FROM sessions s JOIN users u ON u.id = s.user_id '
                'WHERE s.id = ? AND s.revoked_at IS NULL', (session_id,), one=True)
    if not row or not row['is_active']:
        return None
    now = utc_now()
    # §6.5 — 8 h absolute lifetime and 15 min idle timeout.
    if now >= parse_iso(row['expires_at']):
        return None
    idle = (now - parse_iso(row['last_seen_at'])).total_seconds()
    if idle > current_app.config['SESSION_IDLE_S']:
        return None
    return row


def verify_code(session_id: str | None, code: str) -> dict[str, Any]:
    """
    Step 2 (§6.2). 3 failures → the step-1 session is revoked (§6.5).
    TOTP ±1 step; a static demo code (config DEMO_CODE) is allowed in dev.
    """
    row = _load(session_id)
    if not row or row['stage'] != 'password_ok':
        raise unauthorized('restart_login')

    demo = current_app.config['DEMO_CODE']
    ok = verify_totp(row['totp_secret'], code) or (bool(demo) and (code or '').strip() == demo)

    if not ok:
        attempts = row['code_attempts'] + 1
        execute('UPDATE sessions SET code_attempts = ? WHERE id = ?', (attempts, row['id']))
        log_attempt(row['login'], BAD_CODE)
        left = current_app.config['CODE_MAX_ATTEMPTS'] - attempts
        if left <= 0:
            revoke(row['id'])
            raise unauthorized('restart_login')
        raise unauthorized('invalid_code', attempts_left=left)

    now = utc_now()
    execute('UPDATE sessions SET stage = ?, code_attempts = 0, last_seen_at = ? WHERE id = ?',
            ('authenticated', iso(now), row['id']))
    log_attempt(row['login'], OK)
    return {'login': row['login'], 'role': row['role'],
            'expires_at': row['expires_at'], 'csrf': row['csrf_token'], 'session_id': row['id']}


def current_session() -> Any:
    """The current request's session (any stage), or None."""
    if 'session_row' not in g:
        g.session_row = _load(request.cookies.get(current_app.config['SESSION_COOKIE']))
    return g.session_row


def touch(row: Any) -> None:
    execute('UPDATE sessions SET last_seen_at = ? WHERE id = ?', (iso(utc_now()), row['id']))


def require_auth() -> Any:
    """A session with stage authenticated — otherwise 401 (§18)."""
    row = current_session()
    if not row or row['stage'] != 'authenticated':
        raise unauthorized()
    touch(row)
    return row


def require_csrf(row: Any) -> None:
    """§6.5 — token on every mutating request (double submit: header + cookie)."""
    sent = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token') or ''
    if not sent or sent != row['csrf_token']:
        raise ApiError(403, 'csrf_failed')


def session_user(row: Any) -> dict[str, Any]:
    return {'login': row['login'], 'role': row['role'], 'expires_at': row['expires_at']}
