"""
Provider-independent interface to the language model.

The job of this layer is for the AI source to be configured, not code-edited:
the same call is served by OpenAI-compatible gateways (OpenRouter and any
other router, Ollama, LM Studio, vLLM, Together, Groq…), the Anthropic
Messages API, and Google AI Studio (Gemini). Adapters live in providers/.

A message is described neutrally (`TextPart` / `ImagePart`), and each adapter
translates it into its own API's format.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class TextPart:
    text: str


@dataclass(frozen=True)
class ImagePart:
    """Image for a vision model: base64 bytes + MIME type."""
    media_type: str
    data_b64: str


Part = TextPart | ImagePart


@dataclass
class ProviderConfig:
    """Settings for a single model call. The key never ends up in logs or responses."""
    provider: str
    model: str
    api_key: str = ''
    base_url: str = ''
    timeout_s: float = 25.0
    max_tokens: int = 2000
    #: Arbitrary request parameters for a specific API (temperature,
    #: effort, reasoning, response_format, etc.) — set as JSON in the config.
    extra: dict[str, Any] = field(default_factory=dict)

    def label(self) -> str:
        """Identifier for the model_version field in the analysis record."""
        return f'{self.provider}:{self.model}'


class LlmError(RuntimeError):
    """The model is unavailable or returned an unusable result."""


class LlmProvider(Protocol):
    """One method: get the response text for a system prompt and message."""

    def complete(self, system: str, parts: list[Part], cfg: ProviderConfig) -> str: ...
