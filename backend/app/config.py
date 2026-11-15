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

    DB_PATH = os.environ.get('XSCI_DB', str(BASE_DIR / 'data' / 'xscience.sqlite3'))
    PORT = _int('XSCI_PORT', 5000)

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

    # CORS is only needed if the front end and back end are on different origins (in dev, Vite proxies).
    CORS_ORIGIN = os.environ.get('XSCI_CORS_ORIGIN', '')
