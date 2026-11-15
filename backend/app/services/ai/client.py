"""Model call: pick the adapter from config + parse the JSON response."""
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
        raise LlmError(f'unknown provider: {cfg.provider}')
    return fn(system, parts, cfg)


def complete_json(system: str, parts: list[Part], cfg: ProviderConfig) -> dict[str, Any]:
    """
    The model's response as a JSON object. Models like to wrap JSON in
    explanations and ``` blocks, so parsing is lenient: strip the fence, or
    else take the outermost {...}. An unusable response raises LlmError, and
    the calling code falls back to the rules.
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
    raise LlmError(f'response could not be parsed as JSON: {raw[:200]}')


def _outermost_object(text: str) -> str:
    start, end = text.find('{'), text.rfind('}')
    return text[start:end + 1] if 0 <= start < end else ''
