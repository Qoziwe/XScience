"""§18.2 — sectors and ship status."""
from __future__ import annotations

from flask import Blueprint, jsonify

from ..domain.reference import SECTORS
from ..domain.ship import ship_status
from ..services import analyses as svc

bp = Blueprint('sectors', __name__, url_prefix='/api')


@bp.get('/sectors')
def sectors():
    """§3.4 — placeholder layout (16.14), geometry matches the client diagram."""
    return jsonify([
        {'id': s['id'], 'code': s['code'], 'name': s['name'], 'desc': s['desc'],
         'geometry': {'x': s['x'], 'y': s['y'], 'w': s['w'], 'h': s['h']}}
        for s in SECTORS
    ])


@bp.get('/ship/status')
def ship():
    """
    §7.4 — aggregation based on the latest analysis of each sector.
    [QUESTION 16.19] the analysis validity period is not defined — decision made:
    a sector's latest analysis is used with no time limit, as in the prototype.
    Once a policy exists, add a filter on created_at.
    """
    return jsonify(ship_status(svc.all_ascending()))
