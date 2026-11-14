#!/usr/bin/env python3
"""
Генератор расширения набора данных (§19) → app/data/dataset_extra.csv.

Зачем: исходные 30 строк не проходят проверки §17.1 — один класс risk_level,
нет строк с gravity = earth, недопустимый data_source, толщина жёстко
привязана к материалу (§19.3). Этот скрипт добавляет строки, в которых
risk_level и gravity варьируются, а data_source допустим по схеме §19.1.

ЧЕСТНОЕ ОГРАНИЧЕНИЕ: метки risk_level и extinction_probability считаются
формулами §14, то есть набор остаётся `simulated`. Модель, обученная на нём,
воспроизводит правила, а не независимые наблюдения, и доказательством
физики не является. Поля flame_size_cm, flame_spread_rate_cm_s и
expected_result остаются пустыми: правило для них не задано (§19.1), а
выдумывать значения в наборе данных нельзя.

Запуск: python3 scripts/gen_dataset.py [--rows 90] [--seed 20261114]
Результат детерминирован при одном и том же seed.
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
    """Случайное значение по шагу интерфейса (§9.2) — как если бы его ввёл оператор."""
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


#: Материалы с базовым риском 2 — только с ними достижим уровень «низкий».
LOW_RISK_MATERIALS = [m['code'] for m in MATERIALS if m['risk'] == 2]


def sample_low_risk(rnd: random.Random) -> dict:
    """
    Направленная выборка для уровня «низкий».
    R ≤ 3 достижим единственным семейством условий (§16.4 — шкала смещена
    к «высокому»): материал с базовым риском 2, кислород ниже 16 %, поток 0,
    температура не выше 50 °C, горение не дольше 10 с, Земля. Случайный
    перебор по всей сетке в эту область практически не попадает, поэтому
    строки этого класса набираются отдельно.
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
    ap.add_argument('--rows', type=int, default=90, help='сколько строк сгенерировать')
    ap.add_argument('--seed', type=int, default=20261114)
    ap.add_argument('--out', type=Path, default=EXTRA_CSV)
    ap.add_argument('--tries', type=int, default=200000)
    args = ap.parse_args()

    rnd = random.Random(args.seed)
    # Квоты по парам (risk_level, extinction_probability): набор должен
    # покрывать все достижимые сочетания, а не только «high/high».
    combos = [(r, e) for r in LEVELS for e in LEVELS]
    quota = max(1, args.rows // len(combos))
    picked: dict[tuple[str, str], list[dict]] = {c: [] for c in combos}
    seen: set[tuple] = set()

    for i in range(args.tries):
        if sum(len(v) for v in picked.values()) >= args.rows:
            break
        # Каждый четвёртый кандидат — из направленной выборки, иначе класс
        # «низкий» в набор не попадёт (см. sample_low_risk).
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
    # Добираем остаток, не ограничивая себя квотой: редкие сочетания
    # (например low/low) могут быть недостижимы по шкале §14.
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
                'flame_size_cm': '',            # правило не задано (§19.1)
                'flame_spread_rate_cm_s': '',   # правило не задано (§19.1)
                'risk_level': s['level'],
                'extinction_probability': s['extLevel'],
                'expected_result': '',          # правило не задано (§19.1)
                'data_source': DATA_SOURCE,
            })

    dist: dict[str, int] = {}
    for r in rows:
        k = f'{r["s"]["level"]}/{r["s"]["extLevel"]}'
        dist[k] = dist.get(k, 0) + 1
    earth = sum(1 for r in rows if r['p']['gravity'] == 'earth')
    print(f'{args.out}: {len(rows)} строк, seed {args.seed}')
    print('  risk/ext:', ', '.join(f'{k}={v}' for k, v in sorted(dist.items())))
    print(f'  gravity=earth: {earth}, классов risk_level: '
          f'{len({r["s"]["level"] for r in rows})}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
