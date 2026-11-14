"""
Серверная валидация входа анализа (§4.1, §9.3, §18.9).
Сервер проверяет вход заново и независимо от клиента; при ошибке — 422
со списком полей в именах API (§18.9).
Порт правил из frontend/src/domain/validation.ts, но на именах §4.1.
"""
from __future__ import annotations

from typing import Any

from .reference import GRAVITY_OPTIONS, MAT, PARAM_NAMES, RANGES, SEC

#: Числовые поля API → (ключ диапазона, текст ошибки §18.9).
NUMERIC_FIELDS: dict[str, tuple[str, str]] = {
    'thickness_mm': ('thickness', 'Введите толщину материала от 0.05 до 10 миллиметров'),
    'oxygen_percent': ('o2', 'Введите концентрацию кислорода от 13 до 35 процентов'),
    'air_flow_cm_s': ('flow', 'Введите скорость потока воздуха от 0 до 30 сантиметров в секунду'),
    'temperature_C': ('temp', 'Введите температуру от 20 до 300 градусов Цельсия'),
    'time_s': ('time', 'Введите время горения от 0 до 600 секунд'),
}

MESSAGES = {
    'sector': 'Выберите сектор корабля',
    'material_type': 'Выберите тип материала',
    'material_description': 'Опишите материал или выберите один из предложенных вариантов',
    'gravity': 'Выберите условия гравитации',
}

GRAVITY_CODES = {g['code'] for g in GRAVITY_OPTIONS}


def _number(v: Any) -> float | None:
    """Строгое приведение: bool и строки-нечисла не проходят (§23, «O₂ = abc»)."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip().replace(',', '.'))
        except ValueError:
            return None
    return None


def validate_input(body: Any) -> tuple[dict[str, str], dict[str, Any]]:
    """
    Проверяет AnalysisInput. Возвращает (ошибки по полям, нормализованный вход).
    Пустые ошибки = вход годен; нормализованный вход — числа как float.
    """
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}

    if not isinstance(body, dict):
        return {'_': 'Ожидается объект JSON с параметрами анализа'}, {}

    sector = body.get('sector')
    if not isinstance(sector, str) or sector not in SEC:
        errors['sector'] = MESSAGES['sector']
    else:
        clean['sector'] = sector

    material = body.get('material_type')
    if not isinstance(material, str) or material not in MAT:
        errors['material_type'] = MESSAGES['material_type']
    else:
        clean['material_type'] = material

    desc = body.get('material_description') or ''
    if not isinstance(desc, str):
        desc = ''
    desc = desc.strip()
    # §4.1 — описание обязательно только для материала «Другое».
    if clean.get('material_type') == 'other' and not desc:
        errors['material_description'] = MESSAGES['material_description']
    clean['material_description'] = desc

    gravity = body.get('gravity')
    if not isinstance(gravity, str) or gravity not in GRAVITY_CODES:
        errors['gravity'] = MESSAGES['gravity']
    else:
        clean['gravity'] = gravity

    for api_name, (range_key, message) in NUMERIC_FIELDS.items():
        v = _number(body.get(api_name))
        lo, hi = RANGES[range_key]
        if v is None or v != v or v < lo or v > hi:  # v != v отсекает NaN
            errors[api_name] = message
        else:
            clean[api_name] = v

    return errors, clean


def to_params(clean: dict[str, Any]) -> dict[str, Any]:
    """Нормализованный вход API (§4.1) → параметры расчёта (§4.2, `p`)."""
    return {PARAM_NAMES[k]: v for k, v in clean.items() if k in PARAM_NAMES}


def to_input(params: dict[str, Any]) -> dict[str, Any]:
    """Параметры расчёта → вход API (§4.1) без сектора."""
    from .reference import API_NAMES
    return {API_NAMES[k]: v for k, v in params.items() if k in API_NAMES}
