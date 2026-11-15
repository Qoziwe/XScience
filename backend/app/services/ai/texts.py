"""
AI generation of report texts (§2.2, §15).

The model receives scores and a verdict already computed by the server and
writes only prose: the conclusion, explanation, intro, and recommendation
steps. It cannot change the numbers, levels, or verdict — those are not part
of its response (§18.3).

Any failure (no config, timeout, unusable response) is not a request error:
the deterministic §15 rule-based texts are returned instead, and the analysis
record honestly records `texts_source: "rules"`.
"""
from __future__ import annotations

import re
from typing import Any

from ...domain.format import f1
from ...domain.reference import (
    EXT_LEVEL_RU, MAT, RISK_LEVEL_RU, SEC, VERDICT_RU, gravity_ru,
)
from ...domain.scoring import Params, Scores, confidence_note
from ...domain.texts import explain, notes_of, recommendations, summary_of
from . import config
from .base import LlmError, TextPart
from .client import complete_json

SYSTEM = """\
You are the onboard AI module for assessing fire conditions on a spacecraft.
You write report sections for the operator and for Earth.

Hard rules:
1. Scores, levels, verdict, and confidence have already been computed by the
   engineering calculation and are given to you as facts. Do not recompute,
   dispute, or change them. Do not cite any numbers other than those given in
   the input data.
2. Do not invent equipment, systems, procedures, compartment names, or
   readings that are not present in the input data.
3. The text must match the verdict: for "Safe" do not demand emergency
   action; for "Dangerous" do not reassure.
4. Language — English, tone — dry onboard-protocol style, no filler and no
   direct address. No markdown, emoji, or headings inside values. Do not
   start the summary with the verdict word ("Safe", "Needs Attention",
   "Dangerous") — in the report the verdict appears on its own line before
   the conclusion.
5. Account for microgravity when it is given: melt collects into burning
   droplets, air flow determines flame feed, extinction can be deceptive —
   reignition is possible after the flame goes out.

Respond with a JSON object only, no surrounding explanation, in exactly this
shape:
{
  "summary":   "conclusion, 1-3 sentences",
  "why":       "why this risk level, 1-3 sentences",
  "why_ext":   "why this extinction probability, 1-2 sentences",
  "rec_intro": "intro to the recommendations, 1-2 sentences",
  "rec_steps": [{"title": "action in the imperative mood",
                 "detail": "why and how, 1-2 sentences"}]
}
Between 2 and 8 steps, in execution order. The last step must be confirming
report receipt on Earth."""

#: Acceptability bounds for the response: beyond these the text is rejected.
#: Upper bounds have headroom — models write longer than the §15 rules do,
#: and discarding a substantive response over 50 extra characters is wrong.
LIMITS = {'summary': (40, 1200), 'why': (30, 1200), 'why_ext': (20, 800),
          'rec_intro': (30, 900)}
STEPS_RANGE = (2, 10)
TITLE_MAX = 140
DETAIL_MAX = 600

#: Step numbering that models sometimes add to the title, even though the server adds it.
_STEP_PREFIX = re.compile(r'^\s*(?:step\s*)?\d{1,2}\s*[.):\-–—]\s*', re.IGNORECASE)
#: Markup we asked the model not to use, but which occasionally leaks through.
_MARKUP = re.compile(r'[*`_#]+')


def clean_line(raw: object) -> str:
    """One line of the response: no markup, numbering, quotes, or line breaks."""
    text = ' '.join(str(raw or '').split())
    text = _MARKUP.sub('', text)
    text = _STEP_PREFIX.sub('', text)
    return text.strip().strip('«»"\'').strip()


def trim(text: str, limit: int) -> str:
    """Trim at a word boundary — a short step is better than a lost response."""
    if len(text) <= limit:
        return text
    cut = text[:limit].rstrip()
    space = cut.rfind(' ')
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip(' ,;:.') + '…'


def rules_texts(p: Params, s: Scores, sector_id: str, v: str) -> dict[str, Any]:
    """Deterministic §15 texts — both the standard result and the AI fallback."""
    ex = explain(p, s)
    rc = recommendations(p, s, sector_id, v)
    return {
        'summary': summary_of(s),
        'why': ex['why'],
        'why_ext': ex['why_ext'],
        'rec_intro': rc['intro'],
        'rec_steps': rc['steps'],
    }


