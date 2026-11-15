"""
Risk, extinction, verdict, and confidence calculation.
Port of frontend/src/domain/scoring.ts; FUNCTIONAL_SPEC.md §14 is the single
source of truth. Server-side calculation module: the client never sends scores (§18.3).
"""
from __future__ import annotations

from typing import TypedDict

from .reference import MAT


class Params(TypedDict):
    """Numeric analysis parameters (§4.2, prototype field names)."""
    material: str
    desc: str
    thickness: float
    o2: float
    flow: float
    gravity: str
    temp: float
    time: float


class PartialScores(TypedDict):
    mat: int
    o2: int
    flow: int
    temp: int
    time: int
    grav: int
    od: int
    lf: int
    th: int


class Scores(TypedDict):
    t: PartialScores
    risk: int
    ext: int
    level: str
    extLevel: str


# §14.1 — partial risk scores.
def oxygen_risk(o2: float) -> int:
    return 0 if o2 < 16 else 1 if o2 <= 18 else 2 if o2 <= 21 else 3


def flow_risk(v: float) -> int:
    return 1 if v == 0 else 2 if v <= 5 else 3 if v <= 15 else 2


def temperature_risk(t: float) -> int:
    return 0 if t <= 50 else 1 if t <= 100 else 2 if t <= 200 else 3


def time_risk(s: float) -> int:
    return 0 if s <= 10 else 1 if s <= 30 else 2 if s <= 60 else 3


def gravity_risk(g: str) -> int:
    return 1 if g == 'microgravity' else 0


# §14.2 — partial extinction scores.
def oxygen_deficit(o2: float) -> int:
    return 3 if o2 < 16 else 2 if o2 < 18 else 1 if o2 < 19 else 0


def low_flow_penalty(v: float) -> int:
    return 2 if v < 1 else 1 if v < 3 else 0


def thickness_bonus(mm: float) -> int:
    return 3 if mm < 0.2 else 2 if mm <= 0.5 else 1 if mm <= 2 else 0


# §14.3 — totals and levels.
def risk_level(r: int) -> str:
    return 'low' if r <= 3 else 'medium' if r <= 6 else 'high'


def extinction_level(e: int) -> str:
    return 'high' if e >= 4 else 'medium' if e >= 2 else 'low'


def score(p: Params) -> Scores:
    t: PartialScores = {
        'mat': MAT[p['material']]['risk'],
        'o2': oxygen_risk(p['o2']),
        'flow': flow_risk(p['flow']),
        'temp': temperature_risk(p['temp']),
        'time': time_risk(p['time']),
        'grav': gravity_risk(p['gravity']),
        'od': oxygen_deficit(p['o2']),
        'lf': low_flow_penalty(p['flow']),
        'th': thickness_bonus(p['thickness']),
    }
    risk = t['mat'] + t['o2'] + t['flow'] + t['temp'] + t['time'] + t['grav']
    ext = t['od'] + t['lf'] + t['th']
    return {'t': t, 'risk': risk, 'ext': ext,
            'level': risk_level(risk), 'extLevel': extinction_level(ext)}


def stability_adjust(ext: int) -> int:
    """§14.4 — flame stability adjustment."""
    return 2 if ext <= 1 else -1 if ext >= 4 else 0


def danger_index(risk: int, ext: int) -> int:
    """§14.4 — danger index D (2..18)."""
    return risk + stability_adjust(ext)


def verdict_of(risk: int, ext: int) -> str:
    """§14.4 — status verdict based on the danger index."""
    d = danger_index(risk, ext)
    return 'high' if d >= 10 else 'medium' if d >= 6 else 'low'


def verdict_of_scores(s: Scores) -> str:
    return verdict_of(s['risk'], s['ext'])


#: §14.5 — uncertain boundaries (16.1). Exact number comparison.
BOUNDARIES: dict[str, tuple[float, ...]] = {
    'o2': (16, 18, 19, 21),
    'flow': (1, 5, 15),
    'temp': (50, 100, 200),
    'time': (10, 30, 60),
    'thickness': (0.5, 2),
}


def on_oxygen_boundary(o2: float) -> bool:
    return o2 in BOUNDARIES['o2'] or (18 < o2 < 19)


def boundary_count(p: Params) -> int:
    n = 0
    if on_oxygen_boundary(p['o2']):
        n += 1
    if p['flow'] in BOUNDARIES['flow']:
        n += 1
    if p['temp'] in BOUNDARIES['temp']:
        n += 1
    if p['time'] in BOUNDARIES['time']:
        n += 1
    if p['thickness'] in BOUNDARIES['thickness']:
        n += 1
    return n


def confidence_of(p: Params) -> int:
    """§14.5 — interface confidence heuristic, 45..94."""
    c = 94
    c -= 8 * boundary_count(p)
    if p['material'] == 'other':
        c -= 14
    if p['o2'] > 30 or p['flow'] > 15:
        c -= 10
    return max(45, min(94, c))


def confidence_reasons(p: Params) -> list[str]:
    """Reasons for the reduced confidence — explanatory text shown below the bar."""
    r: list[str] = []
    bnd = boundary_count(p)
    if bnd:
        r.append(f'{bnd} value(s) on uncertain boundaries (16.1)')
    if p['material'] == 'other':
        r.append('material properties are not specified')
    if p['o2'] > 30 or p['flow'] > 15:
        r.append('values outside verified NASA ranges (16.13)')
    return r


def confidence_codes(p: Params) -> list[str]:
    """Machine-readable reasons for storage in the analysis record (§4.2)."""
    codes: list[str] = []
    if on_oxygen_boundary(p['o2']):
        codes.append('boundary:oxygen_percent')
    if p['flow'] in BOUNDARIES['flow']:
        codes.append('boundary:air_flow_cm_s')
    if p['temp'] in BOUNDARIES['temp']:
        codes.append('boundary:temperature_C')
    if p['time'] in BOUNDARIES['time']:
        codes.append('boundary:time_s')
    if p['thickness'] in BOUNDARIES['thickness']:
        codes.append('boundary:thickness_mm')
    if p['material'] == 'other':
        codes.append('material:other')
    if p['o2'] > 30 or p['flow'] > 15:
        codes.append('outside_nasa_ranges')
    return codes


def confidence_note(p: Params) -> str:
    r = confidence_reasons(p)
    return f'Reduced: {"; ".join(r)}.' if r else 'All readings are within well-defined ranges.'


def risk_zone(n: float) -> str:
    """RiskScore scale zone for a value in 3..16 (§9.7)."""
    return 'low' if n <= 3 else 'medium' if n <= 6 else 'high'
