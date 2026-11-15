#!/usr/bin/env python3
"""
Dataset-extension generator (§19) → app/data/dataset_extra.csv.

Why: the original 30 rows fail the §17.1 checks — a single risk_level class,
no rows with gravity = earth, an invalid data_source, and thickness rigidly
tied to the material (§19.3). This script adds rows where risk_level and
gravity vary, and data_source is valid per the §19.1 schema.

HONEST LIMITATION: the risk_level and extinction_probability labels are
computed by the §14 formulas, so the dataset remains `simulated`. A model
trained on it reproduces the rules, not independent observations, and is not
proof of the underlying physics. The flame_size_cm, flame_spread_rate_cm_s,
and expected_result fields are left empty: no rule is defined for them
(§19.1), and values must not be invented for the dataset.

Usage: python3 scripts/gen_dataset.py [--rows 90] [--seed 20261114]
The result is deterministic for a given seed.
"""
from __future__ import annotations

import argparse
import csv
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.dataset import COLUMNS, EXTRA_CSV  # noqa: E402
from app.domain.reference import MATERIALS, RANGES, STEPS  # noqa: E402
from app.domain.scoring import score  # noqa: E402

GRAVITIES = ('earth', 'microgravity')
LEVELS = ('low', 'medium', 'high')
DATA_SOURCE = 'simulated'


def grid(key: str, rnd: random.Random) -> float:
    """A random value on the UI's step grid (§9.2) — as if entered by an operator."""
    lo, hi = RANGES[key]
    step = STEPS[key]
    steps = int(round((hi - lo) / step))
    value = lo + step * rnd.randint(0, steps)
    return round(value, 2)


def sample(rnd: random.Random) -> dict:
    return {
        'material': rnd.choice(MATERIALS)['code'],
        'desc': '',
        'thickness': grid('thickness', rnd),
        'gravity': rnd.choice(GRAVITIES),
        'o2': grid('o2', rnd),
        'flow': grid('flow', rnd),
        'temp': grid('temp', rnd),
        'time': grid('time', rnd),
    }


#: Materials with base risk 2 — only these can reach the "low" level.
LOW_RISK_MATERIALS = [m['code'] for m in MATERIALS if m['risk'] == 2]


def sample_low_risk(rnd: random.Random) -> dict:
    """
    Targeted sampling for the "low" level.
    R ≤ 3 is reachable by only a single family of conditions (§16.4 — the scale
    is skewed toward "high"): a material with base risk 2, oxygen below 16%,
    zero flow, temperature no higher than 50 °C, burning no longer than 10 s,
    Earth gravity. Random sampling over the full grid almost never lands in
    this region, so rows of this class are collected separately.
    """
    return {
        'material': rnd.choice(LOW_RISK_MATERIALS),
        'desc': '',
        'thickness': grid('thickness', rnd),
        'gravity': 'earth',
        'o2': round(13 + 0.5 * rnd.randint(0, 5), 2),    # 13 … 15.5
        'flow': 0,
        'temp': 20 + 5 * rnd.randint(0, 6),              # 20 … 50
        'time': rnd.randint(0, 10),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--rows', type=int, default=90, help='how many rows to generate')
    ap.add_argument('--seed', type=int, default=20261114)
    ap.add_argument('--out', type=Path, default=EXTRA_CSV)
    ap.add_argument('--tries', type=int, default=200000)
    args = ap.parse_args()

    rnd = random.Random(args.seed)
    # Quotas per (risk_level, extinction_probability) pair: the dataset must
    # cover every reachable combination, not just "high/high".
    combos = [(r, e) for r in LEVELS for e in LEVELS]
    quota = max(1, args.rows // len(combos))
    picked: dict[tuple[str, str], list[dict]] = {c: [] for c in combos}
    seen: set[tuple] = set()

    for i in range(args.tries):
        if sum(len(v) for v in picked.values()) >= args.rows:
            break
        # Every fourth candidate comes from the targeted sample, otherwise the
        # "low" class would never make it into the dataset (see sample_low_risk).
        need_low = any(len(picked[c]) < quota for c in combos if c[0] == 'low')
        p = sample_low_risk(rnd) if (need_low and i % 4 == 0) else sample(rnd)
        s = score(p)
        combo = (s['level'], s['extLevel'])
        bucket = picked[combo]
        if len(bucket) >= quota:
            continue
        key = (p['material'], p['thickness'], p['gravity'], p['o2'], p['flow'],
               p['temp'], p['time'])
        if key in seen:
            continue
        seen.add(key)
        bucket.append({'p': p, 's': s})

    rows = [item for combo in combos for item in picked[combo]]
    # Top up the remainder without the quota constraint: rare combinations
    # (e.g. low/low) may be unreachable under the §14 scale.
    for _ in range(args.tries):
        if len(rows) >= args.rows:
            break
        p = sample(rnd)
        key = (p['material'], p['thickness'], p['gravity'], p['o2'], p['flow'],
               p['temp'], p['time'])
        if key in seen:
            continue
        seen.add(key)
        rows.append({'p': p, 's': score(p)})

    rows.sort(key=lambda r: (r['s']['level'], r['s']['extLevel'], r['p']['material']))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(COLUMNS))
        w.writeheader()
        for r in rows:
            p, s = r['p'], r['s']
            w.writerow({
                'material_type': p['material'],
                'thickness_mm': p['thickness'],
                'gravity': p['gravity'],
                'oxygen_percent': p['o2'],
                'air_flow_cm_s': p['flow'],
                'temperature_C': p['temp'],
                'time_s': int(p['time']),
                'flame_size_cm': '',            # no rule defined (§19.1)
                'flame_spread_rate_cm_s': '',   # no rule defined (§19.1)
                'risk_level': s['level'],
                'extinction_probability': s['extLevel'],
                'expected_result': '',          # no rule defined (§19.1)
                'data_source': DATA_SOURCE,
            })

    dist: dict[str, int] = {}
    for r in rows:
        k = f'{r["s"]["level"]}/{r["s"]["extLevel"]}'
        dist[k] = dist.get(k, 0) + 1
    earth = sum(1 for r in rows if r['p']['gravity'] == 'earth')
    print(f'{args.out}: {len(rows)} rows, seed {args.seed}')
    print('  risk/ext:', ', '.join(f'{k}={v}' for k, v in sorted(dist.items())))
    print(f'  gravity=earth: {earth}, risk_level classes: '
          f'{len({r["s"]["level"] for r in rows})}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
