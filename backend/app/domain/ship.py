"""
Агрегация состояния корабля. Порт frontend/src/domain/ship.ts (§7.4, §14.6).
Отдаётся через GET /api/ship/status (§18.2).
"""
from __future__ import annotations

import math
from typing import Any

from .reference import SECTORS, VERDICT_RU


def js_round(x: float) -> int:
    """Округление как Math.round в JS (половина — вверх), а не банковское."""
    return math.floor(x + 0.5)


def latest_by_sector(hist: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Последний анализ каждого сектора (по порядку истории, по возрастанию id)."""
    last: dict[str, dict[str, Any]] = {}
    for h in hist:
        last[h['sector']] = h
    return last


def ship_status(hist: list[dict[str, Any]]) -> dict[str, Any]:
    last = latest_by_sector(hist)

    def status_of(sector_id: str) -> str:
        h = last.get(sector_id)
        return h['v'] if h else 'none'

    total = len(SECTORS)
    analysed = len(last)

    def ids_with(k: str) -> list[str]:
        return [s['id'] for s in SECTORS if status_of(s['id']) == k]

    def codes_with(k: str) -> str:
        return ', '.join(s['code'] for s in SECTORS if status_of(s['id']) == k)

    dangers = ids_with('high')
    counts = {
        'high': len(dangers),
        'medium': len(ids_with('medium')),
        'low': len(ids_with('low')),
        'none': total - analysed,
    }
    latest_danger = max((last[i] for i in dangers), key=lambda h: h['id'], default=None)

    base: dict[str, Any] = {
        'analysed': analysed,
        'total': total,
        'counts': counts,
        'dangers': [{'sector': i, 'analysis_id': last[i]['id']} for i in dangers],
        'latest_danger_id': latest_danger['id'] if latest_danger else None,
        'sectors': [_sector_row(s['id'], last.get(s['id'])) for s in SECTORS],
    }

    if not analysed:
        base.update({'worst': None, 'verdict': None, 'verdict_label': None, 'subtitle': None,
                     'summary': None, 'confidence': None, 'confidence_note': None})
        return base

    worst = 'high' if counts['high'] else 'medium' if counts['medium'] else 'low'
    coverage = analysed / total
    mean_conf = sum(e['conf'] for e in last.values()) / analysed
    confidence = js_round(mean_conf * (0.6 + 0.4 * coverage))

    if worst == 'high':
        summary = (f'Опасность в секторах: {codes_with("high")}. '
                   + (f'Внимания требуют: {codes_with("medium")}. ' if counts['medium'] else '')
                   + 'Приоритет — нейтрализовать опасность в указанных секторах.')
    elif worst == 'medium':
        summary = f'Критических секторов нет. Внимания требуют: {codes_with("medium")}.'
    else:
        summary = 'Во всех проанализированных секторах условия безопасны.'

    base.update({
        'worst': worst,
        'verdict': worst,
        'verdict_label': VERDICT_RU[worst],
        'subtitle': (f'по {analysed} из {total} секторов — картина неполная'
                     if analysed < total else 'по всем секторам'),
        'summary': summary,
        'confidence': confidence,
        'confidence_note': ('Снижена: проанализированы не все сектора.'
                            if analysed < total else 'Проанализированы все сектора.'),
    })
    return base


def _sector_row(sector_id: str, h: dict[str, Any] | None) -> dict[str, Any]:
    if not h:
        return {'id': sector_id, 'status': 'none'}
    return {
        'id': sector_id,
        'status': h['v'],
        'last_analysis_id': h['id'],
        'last_at': h.get('created_at') or h['ts'],
        'risk': h['risk'],
        'ext': h['ext'],
        'report_status': 'sent' if h.get('sent') else 'queued',
    }
