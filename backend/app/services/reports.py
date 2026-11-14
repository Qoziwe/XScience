"""
Отчёты и их «передача на Землю» (§11.4, §18.4).
[МАКЕТ] реальной передачи нет: отчёт лежит в очереди REPORT_SEND_DELAY_S,
затем помечается переданным. Статус хранится в БД и поэтому переживает
перезапуск процесса — в отличие от прототипа, где таймер запускался заново.
[ВОПРОС 16.16] формат и канал подтверждения приёма на Земле не согласованы.
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
    """§18.4 — список отчётов, новые сверху; since — ISO-время создания."""
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
    """§11.2 — документ отчёта. Содержимое зафиксировано при создании анализа."""
    row = _row(report_id)
    sent = hhmmss(parse_iso(row['sent_at'])) if row['sent_at'] else None
    doc = with_sent(json.loads(row['content']), sent)
    return {**_public(row), 'content': doc}


def txt(report_id: str) -> str:
    """§11.3 — TXT."""
    return report_txt(document(report_id)['content'])


def resend(report_id: str) -> dict[str, Any]:
    """§18.4 — повторная отправка при failed."""
    row = _row(report_id)
    if row['status'] == 'sent':
        return _public(row)
    execute('UPDATE reports SET status = ?, created_at = ? WHERE id = ?',
            ('queued', iso(utc_now()), row['id']))
    return _public(_row(report_id))


def flush_queue(db_path: str, delay_s: float) -> int:
    """
    Помечает переданными отчёты, пролежавшие в очереди дольше delay_s.
    Вызывается фоновым потоком и тестами; работает на своём соединении.
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
    """Фоновый поток-макет передачи. Выключается конфигом REPORT_WORKER."""
    db_path = app.config['DB_PATH']
    delay = app.config['REPORT_SEND_DELAY_S']
    tick = max(0.2, min(delay / 2, 2.0))
    stop = threading.Event()
    app.extensions['report_worker_stop'] = stop

    def loop() -> None:
        while not stop.wait(tick):
            try:
                flush_queue(db_path, delay)
            except Exception:  # pragma: no cover — поток не должен падать
                app.logger.exception('report worker tick failed')

    threading.Thread(target=loop, name='report-sender', daemon=True).start()


def pending_count() -> int:
    row = query("SELECT COUNT(*) AS n FROM reports WHERE status = 'queued'", one=True)
    return row['n'] if row else 0
