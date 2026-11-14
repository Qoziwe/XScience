"""Единый формат ошибок API (§18.9)."""
from __future__ import annotations

from typing import Any

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    """Ошибка с кодом из §18.9: 400/401/403/404/409/422/429."""

    def __init__(self, status: int, error: str, **extra: Any) -> None:
        super().__init__(error)
        self.status = status
        self.error = error
        self.extra = {k: v for k, v in extra.items() if v is not None}

    def payload(self) -> dict[str, Any]:
        return {'error': self.error, **self.extra}


def validation_error(fields: dict[str, str]) -> ApiError:
    """422 — ошибка валидации входа (§18.9)."""
    return ApiError(422, 'validation_failed', fields=fields)


def bad_json() -> ApiError:
    return ApiError(400, 'bad_request')


def unauthorized(code: str = 'unauthorized', **extra: Any) -> ApiError:
    return ApiError(401, code, **extra)


def not_found() -> ApiError:
    return ApiError(404, 'not_found')


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _api_error(e: ApiError):
        return jsonify(e.payload()), e.status

    @app.errorhandler(HTTPException)
    def _http_error(e: HTTPException):
        codes = {400: 'bad_request', 401: 'unauthorized', 403: 'forbidden',
                 404: 'not_found', 405: 'method_not_allowed', 429: 'rate_limited'}
        return jsonify({'error': codes.get(e.code or 500, 'error')}), e.code or 500

    @app.errorhandler(Exception)
    def _unhandled(e: Exception):
        app.logger.exception('unhandled error: %s', e)
        return jsonify({'error': 'internal_error'}), 500
