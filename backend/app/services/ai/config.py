"""
Конфигурация ИИ из окружения.

Общие настройки — XSCI_AI_*; у каждой функции (тексты отчёта, распознавание
фото) можно переопределить любое поле через XSCI_AI_TEXTS_* / XSCI_AI_VISION_*
и выключить её отдельно. Если провайдер не задан, слой выключен и всё
работает на детерминированных правилах §15.
"""
from __future__ import annotations

import json
import os

from .base import ProviderConfig
from .providers import REGISTRY, resolve

#: Функции, у которых может быть свой провайдер и своя модель.
FEATURES = ('texts', 'vision')


def _env(feature: str, key: str, default: str = '') -> str:
    """Значение для функции: сначала XSCI_AI_<FEATURE>_<KEY>, потом XSCI_AI_<KEY>."""
    specific = os.environ.get(f'XSCI_AI_{feature.upper()}_{key}')
    if specific is not None and specific != '':
        return specific
    return os.environ.get(f'XSCI_AI_{key}', default)


def _float(raw: str, default: float) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _int(raw: str, default: int) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _extra(feature: str) -> dict:
    raw = _env(feature, 'EXTRA_JSON', '')
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def _enabled(feature: str) -> bool:
    raw = os.environ.get(f'XSCI_AI_{feature.upper()}', '')
    if raw.strip():
        return raw.strip().lower() in ('1', 'true', 'yes', 'on')
    return True


def load(feature: str) -> ProviderConfig | None:
    """
    Настройки для функции или None, если ИИ для неё не настроен/выключен.
    None — штатная ситуация: вызывающий код уходит на правила.
    """
    if feature not in FEATURES or not _enabled(feature):
        return None
    provider = resolve(_env(feature, 'PROVIDER', 'none'))
    if provider in ('', 'none', 'off', 'rules'):
        return None
    if provider not in REGISTRY:
        return None
    model = _env(feature, 'MODEL', '')
    if not model:
        return None
    return ProviderConfig(
        provider=provider,
        model=model,
        api_key=_env(feature, 'API_KEY'),
        base_url=_env(feature, 'BASE_URL'),
        timeout_s=_float(_env(feature, 'TIMEOUT_S'), 25.0),
        max_tokens=_int(_env(feature, 'MAX_TOKENS'), 2000),
        extra=_extra(feature),
    )


def describe() -> dict[str, str]:
    """Что настроено — для /api/health и вкладки «Модели». Без ключей."""
    out: dict[str, str] = {}
    for feature in FEATURES:
        cfg = load(feature)
        out[feature] = cfg.label() if cfg else 'rules' if feature == 'texts' else 'off'
    return out
