"""
OpenAI-совместимый Chat Completions (`POST {base_url}/chat/completions`).

Этим адаптером подключается почти всё: OpenRouter и прочие роутеры, Groq,
Together, DeepSeek, локальные Ollama / LM Studio / vLLM, а также шлюзы,
которые выставляют OpenAI-совместимый эндпоинт. Отличается только
base_url + model + ключ.
"""
from __future__ import annotations

from typing import Any

from ..base import LlmError, Part, ProviderConfig, TextPart
from ..http import post_json

NAME = 'openai_compat'


def _content(parts: list[Part]) -> Any:
    out: list[dict[str, Any]] = []
    for p in parts:
        if isinstance(p, TextPart):
            out.append({'type': 'text', 'text': p.text})
        else:
            out.append({'type': 'image_url',
                        'image_url': {'url': f'data:{p.media_type};base64,{p.data_b64}'}})
    # Текст без картинок отдаём строкой — так принимают и самые простые шлюзы.
    if len(out) == 1 and out[0]['type'] == 'text':
        return out[0]['text']
    return out


def complete(system: str, parts: list[Part], cfg: ProviderConfig) -> str:
    if not cfg.base_url:
        raise LlmError('для openai_compat нужен base_url (например .../v1)')
    payload: dict[str, Any] = {
        'model': cfg.model,
        'max_tokens': cfg.max_tokens,
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': _content(parts)},
        ],
        **cfg.extra,
    }
    headers = {}
    if cfg.api_key:
        headers['Authorization'] = f'Bearer {cfg.api_key}'
    data = post_json(cfg.base_url.rstrip('/') + '/chat/completions', payload, headers,
                     cfg.timeout_s)

    choices = data.get('choices')
    if not isinstance(choices, list) or not choices:
        raise LlmError(f'ответ без choices: {str(data)[:200]}')
    message = choices[0].get('message') or {}
    content = message.get('content')
    if isinstance(content, list):  # некоторые шлюзы отдают массив блоков
        content = ''.join(b.get('text', '') for b in content if isinstance(b, dict))
    if not isinstance(content, str) or not content.strip():
        raise LlmError('пустой ответ модели')
    return content
