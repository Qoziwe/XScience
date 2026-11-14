"""
Google AI Studio / Gemini, нативный эндпоинт
`POST {base_url}/v1beta/models/{model}:generateContent?key=…`.

Ключ AI Studio передаётся query-параметром, поэтому URL никогда не пишется
в логи и в текст ошибок (см. http._host).
"""
from __future__ import annotations

import urllib.parse
from typing import Any

from ..base import LlmError, Part, ProviderConfig, TextPart
from ..http import post_json

NAME = 'google'
DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'


def _parts(parts: list[Part]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in parts:
        if isinstance(p, TextPart):
            out.append({'text': p.text})
        else:
            out.append({'inline_data': {'mime_type': p.media_type, 'data': p.data_b64}})
    return out


def complete(system: str, parts: list[Part], cfg: ProviderConfig) -> str:
    if not cfg.api_key:
        raise LlmError('для google нужен api_key (ключ AI Studio)')
    generation: dict[str, Any] = {'maxOutputTokens': cfg.max_tokens}
    extra = dict(cfg.extra)
    generation.update(extra.pop('generationConfig', {}))
    payload: dict[str, Any] = {
        'contents': [{'role': 'user', 'parts': _parts(parts)}],
        'systemInstruction': {'parts': [{'text': system}]},
        'generationConfig': generation,
        **extra,
    }
    base = (cfg.base_url or DEFAULT_BASE_URL).rstrip('/')
    url = (f'{base}/v1beta/models/{urllib.parse.quote(cfg.model)}:generateContent'
           f'?key={urllib.parse.quote(cfg.api_key)}')
    data = post_json(url, payload, {}, cfg.timeout_s)

    candidates = data.get('candidates')
    if not isinstance(candidates, list) or not candidates:
        raise LlmError(f'ответ без candidates: {str(data)[:200]}')
    content = candidates[0].get('content') or {}
    text = ''.join(p.get('text', '') for p in content.get('parts', [])
                   if isinstance(p, dict))
    if not text.strip():
        raise LlmError(f'пустой ответ (finishReason={candidates[0].get("finishReason")})')
    return text
