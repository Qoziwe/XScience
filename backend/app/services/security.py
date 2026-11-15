"""
Passwords and the second factor (§6.5).
Passwords use argon2id if argon2-cffi is installed (see requirements.txt),
otherwise scrypt from the standard library. There is no reversible encryption.
TOTP — RFC 6238 on hmac/hashlib, no external dependencies.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time

try:  # preferred option per §6.5
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError

    _ph = PasswordHasher()
    ARGON2 = True
except Exception:  # pragma: no cover — dependency not installed
    _ph = None
    ARGON2 = False

# n=2^14, r=8 → 16 MiB per check: fits OpenSSL's default memory limit.
_SCRYPT = {'n': 2 ** 14, 'r': 8, 'p': 1, 'dklen': 32, 'maxmem': 64 * 1024 * 1024}


def hash_password(password: str) -> str:
    if ARGON2:
        return _ph.hash(password)
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return 'scrypt${}${}${}${}${}'.format(
        _SCRYPT['n'], _SCRYPT['r'], _SCRYPT['p'],
        base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def verify_password(stored: str, password: str) -> bool:
    if stored.startswith('scrypt$'):
        try:
            _, n, r, p, salt_b64, hash_b64 = stored.split('$')
            dk = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64),
                                n=int(n), r=int(r), p=int(p),
                                dklen=len(base64.b64decode(hash_b64)),
                                maxmem=_SCRYPT['maxmem'])
        except Exception:
            return False
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    if ARGON2:
        try:
            return _ph.verify(stored, password)
        except VerifyMismatchError:
            return False
        except Exception:
            return False
    return False


#: Dummy password: the comparison runs even when there is no such login, so
#: response time does not leak whether the account exists (§6.5).
DUMMY_HASH = hash_password('xscience-dummy-password')


def new_totp_secret() -> str:
    """Secret in base32 — the format authenticator apps expect."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')


def totp(secret_b32: str, counter: int, digits: int = 6) -> str:
    key = base64.b32decode(secret_b32 + '=' * (-len(secret_b32) % 8), casefold=True)
    mac = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    code = struct.unpack('>I', mac[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(code % 10 ** digits).zfill(digits)


def verify_totp(secret_b32: str, code: str, step: int = 30, window: int = 1,
                now: float | None = None) -> bool:
    """RFC 6238, 6 digits, ±1 step window (§6.5)."""
    code = (code or '').strip()
    if not code.isdigit() or len(code) != 6:
        return False
    counter = int((now if now is not None else time.time()) // step)
    return any(hmac.compare_digest(totp(secret_b32, counter + d), code)
               for d in range(-window, window + 1))


def new_token(n: bytes = 32) -> str:
    return secrets.token_urlsafe(32)


def new_id(prefix: str) -> str:
    return f'{prefix}_{secrets.token_hex(8)}'


def body_hash(raw: bytes) -> str:
    """Fingerprint of the request body for the idempotency key (§18.3)."""
    return hashlib.sha256(raw or b'').hexdigest()


def client_ip(headers, remote_addr: str | None) -> str:
    fwd = headers.get('X-Forwarded-For', '')
    return (fwd.split(',')[0].strip() or remote_addr or '-') if fwd else (remote_addr or '-')
