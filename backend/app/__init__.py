"""
Фабрика Flask-приложения XScience.
Контракт API — FUNCTIONAL_SPEC.md §18; расчёт — §14; тексты — §15.
"""
from __future__ import annotations

from typing import Any

from flask import Flask, jsonify

from .config import Config
from .db import close_db, init_db
from .errors import register_error_handlers


def create_app(overrides: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    # Русские тексты отдаём как есть, без \uXXXX — ответы читаемы и короче.
    app.json.ensure_ascii = False
    if overrides:
        app.config.update(overrides)

    init_db(app.config['DB_PATH'])
    app.teardown_appcontext(close_db)
    register_error_handlers(app)

    from .api import BLUEPRINTS
    for bp in BLUEPRINTS:
        app.register_blueprint(bp)

    @app.get('/api/health')
    def health():
        from .services.ai import config as ai_config
        return jsonify({'status': 'ok', 'env': app.config['ENV'],
                        'model_version': app.config['MODEL_VERSION'],
                        # Что настроено из ИИ (без ключей): провайдер:модель или rules/off.
                        'ai': ai_config.describe()})

    # CORS нужен только если фронт и бэк на разных origin
    # (в dev Vite проксирует /api на этот порт, и CORS не требуется).
    origin = app.config.get('CORS_ORIGIN')
    if origin:
        @app.after_request
        def cors(resp):
            resp.headers['Access-Control-Allow-Origin'] = origin
            resp.headers['Access-Control-Allow-Credentials'] = 'true'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-CSRF-Token, Idempotency-Key'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
            resp.headers['Vary'] = 'Origin'
            return resp

    if app.config['REPORT_WORKER']:
        from .services.reports import start_worker
        start_worker(app)

    if app.config['SENSOR_WORKER']:
        from .services.sensors import start_tick_worker
        start_tick_worker(app)

    return app
