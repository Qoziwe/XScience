"""Adapter registry. To add your own — drop in a module with complete() and NAME."""
from __future__ import annotations

from typing import Callable

from ..base import Part, ProviderConfig
from . import anthropic, google, openai_compat

Complete = Callable[[str, list[Part], ProviderConfig], str]

REGISTRY: dict[str, Complete] = {
    openai_compat.NAME: openai_compat.complete,
    anthropic.NAME: anthropic.complete,
    google.NAME: google.complete,
}

#: Friendly aliases, so the config can use a service's common name.
ALIASES = {
    'openai': openai_compat.NAME,
    'openrouter': openai_compat.NAME,
    'ollama': openai_compat.NAME,
    'lmstudio': openai_compat.NAME,
    'vllm': openai_compat.NAME,
    'groq': openai_compat.NAME,
    'together': openai_compat.NAME,
    'claude': anthropic.NAME,
    'gemini': google.NAME,
    'aistudio': google.NAME,
    'googleai': google.NAME,
}


def resolve(name: str) -> str:
    key = (name or '').strip().lower()
    return ALIASES.get(key, key)
