"""§18.1 — authentication."""
from __future__ import annotations

import time
from typing import Any

from flask import Blueprint, current_app, jsonify, make_response, request

from ..errors import bad_json, unauthorized
from ..services import auth

bp = Blueprint('auth', __name__, url_prefix='/api')


def _json() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise bad_json()
    return body


def _set_cookies(resp, session_id: str, csrf: str):
    cfg = current_app.config
    # §6.5 — HttpOnly; Secure; SameSite=Strict. domain is empty if the frontend
    # and backend are on the same host; otherwise — a shared subdomain
    # (XSCI_COOKIE_DOMAIN) so client JS on another subdomain can read the CSRF cookie.
    resp.set_cookie(cfg['SESSION_COOKIE'], session_id, httponly=True,
                    secure=cfg['COOKIE_SECURE'], samesite='Strict', path='/',
                    domain=cfg['COOKIE_DOMAIN'], max_age=cfg['SESSION_ABSOLUTE_S'])
    # The CSRF token is read by the client and sent back as a header — hence no HttpOnly.
    resp.set_cookie(cfg['CSRF_COOKIE'], csrf, httponly=False,
                    secure=cfg['COOKIE_SECURE'], samesite='Strict', path='/',
                    domain=cfg['COOKIE_DOMAIN'], max_age=cfg['SESSION_ABSOLUTE_S'])
    return resp


def _clear_cookies(resp):
    cfg = current_app.config
    # domain must match what was used when setting the cookie — otherwise the
    # browser won't find the cookie to delete and will just set a new, empty one.
    resp.delete_cookie(cfg['SESSION_COOKIE'], path='/', domain=cfg['COOKIE_DOMAIN'])
    resp.delete_cookie(cfg['CSRF_COOKIE'], path='/', domain=cfg['COOKIE_DOMAIN'])
    return resp


@bp.post('/auth/login')
def login():
    """Step 1: {login, password} → 200 {stage:"code_required"}."""
    started = time.monotonic()
    body = _json()
    try:
        sess = auth.login_step1(str(body.get('login', '')), str(body.get('password', '')))
    finally:
        # §6.5 — same response time regardless of the failure reason.
        rest = current_app.config['LOGIN_MIN_RESPONSE_S'] - (time.monotonic() - started)
        if rest > 0:
            time.sleep(rest)
    resp = make_response(jsonify({'stage': 'code_required'}), 200)
    return _set_cookies(resp, sess['id'], sess['csrf'])


@bp.post('/auth/code')
def code():
    """Step 2: {code} → 200 {user:{login, role}, expires_at}."""
    body = _json()
    row = auth.current_session()
    if not row:
        raise unauthorized('restart_login')
    auth.require_csrf(row)
    res = auth.verify_code(row['id'], str(body.get('code', '')))
    resp = make_response(jsonify({
        'user': {'login': res['login'], 'role': res['role']},
        'expires_at': res['expires_at'],
    }), 200)
    return _set_cookies(resp, res['session_id'], res['csrf'])


@bp.post('/auth/logout')
def logout():
    row = auth.current_session()
    if row:
        auth.require_csrf(row)
        auth.revoke(row['id'])
    return _clear_cookies(make_response('', 204))


@bp.get('/me')
def me():
    row = auth.require_auth()
    return jsonify(auth.session_user(row))
