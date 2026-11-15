"""Shared id/hash helpers used across services."""
from __future__ import annotations

import hashlib
import secrets


def new_id(prefix: str) -> str:
    return f'{prefix}_{secrets.token_hex(8)}'


def body_hash(raw: bytes) -> str:
    """Fingerprint of the request body for the idempotency key (§18.3)."""
    return hashlib.sha256(raw or b'').hexdigest()
