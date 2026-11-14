"""
Отчёт для Земли. Порт frontend/src/domain/report.ts (§11).
Документ собирается один раз при создании анализа из сохранённых текстов,
чтобы не меняться задним числом при правке правил (§15). Меняется только
строка «Передача» — она отражает текущий статус отправки (§11.4).
"""
from __future__ import annotations

from typing import Any

from .format import f1, pad, report_no
from .reference import (
    EXT_LEVEL_RU, MAT, RISK_LEVEL_RU, SEC, VERDICT_RU, gravity_ru, sent_full,
)

BASE_LIMITS = ('Оценка построена по правилам раздела 14. Вердикт даёт расчёт по '
               'правилам; прогноз ML-модели в него не входит (§17.1). Диапазоны NASA '
               'не проверены. Гравитация учитывается как категория. Рекомендации '
               'носят рекомендательный характер.')


def limits(texts_source: str, texts_model: str) -> str:
    """§11.2 — «Ограничения». Честно говорит, чем написаны тексты отчёта."""
    if texts_source == 'llm':
        origin = (f'Тексты и рекомендации сформированы ИИ-моделью ({texts_model}) по '
                  'данным расчёта; баллы, уровни и вердикт она не меняет.')
    else:
        origin = ('Тексты и рекомендации сформированы детерминированными правилами '
                  'раздела 15, ИИ-модель не привлекалась.')
    return f'{BASE_LIMITS} {origin}'


def _conclusion(verdict_label: str, summary: str) -> str:
    """Вердикт + заключение, без удвоения, если текст уже начинается с вердикта."""
    head = verdict_label.rstrip('.').lower()
    if summary.strip().lower().startswith(head):
        return summary.strip()
    return f'{verdict_label}. {summary}"'.rstrip('"')

#: Ключ метаданных, который зависит от текущего статуса передачи.
SENT_KEY = 'Передача'


def report_doc(rec: dict[str, Any]) -> dict[str, Any]:
    """
    Документ отчёта (§11.2) по полной записи анализа (§4.2).
    `rec` — запись с полями p/risk/ext/level/extLevel/v/conf/ts/texts.
    """
    p = rec['p']
    sec = SEC[rec['sector']]
    texts = rec['texts']
    params = (f'{MAT[p["material"]]["label"]}, {f1(p["thickness"])} мм; '
              f'O₂ {f1(p["o2"])} %; поток {f1(p["flow"])} см/с; '
              f'{f1(p["temp"])} °C; {f1(p["time"])} с; {gravity_ru(p["gravity"])}.')
    return {
        'no': report_no(rec['id']),
        'analysisId': rec['id'],
        'title': f'{sec["code"]} · {sec["name"]}',
        'verdict': VERDICT_RU[rec['v']],
        'verdictKey': rec['v'],
        'meta': [
            {'k': 'Сектор', 'v': f'{sec["code"]} · {sec["name"]}'},
            {'k': 'Сформирован', 'v': rec['ts']},
            {'k': 'Автор', 'v': 'ИИ-модуль состояния (макет генерации)'},
            {'k': SENT_KEY, 'v': sent_full(rec.get('sent'))},
            {'k': 'Канал связи', 'v': 'макет, реальной передачи нет'},
            {'k': 'Анализ', 'v': '#' + pad(rec['id'])},
        ],
        'sections': [
            {'h': 'Заключение',
             't': _conclusion(VERDICT_RU[rec['v']], texts['summary'])},
            {'h': 'Входные параметры', 't': params},
            {'h': 'Оценки',
             't': (f'RiskScore {rec["risk"]} из 16 '
                   f'({RISK_LEVEL_RU[rec["level"]].lower()}); '
                   f'ExtinctionScore {rec["ext"]} из 8 '
                   f'({EXT_LEVEL_RU[rec["extLevel"]].lower()}). '
                   f'Уверенность оценки {rec["conf"]} %.')},
            {'h': 'Ограничения', 't': limits(rec.get('texts_source', 'rules'),
                                             rec.get('texts_model', 'rules-v0.1'))},
        ],
        'intro': texts['rec_intro'],
        'steps': texts['rec_steps'],
    }


def with_sent(doc: dict[str, Any], sent: str | None) -> dict[str, Any]:
    """Обновляет строку «Передача» в сохранённом документе (§11.4)."""
    out = dict(doc)
    out['meta'] = [{'k': m['k'], 'v': sent_full(sent)} if m['k'] == SENT_KEY else m
                   for m in doc['meta']]
    return out


def report_txt(d: dict[str, Any]) -> str:
    """§11.3 — формат TXT. Отдаётся через GET /api/reports/{id}.txt"""
    lines = [
        f'ОТЧЁТ {d["no"]}',
        f'Сектор: {d["title"]}',
        f'Заключение: {d["verdict"]}',
        '',
        *[f'{m["k"]}: {m["v"]}' for m in d['meta']],
        '',
    ]
    for s in d['sections']:
        lines += [s['h'].upper(), s['t'], '']
    lines += ['РЕКОМЕНДАЦИИ', d['intro']]
    lines += [f'{s["n"]}. {s["title"]} — {s["detail"]}' for s in d['steps']]
    return '\n'.join(lines)


CSV_HEAD = ('id,time,sector,material_type,thickness_mm,gravity,oxygen_percent,air_flow_cm_s,'
            'temperature_C,time_s,risk_score,risk_level,extinction_score,extinction_probability')


def history_csv(hist: list[dict[str, Any]]) -> str:
    """§16.2 — выгрузка истории в CSV (тот же порядок столбцов, что у клиента)."""
    rows = []
    for r in hist:
        p = r['p']
        rows.append(','.join(str(x) for x in [
            r['id'], r['ts'], r['sector'], p['material'], f1(p['thickness']), p['gravity'],
            f1(p['o2']), f1(p['flow']), f1(p['temp']), f1(p['time']),
            r['risk'], r['level'], r['ext'], r['extLevel'],
        ]))
    return '\n'.join([CSV_HEAD, *rows])
