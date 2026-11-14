"""
Имитация датчиков (прототип). Раз в XSCI_SENSOR_TICK_S сервер сам продвигает
марковское состояние каждого сектора (low → medium → high и обратно, не
перескакивая через ступень) и, если сектор реально поменял уровень, пишет
обычный анализ (§4.2, те же правила §14) с source='sensor' — этим и держится
«живой» дашборд: существующий поллинг GET /api/analyses подхватывает новую
запись сам.

Раз в XSCI_SHIP_REPORT_INTERVAL_S секунд (кратно тику) фиксируется полный
круг по всем семи секторам с отчётом (make_report=True) — это то, что видит
вкладка «Отчёты» (там report_status непустой). Между такими кругами пишутся
только сектора с реально изменившимся уровнем, без отчёта.

Обычно активен один «очаг» — сектор, который марковски идёт low→medium→high
и обратно; его смежные сектора (sector_adjacency, §3.4) могут «подхватить»
risk до medium, пока очаг на high, и возвращаются к low, когда он остывает.
Остальные сектора всегда остаются low — так «безопасно» всегда наиболее
вероятный исход.
"""
from __future__ import annotations

import random
import threading
from typing import Any

from flask import Flask

from ..domain.reference import SECTORS, sector_adjacency
from ..domain.scoring import score, verdict_of_scores
from . import analyses as analyses_svc

_SECTOR_IDS = [s['id'] for s in SECTORS]
_ADJACENCY = sector_adjacency()

_lock = threading.Lock()
_enabled = False
_manual_override = False
_state: dict[str, dict[str, Any]] = {sid: {'level': 'low', 'trend': 'steady'} for sid in _SECTOR_IDS}
_seed: str | None = None
_seed_high_ticks = 0
_tick_count = 0
_rng = random.Random()

IGNITION_P = 0.06
P_STEP = 0.55
P_CONTAGION = 0.3
P_DECAY = 0.45
HIGH_HOLD_TICKS = (1, 3)

_SAFE_MATERIALS = ('fabric', 'wood')
_RISKY_MATERIALS = ('paper', 'plastic', 'wire_insulation')
_RISK_BUCKET = {'low': (3, 6), 'medium': (7, 10), 'high': (11, 12)}
_TEMP_BUCKET_RANGE = {0: (20, 50), 1: (50.5, 100), 2: (100.5, 200), 3: (200.5, 300)}
_TIME_BUCKET_RANGE = {0: (0, 10), 1: (10.5, 30), 2: (30.5, 60), 3: (60.5, 300)}


def reset() -> None:
    """Сбрасывает модульное состояние — только для тестов: модуль синглтон
    на процесс, без явного сброса тесты будут видеть чужое состояние."""
    global _enabled, _manual_override, _seed, _seed_high_ticks, _tick_count
    with _lock:
        _enabled = False
        _manual_override = False
        _seed = None
        _seed_high_ticks = 0
        _tick_count = 0
        for sid in _SECTOR_IDS:
            _state[sid] = {'level': 'low', 'trend': 'steady'}


def get_status() -> dict[str, Any]:
    with _lock:
        return {'enabled': _enabled, 'manual_override': _manual_override}


def set_enabled(value: bool) -> dict[str, Any]:
    """Включение сбрасывает симуляцию в спокойное состояние и снимает override
    (§ «если датчики активированы — ручной ввод изначально заблокирован»)."""
    global _enabled, _manual_override, _seed, _seed_high_ticks, _tick_count
    with _lock:
        _enabled = value
        if value:
            for sid in _SECTOR_IDS:
                _state[sid] = {'level': 'low', 'trend': 'steady'}
            _seed = None
            _seed_high_ticks = 0
            _tick_count = 0
            _manual_override = False
        return {'enabled': _enabled, 'manual_override': _manual_override}


def set_manual_override(value: bool) -> dict[str, Any]:
    """Без эффекта, пока датчики выключены — форма и так разблокирована."""
    global _manual_override
    with _lock:
        if _enabled:
            _manual_override = value
        return {'enabled': _enabled, 'manual_override': _manual_override}


def _step_up(level: str) -> str:
    return 'medium' if level == 'low' else 'high' if level == 'medium' else level


def _step_down(level: str) -> str:
    return 'low' if level == 'medium' else 'medium' if level == 'high' else level


