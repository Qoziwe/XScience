"""
Распознавание фото пламени (§17.3).

Модель заполняет те же три признака, что оператор ставит руками
(размер / яркость / форма), строго из словаря §17.3. Это наблюдение, а не
измерение: в расчёт риска и затухания признаки не входят, вердикт от них
не зависит. Разметку оператора распознавание не затирает — хранится отдельно.
"""
from __future__ import annotations

from typing import Any

from . import config
from .base import ImagePart, LlmError, TextPart
from .client import complete_json

#: §17.3 — допустимые значения признаков.
VOCAB: dict[str, tuple[str, ...]] = {
    'size': ('малое', 'среднее', 'большое'),
    'brightness': ('тусклое', 'умеренное', 'яркое'),
    'shape': ('вытянутое', 'округлое'),
}

SYSTEM = """\
Ты описываешь снимок пламени с борта космического корабля для карточки
наблюдения. Отвечаешь только тем, что видно на снимке.

Правила:
1. Значения выбираешь строго из словаря, своих слов не придумываешь:
   size: малое | среднее | большое
   brightness: тусклое | умеренное | яркое
   shape: вытянутое | округлое
2. Если на снимке нет пламени или кадр непригоден — все три поля null,
   а в note одним предложением сказано, что видно.
3. Не оцениваешь опасность, не даёшь рекомендаций, не называешь чисел:
   риск считает инженерный расчёт, а не ты.
4. note — одно короткое предложение по-русски о том, что на снимке.

Ответ — только объект JSON:
{"size": "...|null", "brightness": "...|null", "shape": "...|null",
 "note": "одно предложение", "flame_visible": true|false}"""

PROMPT = 'Опиши пламя на снимке по карточке наблюдения.'


def validate(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise LlmError('ответ не объект')
    out: dict[str, Any] = {}
    for key, allowed in VOCAB.items():
        value = data.get(key)
        if value is None or value == '':
            out[key] = None
            continue
        if not isinstance(value, str):
            raise LlmError(f'поле {key} не строка')
        value = value.strip().lower()
        if value not in allowed:
            raise LlmError(f'поле {key}: «{value}» вне словаря §17.3')
        out[key] = value
    note = data.get('note')
    if not isinstance(note, str) or not note.strip():
        raise LlmError('пустое поле note')
    out['note'] = ' '.join(note.split())[:300]
    out['flame_visible'] = bool(data.get('flame_visible',
                                         any(out[k] for k in VOCAB)))
    if not out['flame_visible']:
        for key in VOCAB:
            out[key] = None
    return out


def available() -> bool:
    return config.load('vision') is not None


def recognize(image_bytes: bytes, mime: str, logger=None) -> dict[str, Any]:
    """Признаки по снимку. Нет настроек или сбой модели — LlmError."""
    import base64

    cfg = config.load('vision')
    if not cfg:
        raise LlmError('распознавание не настроено (XSCI_AI_VISION_*)')
    parts = [ImagePart(mime, base64.b64encode(image_bytes).decode()), TextPart(PROMPT)]
    try:
        data = complete_json(SYSTEM, parts, cfg)
    except LlmError:
        raise
    except Exception as e:  # pragma: no cover
        raise LlmError(f'сбой распознавания: {e}') from e
    out = validate(data)
    out['model'] = cfg.label()
    if logger:
        logger.info('фото распознано моделью %s', cfg.label())
    return out
