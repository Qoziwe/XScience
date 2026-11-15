"""
Reports and their "transmission to Earth" (§11.4, §18.4).
[MOCK-UP] there is no real transmission: the report sits in the queue for
REPORT_SEND_DELAY_S, then is marked as sent. The status is stored in the DB
and so survives a process restart — unlike the prototype, where the timer
restarted from zero.
[QUESTION 16.16] the format and channel for confirming receipt on Earth are not settled.
"""
from __future__ import annotations

import json
import threading
from datetime import timedelta
from typing import Any

from flask import Flask

from ..db import connect, execute, query
from ..domain.format import hhmmss, iso, parse_iso, utc_now
from ..domain.report import report_txt, with_sent
from ..errors import not_found


def insert_report(con: Any, report_id: str, analysis_id: int, sector: str, verdict: str,
                   created_at: str, doc: dict[str, Any]) -> None:
    """
    Shared report-row insert — reused by manual/sensor analysis creation
    (services/analyses.py, in the same transaction via con) and by the
    periodic ship-wide summary report (services/sensors.py).
    """
    con.execute(
        'INSERT INTO reports (id, analysis_id, sector, verdict, created_at, author, '
        'status, sent_at, channel, content) VALUES (?,?,?,?,?,?,?,?,?,?)',
        (report_id, analysis_id, sector, verdict, created_at,
         'AI status module (generation mock-up)', 'queued', None, 'mock',
         json.dumps(doc, ensure_ascii=False)))


def _public(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'],
        'analysis_id': row['analysis_id'],
        'sector': row['sector'],
        'created_at': row['created_at'],
        'verdict': row['verdict'],
        'status': row['status'],
        'sent_at': row['sent_at'],
        'channel': row['channel'],
    }


def listing(limit: int = 100, since: str | None = None) -> list[dict[str, Any]]:
    """§18.4 — report list, newest first; since — ISO creation time."""
    sql = 'SELECT * FROM reports WHERE 1 = 1'
    args: list[Any] = []
    if since:
        sql += ' AND (created_at > ? OR (sent_at IS NOT NULL AND sent_at > ?))'
        args += [since, since]
    sql += ' ORDER BY analysis_id DESC LIMIT ?'
    args.append(max(1, min(limit, 500)))
    return [_public(r) for r in query(sql, tuple(args))]


def _row(report_id: str) -> Any:
    row = query('SELECT * FROM reports WHERE id = ? OR analysis_id = ?',
                (report_id, _as_int(report_id)), one=True)
    if not row:
        raise not_found()
    return row


def _as_int(v: str) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return -1


def document(report_id: str) -> dict[str, Any]:
    """§11.2 — report document. Content is fixed at analysis creation time."""
    row = _row(report_id)
    sent = hhmmss(parse_iso(row['sent_at'])) if row['sent_at'] else None
    doc = with_sent(json.loads(row['content']), sent)
    return {**_public(row), 'content': doc}


def txt(report_id: str) -> str:
    """§11.3 — plain-text report."""
    return report_txt(document(report_id)['content'])


def resend(report_id: str) -> dict[str, Any]:
    """§18.4 — resend when failed."""
    row = _row(report_id)
    if row['status'] == 'sent':
        return _public(row)
    execute('UPDATE reports SET status = ?, created_at = ? WHERE id = ?',
            ('queued', iso(utc_now()), row['id']))
    return _public(_row(report_id))


def flush_queue(db_path: str, delay_s: float) -> int:
    """
    Marks as sent any reports that have sat in the queue longer than delay_s.
    Called by the background thread and by tests; uses its own connection.
    """
    cutoff = iso(utc_now() - timedelta(seconds=delay_s))
    con = connect(db_path)
    try:
        cur = con.execute(
            "UPDATE reports SET status = 'sent', sent_at = ? "
            "WHERE status = 'queued' AND created_at <= ?", (iso(utc_now()), cutoff))
        return cur.rowcount or 0
    finally:
        con.close()


def start_worker(app: Flask) -> None:
    """Background mock transmission thread. Disabled via the REPORT_WORKER config."""
    db_path = app.config['DB_PATH']
    delay = app.config['REPORT_SEND_DELAY_S']
    tick = max(0.2, min(delay / 2, 2.0))
    stop = threading.Event()
    app.extensions['report_worker_stop'] = stop

    def loop() -> None:
        while not stop.wait(tick):
            try:
                flush_queue(db_path, delay)
            except Exception:  # pragma: no cover — the thread must not crash
                app.logger.exception('report worker tick failed')

    threading.Thread(target=loop, name='report-sender', daemon=True).start()


def pending_count() -> int:
    row = query("SELECT COUNT(*) AS n FROM reports WHERE status = 'queued'", one=True)
    return row['n'] if row else 0
