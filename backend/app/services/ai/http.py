"""JSON over HTTP using the standard library — so the backend has no dependencies."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .base import LlmError


def post_json(url: str, payload: dict[str, Any], headers: dict[str, str],
              timeout_s: float) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        **headers,
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        with e:  # close the connection, otherwise a ResourceWarning is left behind
            detail = e.read().decode('utf-8', 'replace')[:500]
        raise LlmError(f'HTTP {e.code} from {_host(url)}: {detail}') from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise LlmError(f'cannot reach {_host(url)}: {e}') from e
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise LlmError(f'{_host(url)} did not return JSON: {raw[:200]}') from e
    if not isinstance(data, dict):
        raise LlmError(f'{_host(url)} did not return a JSON object')
    return data


def _host(url: str) -> str:
    """Host only — so a key from the query string never ends up in the error message."""
    try:
        return urllib.parse.urlsplit(url).netloc or url
    except Exception:  # pragma: no cover
        return 'the provider'
