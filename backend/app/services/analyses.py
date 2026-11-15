"""
Creating and reading analyses (§4.2, §18.3).
The server performs the calculation, texts, and report; the client only
sends the raw §4.1 input. The record is not modified after creation.
"""
from __future__ import annotations

import json
from typing import Any

from flask import current_app

from ..db import execute, query
from ..domain import report as report_mod
from ..domain.format import hhmmss, iso, num, parse_iso, report_no, utc_now
from ..domain.scoring import (
    confidence_codes, confidence_note, confidence_of, danger_index, score, verdict_of_scores,
)
from ..domain.texts import notes_of
from ..domain.validation import to_input
from .ai import texts as ai_texts
from . import reports as reports_svc
from ..errors import ApiError


def build_record(params: dict[str, Any], sector: str, analysis_id: int,
                 created_at, operator_id: str | None, source: str = 'manual') -> dict[str, Any]:
    """
    Full analysis record (§4.2) — everything the server computes, texts included.
    Scores and verdict always come from the §14 rules; texts come from the AI
    module if configured, otherwise the §15 rules (see services/ai/texts.py).
    """
    s = score(params)
    v = verdict_of_scores(s)
    conf = confidence_of(params)
    t = s['t']
    texts, texts_source, texts_version = ai_texts.generate(
        params, s, sector, v, conf, logger=current_app.logger)
    return {
        'id': analysis_id,
        'created_at': iso(created_at),
        # Calculation completion time in the form the client displays it (§4.2).
        'ts': hhmmss(created_at),
        'operator_id': operator_id,
        'sector': sector,
        'source': source,
        'input': {k: num(x) if isinstance(x, (int, float)) else x
                  for k, x in to_input(params).items()},
        'p': {k: num(x) if isinstance(x, (int, float)) else x for k, x in params.items()},
        'scores': {
            'material_risk': t['mat'], 'oxygen_risk': t['o2'], 'flow_risk': t['flow'],
            'temperature_risk': t['temp'], 'time_risk': t['time'], 'gravity_risk': t['grav'],
            'oxygen_deficit': t['od'], 'low_flow_penalty': t['lf'], 'thickness_bonus': t['th'],
            'risk_score': s['risk'], 'risk_level': s['level'],
            'extinction_score': s['ext'], 'extinction_probability': s['extLevel'],
        },
        # Short prototype names — the client reads these (§4.2).
        'risk': s['risk'], 'ext': s['ext'], 'level': s['level'], 'extLevel': s['extLevel'],
        'v': v, 'conf': conf,
        'verdict': v,
        'danger_index': danger_index(s['risk'], s['ext']),
        'confidence': conf,
        'confidence_reasons': confidence_codes(params),
        'confidence_note': confidence_note(params),
        'notes': notes_of(params, s),
        'texts': texts,
        # What produced the texts: llm (AI module) or rules (§15 rules).
        'texts_source': texts_source,
        'texts_model': texts_version,
        'model_version': current_app.config['MODEL_VERSION'],
        'report_id': report_no(analysis_id),
        'sent': None,
        'acked_at': None,
    }


