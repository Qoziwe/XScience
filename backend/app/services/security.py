"""
Пароли и второй фактор (§6.5).
Пароли — argon2id, если установлен argon2-cffi (см. requirements.txt),
иначе scrypt из стандартной библиотеки. Обратимого шифрования нет.
TOTP — RFC 6238 на hmac/hashlib, без внешних зависимостей.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time

try:  # предпочтительный вариант по §6.5
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError

    _ph = PasswordHasher()
    ARGON2 = True
except Exception:  # pragma: no cover — зависимость не установлена
    _ph = None
    ARGON2 = False

# n=2^14, r=8 → 16 МиБ на проверку: укладывается в лимит памяти OpenSSL по умолчанию.
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


#: Пароль-пустышка: сравнение выполняется и когда логина нет, чтобы время
#: ответа не выдавало существование учётной записи (§6.5).
DUMMY_HASH = hash_password('xscience-dummy-password')


def new_totp_secret() -> str:
    """Секрет в base32 — как его ждут приложения-аутентификаторы."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')


def totp(secret_b32: str, counter: int, digits: int = 6) -> str:
    key = base64.b32decode(secret_b32 + '=' * (-len(secret_b32) % 8), casefold=True)
    mac = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    code = struct.unpack('>I', mac[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(code % 10 ** digits).zfill(digits)


def verify_totp(secret_b32: str, code: str, step: int = 30, window: int = 1,
                now: float | None = None) -> bool:
    """RFC 6238, 6 цифр, окно ±1 шаг (§6.5)."""
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
    """Отпечаток тела запроса для ключа идемпотентности (§18.3)."""
    return hashlib.sha256(raw or b'').hexdigest()


def client_ip(headers, remote_addr: str | None) -> str:
    fwd = headers.get('X-Forwarded-For', '')
    return (fwd.split(',')[0].strip() or remote_addr or '-') if fwd else (remote_addr or '-')
