"""
ИИ-генерация текстов отчёта (§2.2, §15).

Модель получает уже посчитанные сервером баллы и вердикт и пишет только
прозу: заключение, объяснение, вводку и шаги рекомендаций. Числа, уровни и
вердикт она изменить не может — они в ответе не участвуют (§18.3).

Любая неудача (нет настроек, таймаут, непригодный ответ) — не ошибка запроса:
возвращаются детерминированные тексты правил §15, а в записи анализа
остаётся честный `texts_source: "rules"`.
"""
from __future__ import annotations

from typing import Any

from ...domain.format import f1
from ...domain.reference import (
    EXT_LEVEL_RU, MAT, RISK_LEVEL_RU, SEC, VERDICT_RU, gravity_ru,
)
from ...domain.scoring import Params, Scores, confidence_note
from ...domain.texts import explain, notes_of, recommendations, summary_of
from . import config
from .base import LlmError, TextPart
from .client import complete_json

SYSTEM = """\
Ты — бортовой ИИ-модуль оценки пожарной обстановки на космическом корабле.
Пишешь разделы отчёта для оператора и для Земли.

Жёсткие правила:
1. Баллы, уровни, вердикт и уверенность уже посчитаны инженерным расчётом и
   даны тебе как факты. Не пересчитывай, не оспаривай и не меняй их. Не
   называй других чисел, кроме приведённых во входных данных.
2. Не выдумывай оборудование, системы, регламенты, названия отсеков и
   показания, которых нет во входных данных.
3. Текст должен соответствовать вердикту: при «Безопасно» не требуй
   экстренных действий, при «Опасно» не успокаивай.
4. Язык — русский, тон — сухой бортовой протокол, без воды и без обращений.
   Никакого маркдауна, эмодзи и заголовков внутри значений.
   Не начинай summary со слова-вердикта («Безопасно», «Требует внимания»,
   «Опасно») — в отчёте вердикт стоит перед заключением отдельной строкой.
5. Учитывай микрогравитацию, если она указана: расплав собирается в
   горящие капли, поток воздуха определяет подпитку пламени, затухание
   может быть обманчивым — после срыва возможно повторное воспламенение.

Ответ — только объект JSON, без пояснений вокруг, строго такой формы:
{
  "summary":   "заключение, 1-3 предложения",
  "why":       "почему такой уровень риска, 1-3 предложения",
  "why_ext":   "почему такая вероятность затухания, 1-2 предложения",
  "rec_intro": "вводка к рекомендациям, 1-2 предложения",
  "rec_steps": [{"title": "действие в повелительном наклонении",
                 "detail": "зачем и как, 1-2 предложения"}]
}
Шагов от 2 до 8, в порядке выполнения. Последним шагом — подтверждение
приёма отчёта на Земле."""

#: Границы пригодности ответа: за ними текст в отчёт не пускаем.
LIMITS = {'summary': (40, 700), 'why': (30, 700), 'why_ext': (20, 500),
          'rec_intro': (30, 600)}
STEPS_RANGE = (2, 8)
TITLE_MAX = 140
DETAIL_MAX = 500


def rules_texts(p: Params, s: Scores, sector_id: str, v: str) -> dict[str, Any]:
    """Детерминированные тексты §15 — и штатный результат, и фолбэк для ИИ."""
    ex = explain(p, s)
    rc = recommendations(p, s, sector_id, v)
    return {
        'summary': summary_of(s),
        'why': ex['why'],
        'why_ext': ex['why_ext'],
        'rec_intro': rc['intro'],
        'rec_steps': rc['steps'],
    }