def facts(p: Params, s: Scores, sector_id: str, v: str, conf: int) -> str:
    """Input data for the model: parameters, scores, and verdict as facts."""
    sec = SEC[sector_id]
    t = s['t']
    notes = notes_of(p, s)
    return '\n'.join([
        f'Sector: {sec["code"]} — {sec["name"]}. {sec["desc"]}',
        f'Material: {MAT[p["material"]]["label"]}'
        + (f' (operator description: {p["desc"]})' if p.get('desc') else ''),
        f'Thickness: {f1(p["thickness"])} mm',
        f'Oxygen: {f1(p["o2"])} %',
        f'Air flow: {f1(p["flow"])} cm/s',
        f'Temperature: {f1(p["temp"])} °C',
        f'Burn time: {f1(p["time"])} s',
        f'Gravity: {gravity_ru(p["gravity"])}',
        '',
        f'RiskScore: {s["risk"]} of 16 — level {RISK_LEVEL_RU[s["level"]].lower()}',
        f'  terms: material {t["mat"]}, oxygen {t["o2"]}, flow {t["flow"]}, '
        f'temperature {t["temp"]}, time {t["time"]}, gravity {t["grav"]}',
        f'ExtinctionScore: {s["ext"]} of 8 — extinction probability '
        f'{EXT_LEVEL_RU[s["extLevel"]].lower()}',
        f'  terms: oxygen deficit {t["od"]}, weak flow {t["lf"]}, '
        f'thin material {t["th"]}',
        f'Verdict: {VERDICT_RU[v]}',
        f'Assessment confidence: {conf} %. {confidence_note(p)}',
        '',
        'Calculation assumptions: ' + '; '.join(n['text'] for n in notes),
    ])


def validate(data: Any) -> dict[str, Any]:
    """
    Whether the model's response is usable. Formatting is fixed silently
    (markup, numbering, length); substantive defects raise LlmError, and then
    the §15 rules go into the report.
    """
    if not isinstance(data, dict):
        raise LlmError('response is not an object')
    out: dict[str, Any] = {}
    for key, (lo, hi) in LIMITS.items():
        value = data.get(key)
        if not isinstance(value, str):
            raise LlmError(f'field {key} is not a string')
        value = clean_line(value)
        if len(value) < lo:
            raise LlmError(f'field {key}: length {len(value)} is less than {lo}')
        out[key] = trim(value, hi)

    steps = data.get('rec_steps')
    if not isinstance(steps, list) or not STEPS_RANGE[0] <= len(steps) <= STEPS_RANGE[1]:
        got = len(steps) if isinstance(steps, list) else type(steps).__name__
        raise LlmError(f'rec_steps: expected {STEPS_RANGE[0]}–{STEPS_RANGE[1]} steps, got {got}')
    clean: list[dict[str, str]] = []
    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            raise LlmError(f'step {i + 1}: not an object')
        title = clean_line(step.get('title'))
        detail = clean_line(step.get('detail'))
        if not title:
            raise LlmError(f'step {i + 1}: empty title')
        if not detail:
            raise LlmError(f'step {i + 1}: empty detail')
        # Numbering is server-assigned, the model does not set it (§15.3).
        clean.append({'n': str(i + 1).zfill(2), 'title': trim(title, TITLE_MAX),
                      'detail': trim(detail, DETAIL_MAX)})
    out['rec_steps'] = clean
    return out


def generate(p: Params, s: Scores, sector_id: str, v: str, conf: int,
             logger=None) -> tuple[dict[str, Any], str, str]:
    """
    Texts for the analysis record.
    Returns (texts, source 'llm'|'rules', text-module version).
    """
    fallback = rules_texts(p, s, sector_id, v)
    cfg = config.load('texts')
    if not cfg:
        return fallback, 'rules', 'rules-v0.1'
    try:
        data = complete_json(SYSTEM, [TextPart(facts(p, s, sector_id, v, conf))], cfg)
        return validate(data), 'llm', cfg.label()
    except LlmError as e:
        if logger:
            logger.warning('AI texts unavailable, applying §15 rules: %s', e)
        return fallback, 'rules', 'rules-v0.1'
    except Exception as e:  # pragma: no cover — a third-party response must not crash the request
        if logger:
            logger.exception('AI texts: unexpected error, applying rules: %s', e)
        return fallback, 'rules', 'rules-v0.1'
