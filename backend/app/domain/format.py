"""Formatting. Port of frontend/src/domain/format.ts (FUNCTIONAL_SPEC.md §0)."""
from __future__ import annotations

from datetime import datetime, timezone


def f1(v: float) -> str:
    """Integer → no fractional part; fractional → up to 2 digits, no trailing zeros."""
    if float(v).is_integer():
        return str(int(v))
    return repr(round(float(v), 2)).rstrip('0').rstrip('.')


def pad(n: int) -> str:
    """Analysis number zero-padded to 4 digits."""
    return str(n).zfill(4)


def report_no(analysis_id: int) -> str:
    return f'RPT-{pad(analysis_id)}'


def num(v: float) -> float | int:
    """Number for JSON: integers are returned as int to match the prototype."""
    return int(v) if float(v).is_integer() else float(v)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """ISO 8601 in UTC, with Z (§4.2)."""
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_iso(s: str) -> datetime:
    return datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def hhmmss(dt: datetime) -> str:
    """Local time HH:MM:SS — the format the client displays it in."""
    return dt.astimezone().strftime('%H:%M:%S')


def hhmm(dt: datetime) -> str:
    return dt.astimezone().strftime('%H:%M')
