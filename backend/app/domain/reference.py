"""Reference tables and enumerations. Port of frontend/src/domain/reference.ts (§3, §9.2, §21)."""
from __future__ import annotations

from typing import Literal, TypedDict

MaterialType = Literal['paper', 'fabric', 'plastic', 'wood', 'wire_insulation', 'other']
Gravity = Literal['earth', 'microgravity']
SectorId = Literal['sh', 'km', 'zh', 'l1', 'l2', 'sk', 'ep']
Level = Literal['low', 'medium', 'high']
SectorStatus = Literal['low', 'medium', 'high', 'none']


class MaterialDef(TypedDict):
    code: str
    label: str
    risk: int


#: §3.1 — display order, as in the table.
MATERIALS: list[MaterialDef] = [
    {'code': 'paper', 'label': 'Paper', 'risk': 3},
    {'code': 'fabric', 'label': 'Fabric', 'risk': 2},
    {'code': 'plastic', 'label': 'Plastic', 'risk': 3},
    {'code': 'wood', 'label': 'Wood', 'risk': 2},
    {'code': 'wire_insulation', 'label': 'Wire Insulation', 'risk': 3},
    {'code': 'other', 'label': 'Other', 'risk': 2},
]
MAT: dict[str, MaterialDef] = {m['code']: m for m in MATERIALS}

#: §3.3 — flow presets for simple mode.
FLOW_PRESETS = [
    {'code': 'none', 'label': 'None', 'value': 0},
    {'code': 'weak', 'label': 'Weak', 'value': 2.5},
    {'code': 'medium', 'label': 'Medium', 'value': 10},
    {'code': 'strong', 'label': 'Strong', 'value': 20},
]

GRAVITY_OPTIONS = [
    {'code': 'earth', 'label': 'Earth', 'short': 'Earth'},
    {'code': 'microgravity', 'label': 'Microgravity', 'short': 'μg'},
]


class SectorDef(TypedDict):
    id: str
    code: str
    name: str
    desc: str
    x: int
    y: int
    w: int
    h: int


#: §3.4 — placeholder layout (16.14). Served via GET /api/sectors.
SECTORS: list[SectorDef] = [
    {'id': 'sh', 'code': 'AL', 'name': 'Airlock', 'desc': 'Docking node and exit hatch.',
     'x': 14, 'y': 95, 'w': 80, 'h': 70},
    {'id': 'km', 'code': 'CM', 'name': 'Command Module', 'desc': 'Control and communication stations.',
     'x': 104, 'y': 80, 'w': 120, 'h': 100},
    {'id': 'zh', 'code': 'HM', 'name': 'Habitation Module', 'desc': 'Crew quarters, galley, rest area.',
     'x': 234, 'y': 60, 'w': 150, 'h': 140},
    {'id': 'l1', 'code': 'LB-1', 'name': 'Laboratory 1', 'desc': 'Scientific equipment and samples.',
     'x': 394, 'y': 40, 'w': 116, 'h': 85},
    {'id': 'l2', 'code': 'LB-2', 'name': 'Laboratory 2', 'desc': 'Scientific equipment and samples.',
     'x': 394, 'y': 135, 'w': 116, 'h': 85},
    {'id': 'sk', 'code': 'ST', 'name': 'Storage', 'desc': 'Cargo, supplies, containers.',
     'x': 520, 'y': 80, 'w': 96, 'h': 100},
    {'id': 'ep', 'code': 'PB', 'name': 'Power Bay', 'desc': 'Power distribution, cable runs.',
     'x': 626, 'y': 95, 'w': 80, 'h': 70},
]
SEC: dict[str, SectorDef] = {s['id']: s for s in SECTORS}


