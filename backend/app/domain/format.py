"""Форматирование. Порт frontend/src/domain/format.ts (FUNCTIONAL_SPEC.md §0)."""
from __future__ import annotations

from datetime import datetime, timezone


def f1(v: float) -> str:
    """Целое → без дробной части; дробное → до 2 знаков без лишних нулей."""
    if float(v).is_integer():
        return str(int(v))
    return repr(round(float(v), 2)).rstrip('0').rstrip('.')


def pad(n: int) -> str:
    """Номер анализа с дополнением нулями до 4 знаков."""
    return str(n).zfill(4)


def report_no(analysis_id: int) -> str:
    return f'RPT-{pad(analysis_id)}'


def num(v: float) -> float | int:
    """Число для JSON: целые отдаём как int, чтобы совпадать с прототипом."""
    return int(v) if float(v).is_integer() else float(v)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """ISO 8601 в UTC, с Z (§4.2)."""
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_iso(s: str) -> datetime:
    return datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def hhmmss(dt: datetime) -> str:
    """Локальное время HH:MM:SS — вид, в котором его показывает клиент."""
    return dt.astimezone().strftime('%H:%M:%S')


def hhmm(dt: datetime) -> str:
    return dt.astimezone().strftime('%H:%M')
