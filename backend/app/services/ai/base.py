"""
Провайдер-независимый интерфейс к языковой модели.

Задача слоя — чтобы источник ИИ подключался конфигом, а не правкой кода:
один и тот же вызов обслуживают OpenAI-совместимые шлюзы (OpenRouter и любой
другой роутер, Ollama, LM Studio, vLLM, Together, Groq…), Anthropic Messages
API и Google AI Studio (Gemini). Адаптеры лежат в providers/.

Сообщение описывается нейтрально (`TextPart` / `ImagePart`), каждый адаптер
переводит его в формат своего API.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class TextPart:
    text: str


@dataclass(frozen=True)
class ImagePart:
    """Изображение для vision-модели: байты в base64 + MIME-тип."""
    media_type: str
    data_b64: str


Part = TextPart | ImagePart


@dataclass
class ProviderConfig:
    """Настройки одного обращения к модели. Ключ в логи и ответы не попадает."""
    provider: str
    model: str
    api_key: str = ''
    base_url: str = ''
    timeout_s: float = 25.0
    max_tokens: int = 2000
    #: Произвольные параметры запроса для конкретного API (temperature,
    #: effort, reasoning, response_format и т.п.) — задаются JSON в конфиге.
    extra: dict[str, Any] = field(default_factory=dict)

    def label(self) -> str:
        """Идентификатор для поля model_version в записи анализа."""
        return f'{self.provider}:{self.model}'


class LlmError(RuntimeError):
    """Модель недоступна или ответила непригодным результатом."""


class LlmProvider(Protocol):
    """Один метод: получить текст ответа на системный промпт и сообщение."""

    def complete(self, system: str, parts: list[Part], cfg: ProviderConfig) -> str: ...