def facts(p: Params, s: Scores, sector_id: str, v: str, conf: int) -> str:
    """Входные данные для модели: параметры, баллы и вердикт как факты."""
    sec = SEC[sector_id]
    t = s['t']
    notes = notes_of(p, s)
    return '\n'.join([
        f'Сектор: {sec["code"]} — {sec["name"]}. {sec["desc"]}',
        f'Материал: {MAT[p["material"]]["label"]}'
        + (f' (описание оператора: {p["desc"]})' if p.get('desc') else ''),
        f'Толщина: {f1(p["thickness"])} мм',
        f'Кислород: {f1(p["o2"])} %',
        f'Поток воздуха: {f1(p["flow"])} см/с',
        f'Температура: {f1(p["temp"])} °C',
        f'Время горения: {f1(p["time"])} с',
        f'Гравитация: {gravity_ru(p["gravity"])}',
        '',
        f'RiskScore: {s["risk"]} из 16 — уровень {RISK_LEVEL_RU[s["level"]].lower()}',
        f'  слагаемые: материал {t["mat"]}, кислород {t["o2"]}, поток {t["flow"]}, '
        f'температура {t["temp"]}, время {t["time"]}, гравитация {t["grav"]}',
        f'ExtinctionScore: {s["ext"]} из 8 — вероятность затухания '
        f'{EXT_LEVEL_RU[s["extLevel"]].lower()}',
        f'  слагаемые: дефицит кислорода {t["od"]}, слабый поток {t["lf"]}, '
        f'тонкий материал {t["th"]}',
        f'Вердикт: {VERDICT_RU[v]}',
        f'Уверенность оценки: {conf} %. {confidence_note(p)}',
        '',
        'Допущения расчёта: ' + '; '.join(n['text'] for n in notes),
    ])


def validate(data: Any) -> dict[str, Any]:
    """Пригоден ли ответ модели. Непригодный — LlmError, уходим на правила."""
    if not isinstance(data, dict):
        raise LlmError('ответ не объект')
    out: dict[str, Any] = {}
    for key, (lo, hi) in LIMITS.items():
        value = data.get(key)
        if not isinstance(value, str):
            raise LlmError(f'поле {key} не строка')
        value = ' '.join(value.split())
        if not lo <= len(value) <= hi:
            raise LlmError(f'поле {key}: длина {len(value)} вне [{lo}, {hi}]')
        out[key] = value

    steps = data.get('rec_steps')
    if not isinstance(steps, list) or not STEPS_RANGE[0] <= len(steps) <= STEPS_RANGE[1]:
        raise LlmError('rec_steps: ожидается 2–8 шагов')
    clean: list[dict[str, str]] = []
    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            raise LlmError('шаг не объект')
        title = ' '.join(str(step.get('title', '')).split())
        detail = ' '.join(str(step.get('detail', '')).split())
        if not title or len(title) > TITLE_MAX:
            raise LlmError(f'шаг {i + 1}: пустой или слишком длинный title')
        if not detail or len(detail) > DETAIL_MAX:
            raise LlmError(f'шаг {i + 1}: пустой или слишком длинный detail')
        # Нумерация — серверная, модель её не задаёт (§15.3).
        clean.append({'n': str(i + 1).zfill(2), 'title': title, 'detail': detail})
    out['rec_steps'] = clean
    return out


def generate(p: Params, s: Scores, sector_id: str, v: str, conf: int,
             logger=None) -> tuple[dict[str, Any], str, str]:
    """
    Тексты для записи анализа.
    Возвращает (тексты, источник 'llm'|'rules', версия модуля текстов).
    """
    fallback = rules_texts(p, s, sector_id, v)
    cfg = config.load('texts')
    if not cfg:
        return fallback, 'rules', 'rules-v0.1'
    try:
        data = complete_json(SYSTEM, [TextPart(facts(p, s, sector_id, v, conf))], cfg)
        return validate(data), 'llm', cfg.label()
    except LlmError as e:
        if logger:
            logger.warning('ИИ-тексты недоступны, применены правила §15: %s', e)
        return fallback, 'rules', 'rules-v0.1'
    except Exception as e:  # pragma: no cover — чужой ответ не должен ронять запрос
        if logger:
            logger.exception('ИИ-тексты: неожиданная ошибка, применены правила: %s', e)
        return fallback, 'rules', 'rules-v0.1'