def sector_adjacency() -> dict[str, list[str]]:
    """
    Sector adjacency derived from the diagram's geometry (§3.4), not a separate list:
    sectors at adjacent x coordinates physically border each other, and
    sectors sharing the same x are parallel compartments at the same point in the
    corridor (currently l1/l2) and are also considered adjacent.
    """
    by_x: dict[int, list[str]] = {}
    for s in SECTORS:
        by_x.setdefault(s['x'], []).append(s['id'])
    xs = sorted(by_x)
    adj: dict[str, set[str]] = {s['id']: set() for s in SECTORS}
    for i, x in enumerate(xs):
        group = by_x[x]
        for a in group:
            for b in group:
                if a != b:
                    adj[a].add(b)
        if i:
            for a in by_x[xs[i - 1]]:
                for b in group:
                    adj[a].add(b)
                    adj[b].add(a)
    return {k: sorted(v) for k, v in adj.items()}

#: §3.5 — level labels.
RISK_LEVEL_RU = {'low': 'Low', 'medium': 'Medium', 'high': 'High'}
EXT_LEVEL_RU = {'low': 'Low', 'medium': 'Medium', 'high': 'High'}
VERDICT_RU = {'low': 'Safe', 'medium': 'Needs Attention', 'high': 'Dangerous'}
VERDICT_SUBTITLE = {
    'low': 'conditions do not support flame development',
    'medium': 'development or unstable combustion is possible',
    'high': 'high probability of rapid spread',
}
STATUS_WORD = {'none': 'no data', 'low': 'normal', 'medium': 'caution', 'high': 'danger'}
STATUS_LEGEND = {'none': 'No data', 'low': 'Safe', 'medium': 'Caution', 'high': 'Danger'}

#: §9.2 — numeric field ranges (inclusive).
RANGES: dict[str, tuple[float, float]] = {
    'thickness': (0.05, 10),
    'o2': (13, 35),
    'flow': (0, 30),
    'temp': (20, 300),
    'time': (0, 600),
}

#: Slider/arrow step (step validation is not performed — 16.22).
STEPS = {'thickness': 0.05, 'o2': 0.5, 'flow': 0.5, 'temp': 5, 'time': 1}

FIELD_NAMES = {
    'sector': 'Sector', 'material': 'Material', 'thickness': 'Thickness', 'o2': 'Oxygen',
    'flow': 'Air Flow', 'gravity': 'Gravity', 'temp': 'Temperature', 'time': 'Burn Time',
}
FIELD_ORDER = ['sector', 'material', 'thickness', 'o2', 'flow', 'gravity', 'temp', 'time']
UNITS = {'thickness': ' mm', 'o2': ' %', 'flow': ' cm/s', 'temp': ' °C', 'time': ' s'}

#: §9.3 — messages for the "bad" status (used for the field hint in the UI).
RANGE_ERRORS = {
    'thickness': 'Allowed range: 0.05 to 10 mm',
    'o2': 'Allowed range: 13 to 35 %',
    'flow': 'Allowed range: 0 to 30 cm/s',
    'temp': 'Allowed range: 20 to 300 °C',
    'time': 'Allowed range: 0 to 600 s',
}

#: §4.2 — name mapping: prototype parameters → API fields (§4.1).
API_NAMES = {
    'material': 'material_type',
    'desc': 'material_description',
    'thickness': 'thickness_mm',
    'o2': 'oxygen_percent',
    'flow': 'air_flow_cm_s',
    'gravity': 'gravity',
    'temp': 'temperature_C',
    'time': 'time_s',
}
PARAM_NAMES = {v: k for k, v in API_NAMES.items()}


def gravity_ru(g: str) -> str:
    return 'Earth' if g == 'earth' else 'microgravity'


def gravity_short(g: str) -> str:
    return 'Earth' if g == 'earth' else 'μg'


def sent_full(sent: str | None) -> str:
    """§3.6 — report transmission status."""
    return f'Sent to Earth · {sent}' if sent else 'Queued for transmission'


def sent_short(sent: str | None) -> str:
    return 'sent' if sent else 'queued'