def _advance_locked() -> dict[str, bool]:
    """Продвигает марковское состояние на один тик. Возвращает, какие
    сектора реально поменяли уровень (вызывающий решает, писать ли их)."""
    global _seed, _seed_high_ticks
    changed = {sid: False for sid in _SECTOR_IDS}

    if _seed is None:
        if all(_state[s]['level'] == 'low' for s in _SECTOR_IDS) and _rng.random() < IGNITION_P:
            _seed = _rng.choice(_SECTOR_IDS)
            _state[_seed] = {'level': 'low', 'trend': 'rising'}

    if _seed is not None:
        st = _state[_seed]
        if st['trend'] == 'rising':
            if st['level'] == 'high':
                _seed_high_ticks += 1
                if _seed_high_ticks >= _rng.randint(*HIGH_HOLD_TICKS):
                    st['trend'] = 'falling'
            elif _rng.random() < P_STEP:
                st['level'] = _step_up(st['level'])
                changed[_seed] = True
        elif st['trend'] == 'falling':
            if st['level'] == 'low':
                _seed = None
                _seed_high_ticks = 0
            elif _rng.random() < P_STEP:
                st['level'] = _step_down(st['level'])
                changed[_seed] = True

        if _seed is not None:
            seed_level = _state[_seed]['level']
            for nb in _ADJACENCY.get(_seed, ()):
                nst = _state[nb]
                if seed_level == 'high' and nst['level'] == 'low' and _rng.random() < P_CONTAGION:
                    nst['level'], nst['trend'] = 'medium', 'rising'
                    changed[nb] = True
                elif seed_level != 'high' and nst['level'] == 'medium' and _rng.random() < P_DECAY:
                    nst['level'], nst['trend'] = 'low', 'steady'
                    changed[nb] = True

    return changed


def _sample_once(level: str) -> dict[str, Any]:
    """
    Подбирает параметры так, чтобы индекс опасности §14.4 (risk со
    стабилизацией по ext) попадал в нужный диапазон вердикта. flow=0 и
    o2 < 18 держат ext >= 4 почти всегда (od>=2, lf=2), что даёт
    stability_adjust=-1 и d = risk - 1 независимо от толщины/материала —
    поэтому остаётся только подобрать risk под нужный вердикт.
    """
    o2 = round(_rng.uniform(13, 17.9), 1)
    o2r = 0 if o2 < 16 else 1
    gravity = _rng.choice(('earth', 'microgravity'))
    gravr = 1 if gravity == 'microgravity' else 0

    lo, hi = _RISK_BUCKET[level]
    target = _rng.randint(lo, hi)
    budget = target - 1 - o2r - gravr  # 1 = flow_risk при flow=0

    pool = (_RISKY_MATERIALS if level == 'high' else _SAFE_MATERIALS
            if level == 'low' else _SAFE_MATERIALS + _RISKY_MATERIALS)
    material = _rng.choice(pool)
    mat_risk = 3 if material in _RISKY_MATERIALS else 2
    budget = max(0, budget - mat_risk)

    temp_bucket = min(3, budget)
    budget = max(0, budget - temp_bucket)
    time_bucket = min(3, budget)

    temp = round(_rng.uniform(*_TEMP_BUCKET_RANGE[temp_bucket]), 1)
    time_s = round(_rng.uniform(*_TIME_BUCKET_RANGE[time_bucket]), 1)
    thickness = round(_rng.uniform(0.05, 10), 2)

    return {
        'material': material, 'desc': '', 'thickness': thickness, 'o2': o2,
        'flow': 0, 'gravity': gravity, 'temp': temp, 'time': time_s,
    }


def sample_params(level: str, attempts: int = 6) -> dict[str, Any]:
    """Генерирует и проверяет параметры через настоящий расчёт §14; при
    промахе пересэмплирует (дёшево — чистые функции, без побочных эффектов)."""
    best = None
    for _ in range(attempts):
        candidate = _sample_once(level)
        best = candidate
        if verdict_of_scores(score(candidate)) == level:
            return candidate
    return best  # type: ignore[return-value]


def tick(app: Flask) -> None:
    """Один шаг имитации — вызывается фоновым потоком раз в SENSOR_TICK_S."""
    global _tick_count
    with _lock:
        if not _enabled:
            return
        report_every = max(1, app.config['SHIP_REPORT_INTERVAL_S'] // app.config['SENSOR_TICK_S'])
        report_round = _tick_count % report_every == 0
        changed = _advance_locked()
        _tick_count += 1
        if report_round:
            changed = {sid: True for sid in _SECTOR_IDS}
        levels = {sid: _state[sid]['level'] for sid in _SECTOR_IDS}

    to_write = [sid for sid in _SECTOR_IDS if changed[sid]]
    if not to_write:
        return
    with app.app_context():
        for sid in to_write:
            params = sample_params(levels[sid])
            try:
                analyses_svc.create(params, sid, 'sensor', None, '',
                                     source='sensor', make_report=report_round)
            except Exception:
                app.logger.exception('sensor tick: не удалось записать сектор %s', sid)


def start_tick_worker(app: Flask) -> None:
    """Фоновый поток имитации. Выключается конфигом SENSOR_WORKER (сама
    генерация — отдельным рантайм-тумблером через /api/sensors/toggle)."""
    tick_s = app.config['SENSOR_TICK_S']
    stop = threading.Event()
    app.extensions['sensor_worker_stop'] = stop

    def loop() -> None:
        while not stop.wait(tick_s):
            try:
                tick(app)
            except Exception:  # pragma: no cover — поток не должен падать
                app.logger.exception('sensor worker tick failed')

    threading.Thread(target=loop, name='sensor-tick', daemon=True).start()
