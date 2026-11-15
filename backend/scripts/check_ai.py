#!/usr/bin/env python3
"""
Checks the configured AI module against a live provider — one request, no DB
and no server. Useful to immediately see, after dropping in a key, whether
the model's response is accepted or the record silently falls back to the §15 rules.

    cd backend
    set -a; . ./.env; set +a         # or export XSCI_AI_* manually
    python3 scripts/check_ai.py                     # report texts
    python3 scripts/check_ai.py --photo flame.jpg   # also recognition §17.3

Exit code 0 — the model's response was accepted; 1 — rejected or the provider
is unavailable (in production this is not a request error: the report will be
written by the §15 rules).
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.scoring import confidence_of, score, verdict_of_scores  # noqa: E402
from app.services.ai import config, texts as ai_texts, vision  # noqa: E402
from app.services.ai.base import LlmError, TextPart  # noqa: E402
from app.services.ai.client import complete_json  # noqa: E402

#: Control example A from §23 — the full calculation is checked against it.
CASE = {'material': 'paper', 'desc': '', 'thickness': 0.5, 'o2': 21, 'flow': 5,
        'gravity': 'microgravity', 'temp': 25, 'time': 30}
SECTOR = 'l1'


def check_texts(verbose: bool) -> bool:
    cfg = config.load('texts')
    if not cfg:
        print('✗ texts: AI is not configured (XSCI_AI_PROVIDER / XSCI_AI_MODEL are empty).')
        print('  Reports will be written by the deterministic §15 rules — this is the normal mode.')
        return False

    s = score(CASE)
    v = verdict_of_scores(s)
    conf = confidence_of(CASE)
    print(f'→ texts: {cfg.label()}, timeout {cfg.timeout_s:g} s')

    started = time.monotonic()
    try:
        raw = complete_json(ai_texts.SYSTEM,
                            [TextPart(ai_texts.facts(CASE, s, SECTOR, v, conf))], cfg)
    except LlmError as e:
        print(f'✗ provider unavailable after {time.monotonic() - started:.1f} s: {e}')
        return False
    elapsed = time.monotonic() - started

    try:
        out = ai_texts.validate(raw)
    except LlmError as e:
        print(f'✗ response rejected ({elapsed:.1f} s): {e}')
        print('  In this case the server will silently fall back to the §15 rules '
              '(texts_source = rules). Fix the prompt or the model.')
        if verbose:
            print(f'  Raw response: {str(raw)[:600]}')
        return False

    print(f'✓ response accepted in {elapsed:.1f} s, {len(out["rec_steps"])} steps')
    print(f'\n  CONCLUSION: {out["summary"]}')
    print(f'\n  RISK: {out["why"]}')
    print(f'\n  EXTINCTION: {out["why_ext"]}')
    print(f'\n  INTRO: {out["rec_intro"]}')
    for step in out['rec_steps']:
        print(f'  {step["n"]}. {step["title"]} — {step["detail"]}')
    print(f'\n  The calculation itself is unchanged: R={s["risk"]} E={s["ext"]} '
          f'verdict={v} confidence={conf} (rules §14).')
    return True


def check_vision(path: Path, verbose: bool) -> bool:
    cfg = config.load('vision')
    if not cfg:
        print('\n✗ recognition: not configured (XSCI_AI_VISION_* / XSCI_AI_*).')
        return False
    if not path.exists():
        print(f'\n✗ recognition: file {path} not found.')
        return False
    mime = 'image/png' if path.suffix.lower() == '.png' else 'image/jpeg'
    print(f'\n→ recognition: {cfg.label()}, photo {path.name}')
    started = time.monotonic()
    try:
        out = vision.recognize(path.read_bytes(), mime)
    except LlmError as e:
        print(f'✗ rejected after {time.monotonic() - started:.1f} s: {e}')
        return False
    print(f'✓ accepted in {time.monotonic() - started:.1f} s: '
          f'size {out["size"]}, brightness {out["brightness"]}, shape {out["shape"]}')
    print(f'  {out["note"]}')
    if verbose:
        print(f'  flame in frame: {out["flame_visible"]}')
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--photo', type=Path, help='photo to test recognition against §17.3')
    ap.add_argument('-v', '--verbose', action='store_true', help='show the raw response')
    args = ap.parse_args()

    print('Configured:', config.describe())
    ok = check_texts(args.verbose)
    if args.photo:
        ok = check_vision(args.photo, args.verbose) and ok
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
