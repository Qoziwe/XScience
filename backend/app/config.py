"""Configuration. Secrets come from the environment, see .env.example."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ('1', 'true', 'yes', 'on')


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, ''))
    except ValueError:
        return default


class Config:
    ENV = os.environ.get('XSCI_ENV', 'development')
    PRODUCTION = ENV == 'production'

    SECRET_KEY = os.environ.get('XSCI_SECRET_KEY', 'dev-insecure-change-me')
    DB_PATH = os.environ.get('XSCI_DB', str(BASE_DIR / 'data' / 'xscience.sqlite3'))
    PORT = _int('XSCI_PORT', 5000)

    # §6.5 — session: 8h absolute lifetime, 15 min idle timeout.
    SESSION_ABSOLUTE_S = _int('XSCI_SESSION_ABSOLUTE_S', 8 * 3600)
    SESSION_IDLE_S = _int('XSCI_SESSION_IDLE_S', 15 * 60)
    SESSION_COOKIE = 'xsci_session'
    CSRF_COOKIE = 'xsci_csrf'
    # Secure is only disabled in dev (Vite proxies over http). HTTPS in prod (§6.5).
    COOKIE_SECURE = _bool('XSCI_COOKIE_SECURE', PRODUCTION)
    # Only needed when the front end and back end are different subdomains of the
    # same domain (e.g. front end on xscience.andatra.space, back end on
    # xscienceapi.andatra.space): without it the CSRF cookie would only be
    # visible to the backend host, and client-side JS wouldn't be able to read
    # it. Empty — the cookie is host-bound (as it is now).
    COOKIE_DOMAIN = os.environ.get('XSCI_COOKIE_DOMAIN', '') or None

    # §6.5 — login limits.
    PASSWORD_MAX_ATTEMPTS = _int('XSCI_PASSWORD_MAX_ATTEMPTS', 5)
    PASSWORD_LOCK_S = _int('XSCI_PASSWORD_LOCK_S', 30)
    CODE_MAX_ATTEMPTS = _int('XSCI_CODE_MAX_ATTEMPTS', 3)
    # Same response time for "no such login" and "wrong password" (§6.5).
    LOGIN_MIN_RESPONSE_S = float(os.environ.get('XSCI_LOGIN_MIN_RESPONSE_S', '0.25'))

    # §11.4 [MOCK] — delay for "report transmission to Earth".
    REPORT_SEND_DELAY_S = float(os.environ.get('XSCI_REPORT_SEND_DELAY_S', '2.5'))
    REPORT_WORKER = _bool('XSCI_REPORT_WORKER', True)

    # [PROTOTYPE] sensor simulation — services/sensors.py. SENSOR_WORKER enables
    # the background thread itself (like REPORT_WORKER); actual generation is
    # controlled by a separate runtime toggle via POST /api/sensors/toggle.
    SENSOR_WORKER = _bool('XSCI_SENSOR_WORKER', True)
    SENSOR_TICK_S = _int('XSCI_SENSOR_TICK_S', 30)
    SHIP_REPORT_INTERVAL_S = _int('XSCI_SHIP_REPORT_INTERVAL_S', 300)

    # §17.3, §18.7 — flame photos: directory outside the web root and a size limit.
    PHOTO_DIR = os.environ.get('XSCI_PHOTO_DIR', str(BASE_DIR / 'data' / 'photos'))
    PHOTO_MAX_BYTES = _int('XSCI_PHOTO_MAX_MB', 8) * 1024 * 1024

    #: Calculation rules version, stored in the analysis record (§4.2 model_version).
    MODEL_VERSION = 'rules-v0.1'

    # [PROTOTYPE] static second-factor code instead of TOTP — so demo login
    # from the interface works without an authenticator app. Forbidden in prod (§6.5).
    DEMO_CODE = os.environ.get('XSCI_DEMO_CODE', '' if PRODUCTION else '123456')

    # CORS is only needed if the front end and back end are on different origins (in dev, Vite proxies).
    CORS_ORIGIN = os.environ.get('XSCI_CORS_ORIGIN', '')
