"""Справочники и перечисления. Порт frontend/src/domain/reference.ts (§3, §9.2, §21)."""
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


#: §3.1 — порядок отображения как в таблице.
MATERIALS: list[MaterialDef] = [
    {'code': 'paper', 'label': 'Бумага', 'risk': 3},
    {'code': 'fabric', 'label': 'Ткань', 'risk': 2},
    {'code': 'plastic', 'label': 'Пластик', 'risk': 3},
    {'code': 'wood', 'label': 'Дерево', 'risk': 2},
    {'code': 'wire_insulation', 'label': 'Изоляция провода', 'risk': 3},
    {'code': 'other', 'label': 'Другое', 'risk': 2},
]
MAT: dict[str, MaterialDef] = {m['code']: m for m in MATERIALS}

#: §3.3 — пресеты потока для простого режима.
FLOW_PRESETS = [
    {'code': 'none', 'label': 'Нет', 'value': 0},
    {'code': 'weak', 'label': 'Слабый', 'value': 2.5},
    {'code': 'medium', 'label': 'Средний', 'value': 10},
    {'code': 'strong', 'label': 'Сильный', 'value': 20},
]

GRAVITY_OPTIONS = [
    {'code': 'earth', 'label': 'Земля', 'short': 'Земля'},
    {'code': 'microgravity', 'label': 'Микрогравитация', 'short': 'μg'},
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


#: §3.4 — планировка-заглушка (16.14). Отдаётся через GET /api/sectors.
SECTORS: list[SectorDef] = [
    {'id': 'sh', 'code': 'ШЛ', 'name': 'Шлюз', 'desc': 'Стыковочный узел и выход наружу.',
     'x': 14, 'y': 95, 'w': 80, 'h': 70},
    {'id': 'km', 'code': 'КМ', 'name': 'Командный модуль', 'desc': 'Посты управления и связи.',
     'x': 104, 'y': 80, 'w': 120, 'h': 100},
    {'id': 'zh', 'code': 'ЖМ', 'name': 'Жилой модуль', 'desc': 'Каюты, камбуз, зона отдыха.',
     'x': 234, 'y': 60, 'w': 150, 'h': 140},
    {'id': 'l1', 'code': 'ЛБ-1', 'name': 'Лаборатория 1', 'desc': 'Научное оборудование и образцы.',
     'x': 394, 'y': 40, 'w': 116, 'h': 85},
    {'id': 'l2', 'code': 'ЛБ-2', 'name': 'Лаборатория 2', 'desc': 'Научное оборудование и образцы.',
     'x': 394, 'y': 135, 'w': 116, 'h': 85},
    {'id': 'sk', 'code': 'СК', 'name': 'Склад', 'desc': 'Грузы, запасы, контейнеры.',
     'x': 520, 'y': 80, 'w': 96, 'h': 100},
    {'id': 'ep', 'code': 'ЭП', 'name': 'Энергоотсек', 'desc': 'Распределение питания, кабельные трассы.',
     'x': 626, 'y': 95, 'w': 80, 'h': 70},
]
SEC: dict[str, SectorDef] = {s['id']: s for s in SECTORS}


def sector_adjacency() -> dict[str, list[str]]:
    """
    Смежность секторов по геометрии схемы (§3.4), а не отдельным списком:
    сектора на соседних координатах x физически граничат друг с другом, а
    сектора с одинаковым x — параллельные отсеки в одной точке коридора
    (сейчас это l1/l2) и тоже считаются смежными.
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

#: §3.5 — подписи уровней.
RISK_LEVEL_RU = {'low': 'Низкий', 'medium': 'Средний', 'high': 'Высокий'}
EXT_LEVEL_RU = {'low': 'Низкая', 'medium': 'Средняя', 'high': 'Высокая'}
VERDICT_RU = {'low': 'Безопасно', 'medium': 'Требует внимания', 'high': 'Опасно'}
VERDICT_SUBTITLE = {
    'low': 'условия не поддерживают развитие пламени',
    'medium': 'возможно развитие или нестабильное горение',
    'high': 'высокая вероятность быстрого распространения',
}
STATUS_WORD = {'none': 'нет данных', 'low': 'норма', 'medium': 'внимание', 'high': 'опасно'}
STATUS_LEGEND = {'none': 'Нет данных', 'low': 'Безопасно', 'medium': 'Внимание', 'high': 'Опасно'}

#: §9.2 — диапазоны числовых полей (включительно).
RANGES: dict[str, tuple[float, float]] = {
    'thickness': (0.05, 10),
    'o2': (13, 35),
    'flow': (0, 30),
    'temp': (20, 300),
    'time': (0, 600),
}

#: Шаг ползунка и стрелок (проверка шага не выполняется — 16.22).
STEPS = {'thickness': 0.05, 'o2': 0.5, 'flow': 0.5, 'temp': 5, 'time': 1}

FIELD_NAMES = {
    'sector': 'Сектор', 'material': 'Материал', 'thickness': 'Толщина', 'o2': 'Кислород',
    'flow': 'Поток воздуха', 'gravity': 'Гравитация', 'temp': 'Температура', 'time': 'Время горения',
}
FIELD_ORDER = ['sector', 'material', 'thickness', 'o2', 'flow', 'gravity', 'temp', 'time']
UNITS = {'thickness': ' мм', 'o2': ' %', 'flow': ' см/с', 'temp': ' °C', 'time': ' с'}

#: §9.3 — сообщения при статусе bad (для подписи поля в интерфейсе).
RANGE_ERRORS = {
    'thickness': 'Допустимо от 0.05 до 10 мм',
    'o2': 'Допустимо от 13 до 35 %',
    'flow': 'Допустимо от 0 до 30 см/с',
    'temp': 'Допустимо от 20 до 300 °C',
    'time': 'Допустимо от 0 до 600 с',
}

#: §4.2 — сопоставление имён: параметры прототипа → поля API (§4.1).
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
    return 'Земля' if g == 'earth' else 'микрогравитация'


def gravity_short(g: str) -> str:
    return 'Земля' if g == 'earth' else 'μg'


def sent_full(sent: str | None) -> str:
    """§3.6 — статус передачи отчёта."""
    return f'Передан на Землю · {sent}' if sent else 'В очереди на передачу'


def sent_short(sent: str | None) -> str:
    return 'передан' if sent else 'в очереди'
