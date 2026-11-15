"""
Flame photo recognition (§17.3).

The model fills in the same three traits the operator sets by hand
(size / brightness / shape), strictly from the §17.3 vocabulary. This is an
observation, not a measurement: these traits are not part of the risk and
extinction calculation, and the verdict does not depend on them. Recognition
does not overwrite the operator's annotation — it is stored separately.
"""
from __future__ import annotations

from typing import Any

from . import config
from .base import ImagePart, LlmError, TextPart
from .client import complete_json

#: §17.3 — allowed trait values.
VOCAB: dict[str, tuple[str, ...]] = {
    'size': ('small', 'medium', 'large'),
    'brightness': ('dim', 'moderate', 'bright'),
    'shape': ('elongated', 'round'),
}

SYSTEM = """\
You describe a photo of a flame from aboard a spacecraft for an observation
card. You answer based only on what is visible in the photo.

Rules:
1. Choose values strictly from the vocabulary, do not invent your own words:
   size: small | medium | large
   brightness: dim | moderate | bright
   shape: elongated | round
2. If there is no flame in the photo or the frame is unusable — all three
   fields are null, and note states in one sentence what is visible.
3. Do not assess danger, give recommendations, or cite numbers: risk is
   computed by the engineering calculation, not by you.
4. note — one short sentence in English about what is in the photo.

Respond with a JSON object only:
{"size": "...|null", "brightness": "...|null", "shape": "...|null",
 "note": "one sentence", "flame_visible": true|false}"""

PROMPT = 'Describe the flame in the photo using the observation card.'


def validate(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise LlmError('response is not an object')
    out: dict[str, Any] = {}
    for key, allowed in VOCAB.items():
        value = data.get(key)
        if value is None or value == '':
            out[key] = None
            continue
        if not isinstance(value, str):
            raise LlmError(f'field {key} is not a string')
        value = value.strip().lower()
        if value not in allowed:
            raise LlmError(f'field {key}: "{value}" is outside the §17.3 vocabulary')
        out[key] = value
    note = data.get('note')
    if not isinstance(note, str) or not note.strip():
        raise LlmError('empty note field')
    out['note'] = ' '.join(note.split())[:300]
    out['flame_visible'] = bool(data.get('flame_visible',
                                         any(out[k] for k in VOCAB)))
    if not out['flame_visible']:
        for key in VOCAB:
            out[key] = None
    return out


def available() -> bool:
    return config.load('vision') is not None


def recognize(image_bytes: bytes, mime: str, logger=None) -> dict[str, Any]:
    """Traits from the photo. No config or model failure — LlmError."""
    import base64

    cfg = config.load('vision')
    if not cfg:
        raise LlmError('recognition is not configured (XSCI_AI_VISION_*)')
    parts = [ImagePart(mime, base64.b64encode(image_bytes).decode()), TextPart(PROMPT)]
    try:
        data = complete_json(SYSTEM, parts, cfg)
    except LlmError:
        raise
    except Exception as e:  # pragma: no cover
        raise LlmError(f'recognition failure: {e}') from e
    out = validate(data)
    out['model'] = cfg.label()
    if logger:
        logger.info('photo recognized by model %s', cfg.label())
    return out
