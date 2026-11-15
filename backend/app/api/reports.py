"""§18.4 — reports."""
from __future__ import annotations

from flask import Blueprint, Response, jsonify, request

from ..services import reports as svc

bp = Blueprint('reports', __name__, url_prefix='/api')


@bp.get('/reports')
def listing():
    try:
        limit = int(request.args.get('limit', 100))
    except ValueError:
        limit = 100
    return jsonify(svc.listing(limit=limit, since=request.args.get('since')))


@bp.get('/reports/<report_id>.txt')
def txt(report_id: str):
    """§11.3 — TXT."""
    return Response(svc.txt(report_id), mimetype='text/plain; charset=utf-8', headers={
        'Content-Disposition': f'attachment; filename="{report_id}.txt"'})


@bp.get('/reports/<report_id>')
def document(report_id: str):
    """§11.2 — report document."""
    return jsonify(svc.document(report_id))


@bp.post('/reports/<report_id>/resend')
def resend(report_id: str):
    return jsonify(svc.resend(report_id))
