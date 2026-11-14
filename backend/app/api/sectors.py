"""§18.2 — сектора и состояние корабля."""
from __future__ import annotations

from flask import Blueprint, jsonify

from ..domain.reference import SECTORS
from ..domain.ship import ship_status
from ..services import analyses as svc
from ..services import auth

bp = Blueprint('sectors', __name__, url_prefix='/api')


@bp.get('/sectors')
def sectors():
    """§3.4 — планировка-заглушка (16.14), геометрия совпадает со схемой клиента."""
    auth.require_auth()
    return jsonify([
        {'id': s['id'], 'code': s['code'], 'name': s['name'], 'desc': s['desc'],
         'geometry': {'x': s['x'], 'y': s['y'], 'w': s['w'], 'h': s['h']}}
        for s in SECTORS
    ])


@bp.get('/ship/status')
def ship():
    """
    §7.4 — агрегация по последнему анализу каждого сектора.
    [ВОПРОС 16.19] срок актуальности анализа не задан — принято решение:
    последний анализ сектора учитывается без ограничения по времени,
    как в прототипе. Когда появится регламент, добавить фильтр по created_at.
    """
    auth.require_auth()
    return jsonify(ship_status(svc.all_ascending()))
