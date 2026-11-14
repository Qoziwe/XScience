"""Доступ к SQLite. Без ORM: запросов мало, схема в app/schema.sql."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from flask import current_app, g

SCHEMA = Path(__file__).resolve().parent / 'schema.sql'


def connect(path: str) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA journal_mode = WAL')
    con.execute('PRAGMA foreign_keys = ON')
    con.execute('PRAGMA busy_timeout = 5000')
    return con


def init_db(path: str) -> None:
    con = connect(path)
    try:
        con.executescript(SCHEMA.read_text(encoding='utf-8'))
    finally:
        con.close()


def db() -> sqlite3.Connection:
    """Соединение на время запроса."""
    if 'db' not in g:
        g.db = connect(current_app.config['DB_PATH'])
    return g.db


def close_db(_exc: BaseException | None = None) -> None:
    con = g.pop('db', None)
    if con is not None:
        con.close()


def query(sql: str, args: tuple[Any, ...] = (), one: bool = False):
    cur = db().execute(sql, args)
    rows = cur.fetchall()
    cur.close()
    return (rows[0] if rows else None) if one else rows


def execute(sql: str, args: tuple[Any, ...] = ()) -> sqlite3.Cursor:
    return db().execute(sql, args)
