"""
Server-side validation of analysis input (§4.1, §9.3, §18.9).
The server re-validates input independently of the client; on error — 422
with a list of fields using API names (§18.9).
Port of the rules from frontend/src/domain/validation.ts, but using the §4.1 names.
"""
from __future__ import annotations

from typing import Any

from .reference import GRAVITY_OPTIONS, MAT, PARAM_NAMES, RANGES, SEC

#: API numeric fields → (range key, §18.9 error text).
NUMERIC_FIELDS: dict[str, tuple[str, str]] = {
    'thickness_mm': ('thickness', 'Enter a material thickness from 0.05 to 10 millimeters'),
    'oxygen_percent': ('o2', 'Enter an oxygen concentration from 13 to 35 percent'),
    'air_flow_cm_s': ('flow', 'Enter an air flow velocity from 0 to 30 centimeters per second'),
    'temperature_C': ('temp', 'Enter a temperature from 20 to 300 degrees Celsius'),
    'time_s': ('time', 'Enter a burn time from 0 to 600 seconds'),
}

MESSAGES = {
    'sector': 'Select a ship sector',
    'material_type': 'Select a material type',
    'material_description': 'Describe the material or choose one of the suggested options',
    'gravity': 'Select gravity conditions',
}

GRAVITY_CODES = {g['code'] for g in GRAVITY_OPTIONS}


def _number(v: Any) -> float | None:
    """Strict coercion: bools and non-numeric strings are rejected (§23, "O₂ = abc")."""
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
    Validates AnalysisInput. Returns (errors by field, normalized input).
    Empty errors = valid input; normalized input has numbers as float.
    """
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}

    if not isinstance(body, dict):
        return {'_': 'Expected a JSON object with analysis parameters'}, {}

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
    # §4.1 — the description is only required for the "Other" material.
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
        if v is None or v != v or v < lo or v > hi:  # v != v filters out NaN
            errors[api_name] = message
        else:
            clean[api_name] = v

    return errors, clean


def to_params(clean: dict[str, Any]) -> dict[str, Any]:
    """Normalized API input (§4.1) → calculation parameters (§4.2, `p`)."""
    return {PARAM_NAMES[k]: v for k, v in clean.items() if k in PARAM_NAMES}


def to_input(params: dict[str, Any]) -> dict[str, Any]:
    """Calculation parameters → API input (§4.1) without the sector."""
    from .reference import API_NAMES
    return {API_NAMES[k]: v for k, v in params.items() if k in API_NAMES}
