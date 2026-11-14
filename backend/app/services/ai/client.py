"""Вызов модели: выбор адаптера по конфигу + разбор JSON-ответа."""
from __future__ import annotations

import json
import re
from typing import Any

from .base import LlmError, Part, ProviderConfig
from .providers import REGISTRY

_FENCE = re.compile(r'^\s*```(?:json)?\s*|\s*```\s*$', re.IGNORECASE)


def complete(system: str, parts: list[Part], cfg: ProviderConfig) -> str:
    fn = REGISTRY.get(cfg.provider)
    if not fn:
        raise LlmError(f'неизвестный провайдер: {cfg.provider}')
    return fn(system, parts, cfg)


def complete_json(system: str, parts: list[Part], cfg: ProviderConfig) -> dict[str, Any]:
    """
    Ответ модели как объект JSON. Модели любят обрамлять JSON пояснениями и
    ```-блоками, поэтому разбор терпимый: снимаем рамку, иначе берём самый
    внешний {...}. Непригодный ответ — LlmError, вызывающий код уходит на правила.
    """
    raw = complete(system, parts, cfg).strip()
    for candidate in (_FENCE.sub('', raw), _outermost_object(raw)):
        if not candidate:
            continue
        try:
            value = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    raise LlmError(f'ответ не разобран как JSON: {raw[:200]}')


def _outermost_object(text: str) -> str:
    start, end = text.find('{'), text.rfind('}')
    return text[start:end + 1] if 0 <= start < end else ''
