"""
Закон d² (§17.2, Stage 3, сокращённая форма): d²(t) = d₀² − K·t.
Полная модель горения капли в прототип не входит; источник K не задан
[ВОПРОС §17.2] — значение задаёт оператор.
"""
from __future__ import annotations

from typing import Any

#: §17.2 — границы полей интерфейса.
D0_RANGE = (0.1, 5.0)
K_RANGE = (0.01, 5.0)
POINTS = 41


def solve(d0_mm: float, k_mm2_s: float) -> dict[str, Any]:
    """Время полного выгорания и кривые d²(t) и d(t), нормированная на d₀."""
    d0_sq = d0_mm * d0_mm
    t_burn = d0_sq / k_mm2_s
    points = []
    for i in range(POINTS):
        t = t_burn * i / (POINTS - 1)
        d_sq = max(0.0, d0_sq - k_mm2_s * t)
        points.append({
            't': round(t, 4),
            'd2': round(d_sq, 4),
            # d(t)/d₀ — как на графике §17.2.
            'd': round((d_sq ** 0.5) / d0_mm, 4),
        })
    return {
        'd0_mm': d0_mm,
        'k_mm2_s': k_mm2_s,
        'd0_squared_mm2': round(d0_sq, 2),
        't_burn_s': round(t_burn, 1),
        'points': points,
        'note': 'Сокращённая форма: только d²(t) = d₀² − K·t. Перенос массы и '
                'компонентов, уравнение энергии, реакция, излучение и момент '
                'затухания не реализованы (§17.2). Источник K не задан.',
    }


def validate(body: Any) -> tuple[dict[str, str], dict[str, float]]:
    """Проверка входа: оба значения обязательны и в границах §17.2."""
    errors: dict[str, str] = {}
    clean: dict[str, float] = {}
    for key, (lo, hi), message in (
        ('d0_mm', D0_RANGE, 'Введите начальный диаметр от 0.1 до 5 миллиметров'),
        ('k_mm2_s', K_RANGE, 'Введите константу горения от 0.01 до 5 мм²/с'),
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
