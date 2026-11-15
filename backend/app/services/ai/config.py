"""
AI configuration from the environment.

Shared settings — XSCI_AI_*; each feature (report texts, photo recognition)
can override any field via XSCI_AI_TEXTS_* / XSCI_AI_VISION_* and be disabled
separately. If no provider is set, the layer is disabled and everything runs
on the deterministic §15 rules.
"""
from __future__ import annotations

import json
import os

from .base import ProviderConfig
from .providers import REGISTRY, resolve

#: Features that can each have their own provider and model.
FEATURES = ('texts', 'vision')


def _env(feature: str, key: str, default: str = '') -> str:
    """Value for a feature: first XSCI_AI_<FEATURE>_<KEY>, then XSCI_AI_<KEY>."""
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
    Settings for a feature, or None if AI is not configured/disabled for it.
    None is a normal situation: the calling code falls back to the rules.
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
    """What is configured — for /api/health and the "Models" tab. No keys."""
    out: dict[str, str] = {}
    for feature in FEATURES:
        cfg = load(feature)
        out[feature] = cfg.label() if cfg else 'rules' if feature == 'texts' else 'off'
    return out
