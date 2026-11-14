"""Конфигурация. Секреты — из окружения, см. .env.example."""
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

    # §6.5 — сессия: абсолютный срок 8 ч, бездействие 15 мин.
    SESSION_ABSOLUTE_S = _int('XSCI_SESSION_ABSOLUTE_S', 8 * 3600)
    SESSION_IDLE_S = _int('XSCI_SESSION_IDLE_S', 15 * 60)
    SESSION_COOKIE = 'xsci_session'
    CSRF_COOKIE = 'xsci_csrf'
    # Secure выключается только в dev (Vite проксирует по http). В проде — HTTPS (§6.5).
    COOKIE_SECURE = _bool('XSCI_COOKIE_SECURE', PRODUCTION)

    # §6.5 — лимиты входа.
    PASSWORD_MAX_ATTEMPTS = _int('XSCI_PASSWORD_MAX_ATTEMPTS', 5)
    PASSWORD_LOCK_S = _int('XSCI_PASSWORD_LOCK_S', 30)
    CODE_MAX_ATTEMPTS = _int('XSCI_CODE_MAX_ATTEMPTS', 3)
    # Одинаковое время ответа на «нет логина» и «неверный пароль» (§6.5).
    LOGIN_MIN_RESPONSE_S = float(os.environ.get('XSCI_LOGIN_MIN_RESPONSE_S', '0.25'))

    # §11.4 [МАКЕТ] — задержка «передачи отчёта на Землю».
    REPORT_SEND_DELAY_S = float(os.environ.get('XSCI_REPORT_SEND_DELAY_S', '2.5'))
    REPORT_WORKER = _bool('XSCI_REPORT_WORKER', True)

    # §17.3, §18.7 — фото пламени: каталог вне веб-корня и предел размера.
    PHOTO_DIR = os.environ.get('XSCI_PHOTO_DIR', str(BASE_DIR / 'data' / 'photos'))
    PHOTO_MAX_BYTES = _int('XSCI_PHOTO_MAX_MB', 8) * 1024 * 1024

    #: Версия правил расчёта, попадает в запись анализа (§4.2 model_version).
    MODEL_VERSION = 'rules-v0.1'

    # [ПРОТОТИП] статический код второго фактора вместо TOTP — чтобы демо-вход
    # из интерфейса работал без приложения-аутентификатора. В проде запрещён (§6.5).
    DEMO_CODE = os.environ.get('XSCI_DEMO_CODE', '' if PRODUCTION else '123456')

    # CORS нужен только если фронт и бэк на разных origin (в dev Vite проксирует).
    CORS_ORIGIN = os.environ.get('XSCI_CORS_ORIGIN', '')
