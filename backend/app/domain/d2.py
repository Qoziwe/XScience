"""
d² law (§17.2, Stage 3, reduced form): d²(t) = d₀² − K·t.
A full droplet combustion model is not part of the prototype; the source of K
is undefined [QUESTION §17.2] — the value is supplied by the operator.
"""
from __future__ import annotations

from typing import Any

#: §17.2 — interface field boundaries.
D0_RANGE = (0.1, 5.0)
K_RANGE = (0.01, 5.0)
POINTS = 41


def solve(d0_mm: float, k_mm2_s: float) -> dict[str, Any]:
    """Full burnout time and the d²(t)/d(t) curves, d(t) normalized to d₀."""
    d0_sq = d0_mm * d0_mm
    t_burn = d0_sq / k_mm2_s
    points = []
    for i in range(POINTS):
        t = t_burn * i / (POINTS - 1)
        d_sq = max(0.0, d0_sq - k_mm2_s * t)
        points.append({
            't': round(t, 4),
            'd2': round(d_sq, 4),
            # d(t)/d₀ — as shown on the §17.2 chart.
            'd': round((d_sq ** 0.5) / d0_mm, 4),
        })
    return {
        'd0_mm': d0_mm,
        'k_mm2_s': k_mm2_s,
        'd0_squared_mm2': round(d0_sq, 2),
        't_burn_s': round(t_burn, 1),
        'points': points,
        'note': 'Reduced form: only d²(t) = d₀² − K·t. Mass and species transport, '
                'the energy equation, reaction, radiation, and the extinction moment '
                'are not implemented (§17.2). The source of K is undefined.',
    }


def validate(body: Any) -> tuple[dict[str, str], dict[str, float]]:
    """Input validation: both values are required and must be within §17.2 bounds."""
    errors: dict[str, str] = {}
    clean: dict[str, float] = {}
    for key, (lo, hi), message in (
        ('d0_mm', D0_RANGE, 'Enter an initial diameter from 0.1 to 5 millimeters'),
        ('k_mm2_s', K_RANGE, 'Enter a burn constant from 0.01 to 5 mm²/s'),
    ):
        raw = body.get(key) if isinstance(body, dict) else None
        try:
            value = float(raw)
        except (TypeError, ValueError):
            errors[key] = message
            continue
        if value != value or not lo <= value <= hi:
            errors[key] = message
        else:
            clean[key] = value
    return errors, clean
