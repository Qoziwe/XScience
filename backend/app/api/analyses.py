"""§18.3 — analyses."""
from __future__ import annotations

from flask import Blueprint, Response, jsonify, request

from ..domain.report import history_csv
from ..domain.validation import to_params, validate_input
from ..errors import bad_json, not_found, validation_error
from ..services import analyses as svc
from ..services import auth
from ..services.security import body_hash

bp = Blueprint('analyses', __name__, url_prefix='/api')


def _int_arg(name: str) -> int | None:
    raw = request.args.get(name)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


@bp.post('/analyses')
def create():
    """
    Body is AnalysisInput (§4.1). The client does not send scores, levels, the
    verdict, or texts: the server re-validates the input and computes everything itself (§18.3).
    """
    row = auth.require_auth()
    auth.require_csrf(row)
    body = request.get_json(silent=True)
    if body is None:
        raise bad_json()

    errors, clean = validate_input(body)
    if errors:
        raise validation_error(errors)

    res = svc.create(
        params=to_params(clean),
        sector=clean['sector'],
        operator_id=row['user_id'],
        idem_key=request.headers.get('Idempotency-Key'),
        request_hash=body_hash(request.get_data()),
    )
    rec = res['record']
    # §18.3 — alert_level: null for a low verdict, otherwise the verdict (§10.1).
    return jsonify({
        'analysis': rec,
        'report': {'id': rec['report_id'], 'status': rec.get('report_status'),
                   'sent_at': rec.get('sent_at')},
        'alert_level': None if rec['v'] == 'low' else rec['v'],
    }), 200 if res['replayed'] else 201


@bp.get('/analyses')
def listing():
    """List, newest first (§18.3)."""
    auth.require_auth()
    return jsonify(svc.listing(sector=request.args.get('sector'),
                               limit=_int_arg('limit') or 100,
                               before_id=_int_arg('before_id')))


@bp.get('/analyses.csv')
def csv_export():
    """§16.2 — history export."""
    auth.require_auth()
    body = history_csv(svc.all_ascending())
    return Response('﻿' + body, mimetype='text/csv; charset=utf-8', headers={
        'Content-Disposition': 'attachment; filename="xscience-analyses.csv"'})


@bp.get('/analyses/<int:analysis_id>')
def one(analysis_id: int):
    auth.require_auth()
    rec = svc.get(analysis_id)
    if not rec:
        raise not_found()
    return jsonify(rec)


@bp.post('/analyses/<int:analysis_id>/ack')
def ack(analysis_id: int):
    """Operator's "Acknowledged" confirmation (§10.2)."""
    row = auth.require_auth()
    auth.require_csrf(row)
    return jsonify(svc.ack(analysis_id, row['user_id']))
