"""
Anthropic Messages API (`POST {base_url}/v1/messages`).

Шейп запроса и блок изображения — по официальной документации Messages API:
заголовки x-api-key + anthropic-version, системный промпт отдельным полем
`system`, картинка блоком `{"type":"image","source":{"type":"base64",…}}`.
Если проект когда-нибудь станет Anthropic-only, этот адаптер заменяется
официальным SDK `anthropic`; пока слой провайдер-нейтральный и зависимостей нет.
"""
from __future__ import annotations

from typing import Any

from ..base import LlmError, Part, ProviderConfig, TextPart
from ..http import post_json

NAME = 'anthropic'
DEFAULT_BASE_URL = 'https://api.anthropic.com'
API_VERSION = '2023-06-01'


def _content(parts: list[Part]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in parts:
        if isinstance(p, TextPart):
            out.append({'type': 'text', 'text': p.text})
        else:
            out.append({'type': 'image', 'source': {
                'type': 'base64', 'media_type': p.media_type, 'data': p.data_b64}})
    return out


def complete(system: str, parts: list[Part], cfg: ProviderConfig) -> str:
    if not cfg.api_key:
        raise LlmError('для anthropic нужен api_key')
    payload: dict[str, Any] = {
        'model': cfg.model,
        'max_tokens': cfg.max_tokens,
        'system': system,
        'messages': [{'role': 'user', 'content': _content(parts)}],
        **cfg.extra,
    }
    base = (cfg.base_url or DEFAULT_BASE_URL).rstrip('/')
    data = post_json(base + '/v1/messages', payload, {
        'x-api-key': cfg.api_key,
        'anthropic-version': API_VERSION,
    }, cfg.timeout_s)

    blocks = data.get('content')
    if not isinstance(blocks, list):
        raise LlmError(f'ответ без content: {str(data)[:200]}')
    text = ''.join(b.get('text', '') for b in blocks
                   if isinstance(b, dict) and b.get('type') == 'text')
    if not text.strip():
        # stop_reason refusal или ответ только из thinking-блоков
        raise LlmError(f'пустой текст в ответе (stop_reason={data.get("stop_reason")})')
    return text
