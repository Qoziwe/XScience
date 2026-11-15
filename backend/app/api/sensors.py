"""Sensor simulation (prototype) — toggles in the header and the analysis form."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..errors import bad_json
from ..services import auth
from ..services import sensors as svc

bp = Blueprint('sensors', __name__, url_prefix='/api')


def _bool_body() -> bool:
    body = request.get_json(silent=True)
    if body is None or not isinstance(body.get('enabled'), bool):
        raise bad_json()
    return body['enabled']


@bp.get('/sensors')
def status():
    auth.require_auth()
    return jsonify(svc.get_status())


@bp.post('/sensors/toggle')
def toggle():
    row = auth.require_auth()
    auth.require_csrf(row)
    return jsonify(svc.set_enabled(_bool_body()))


@bp.post('/sensors/override')
def override():
    row = auth.require_auth()
    auth.require_csrf(row)
    return jsonify(svc.set_manual_override(_bool_body()))