def create(params: dict[str, Any], sector: str, operator_id: str | None,
           idem_key: str | None, request_hash: str, source: str = 'manual',
           make_report: bool = True) -> dict[str, Any]:
    """
    Creates an analysis and (if make_report) a report in a single transaction.
    §18.3 — a retry with the same Idempotency-Key returns the previous record;
    the same key with a different body — 409. make_report=False with
    source='sensor' is used by the sensor simulation (services/sensors.py) —
    the reading is written as a regular analysis but without an immediate
    report: a separate periodic worker assembles the ship-wide report.
    """
    if idem_key:
        prev = query('SELECT * FROM idempotency WHERE key = ? AND user_id = ?',
                     (idem_key, operator_id or '-'), one=True)
        if prev:
            if prev['request_hash'] != request_hash:
                raise ApiError(409, 'idempotency_conflict')
            return {'record': get(prev['analysis_id']), 'replayed': True}

    now = utc_now()
    con = execute('BEGIN IMMEDIATE').connection
    try:
        cur = con.execute(
            'INSERT INTO analyses (created_at, operator_id, sector, source, verdict, '
            'risk_score, ext_score, confidence, record) VALUES (?,?,?,?,?,?,?,?,?)',
            (iso(now), operator_id, sector, source, 'pending', 0, 0, 0, '{}'))
        analysis_id = int(cur.lastrowid)
        rec = build_record(params, sector, analysis_id, now, operator_id, source=source)
        con.execute('UPDATE analyses SET verdict = ?, risk_score = ?, ext_score = ?, '
                    'confidence = ?, record = ? WHERE id = ?',
                    (rec['v'], rec['risk'], rec['ext'], rec['conf'],
                     json.dumps(rec, ensure_ascii=False), analysis_id))

        if make_report:
            doc = report_mod.report_doc(rec)
            reports_svc.insert_report(con, rec['report_id'], analysis_id, sector, rec['v'],
                                       iso(now), doc)

        if idem_key:
            con.execute('INSERT INTO idempotency (key, user_id, request_hash, analysis_id, '
                        'created_at) VALUES (?,?,?,?,?)',
                        (idem_key, operator_id or '-', request_hash, analysis_id, iso(now)))
        con.execute('COMMIT')
    except Exception:
        con.execute('ROLLBACK')
        raise
    return {'record': get(analysis_id), 'replayed': False}


def _row_to_record(row: Any) -> dict[str, Any]:
    rec = json.loads(row['record'])
    rec['acked_at'] = row['acked_at']
    return rec


def _attach_sent(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Report transmission status (§11.4): sent = transmission time or null."""
    if not records:
        return records
    ids = [r['id'] for r in records]
    marks = {r['analysis_id']: r for r in query(
        f'SELECT analysis_id, status, sent_at FROM reports '
        f'WHERE analysis_id IN ({",".join("?" * len(ids))})', tuple(ids))}
    for rec in records:
        m = marks.get(rec['id'])
        rec['report_status'] = m['status'] if m else None
        rec['sent'] = hhmmss(parse_iso(m['sent_at'])) if m and m['sent_at'] else None
        rec['sent_at'] = m['sent_at'] if m else None
    return records


def get(analysis_id: int) -> dict[str, Any] | None:
    row = query('SELECT * FROM analyses WHERE id = ?', (analysis_id,), one=True)
    if not row:
        return None
    return _attach_sent([_row_to_record(row)])[0]


def listing(sector: str | None = None, limit: int = 100,
            before_id: int | None = None) -> list[dict[str, Any]]:
    """§18.3 — newest first; pagination via before_id."""
    sql = 'SELECT * FROM analyses WHERE 1 = 1'
    args: list[Any] = []
    if sector:
        sql += ' AND sector = ?'
        args.append(sector)
    if before_id:
        sql += ' AND id < ?'
        args.append(before_id)
    sql += ' ORDER BY id DESC LIMIT ?'
    args.append(max(1, min(limit, 500)))
    return _attach_sent([_row_to_record(r) for r in query(sql, tuple(args))])


def all_ascending() -> list[dict[str, Any]]:
    """Full history in ascending id order — for ship aggregation and CSV."""
    return _attach_sent([_row_to_record(r)
                         for r in query('SELECT * FROM analyses ORDER BY id ASC')])


def ack(analysis_id: int, operator_id: str | None) -> dict[str, Any]:
    """Operator's "Acknowledged" confirmation (§18.3). Does not change the record itself."""
    row = query('SELECT id, acked_at FROM analyses WHERE id = ?', (analysis_id,), one=True)
    if not row:
        raise ApiError(404, 'not_found')
    if row['acked_at']:
        return {'analysis_id': analysis_id, 'acked_at': row['acked_at'], 'already': True}
    at = iso(utc_now())
    execute('UPDATE analyses SET acked_at = ?, acked_by = ? WHERE id = ?',
            (at, operator_id, analysis_id))
    return {'analysis_id': analysis_id, 'acked_at': at, 'already': False}
