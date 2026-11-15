"""
XScience Flask application factory.
API contract — FUNCTIONAL_SPEC.md §18; calculation — §14; texts — §15.
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
    # Send non-ASCII text as-is, without \uXXXX — responses are readable and shorter.
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
                        # What's configured for AI (no keys): provider:model or rules/off.
                        'ai': ai_config.describe()})

    # CORS is only needed if the front end and back end are on different origins
    # (in dev, Vite proxies /api to this port, and CORS is not required).
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
