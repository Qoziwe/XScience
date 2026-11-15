"""
ML model for risk and extinction (§17.1, Stage 2).

Entirely on the standard library: softmax regression (multiclass logistic)
with gradient descent, two independent outputs — risk_level and
extinction_probability. Weights are stored in the DB; a prediction is only
ever produced by a trained model and is NOT substituted for the rule-based
calculation (§17.1).

HONEST LIMITATION: the training set's labels are computed by the §14 formulas
(data_source = simulated), so the model approximates the rules rather than
independent observations. This is visible in the response
(`labels_are_rule_derived`). Replacing the set with real measurements is a
separate task (§19.3).
"""
from __future__ import annotations

import json
import math
import random
from typing import Any

from ..db import execute, query
from ..domain.dataset import summary, training_rows
from ..domain.format import iso, utc_now
from ..domain.reference import MATERIALS, RANGES

VERSION = 'logreg-v1'
TARGETS = ('risk_level', 'extinction_probability')
CLASSES = ('low', 'medium', 'high')
NUMERIC = ('thickness', 'o2', 'flow', 'temp', 'time')
MATERIAL_CODES = [m['code'] for m in MATERIALS]

#: §17.1 — required data-readiness checks.
MIN_ROWS = 50
MIN_CLASSES = 3

DEFAULTS = {'epochs': 600, 'lr': 0.5, 'l2': 1e-4, 'test_share': 0.25, 'seed': 20261114}


def features(p: dict[str, Any]) -> list[float]:
    """Features: one-hot material, gravity, and normalized numeric fields."""
    vec = [1.0 if p['material'] == code else 0.0 for code in MATERIAL_CODES]
    vec.append(1.0 if p['gravity'] == 'microgravity' else 0.0)
    for key in NUMERIC:
        lo, hi = RANGES[key]
        vec.append((float(p[key]) - lo) / (hi - lo))
    return vec


FEATURE_NAMES = [f'material={c}' for c in MATERIAL_CODES] + ['gravity=microgravity'] + [
    f'{k}_norm' for k in NUMERIC]
N_FEATURES = len(FEATURE_NAMES)


def _softmax(z: list[float]) -> list[float]:
    m = max(z)
    e = [math.exp(v - m) for v in z]
    total = sum(e)
    return [v / total for v in e]


def _predict_one(w: list[list[float]], b: list[float], x: list[float]) -> list[float]:
    return _softmax([sum(wi * xi for wi, xi in zip(row, x)) + bias
                     for row, bias in zip(w, b)])


def _fit(xs: list[list[float]], ys: list[int], epochs: int, lr: float,
         l2: float) -> tuple[list[list[float]], list[float]]:
    k, n, m = len(CLASSES), N_FEATURES, len(xs)
    w = [[0.0] * n for _ in range(k)]
    b = [0.0] * k
    for _ in range(epochs):
        gw = [[0.0] * n for _ in range(k)]
        gb = [0.0] * k
        for x, y in zip(xs, ys):
            probs = _predict_one(w, b, x)
            for c in range(k):
                err = probs[c] - (1.0 if c == y else 0.0)
                gb[c] += err
                row = gw[c]
                for j, xj in enumerate(x):
                    if xj:
                        row[j] += err * xj
        for c in range(k):
            b[c] -= lr * gb[c] / m
            for j in range(n):
                w[c][j] -= lr * (gw[c][j] / m + l2 * w[c][j])
    return w, b


def _accuracy(w, b, xs, ys) -> float:
    if not xs:
        return 0.0
    hits = sum(1 for x, y in zip(xs, ys)
               if max(range(len(CLASSES)), key=_predict_one(w, b, x).__getitem__) == y)
    return round(hits / len(xs), 4)


def readiness() -> dict[str, Any]:
    """§17.1 — four checks against the current dataset + model status."""
    info = summary()
    rows, valid = info['rows'], info['valid_data_source']
    train = training_rows()
    train_risk = {r['risk_level'] for r in train}
    train_ext = {r['extinction_probability'] for r in train}

    checks = [
        {'key': 'rows', 'label': 'Rows in dataset', 'value': rows, 'target': MIN_ROWS,
         'passed': rows >= MIN_ROWS, 'required': True,
         'note': f'target {MIN_ROWS}–100 per section 13'},
        {'key': 'risk_classes', 'label': 'risk_level classes',
         'value': len(info['risk_classes']), 'target': MIN_CLASSES,
         'passed': len(info['risk_classes']) >= MIN_CLASSES, 'required': True,
         'note': 'a classifier cannot be trained on a single class (16.4)'},
        {'key': 'data_source', 'label': 'Valid data_source', 'value': valid,
         'target': rows, 'passed': valid == rows, 'required': True,
         'note': 'NASA_article / estimated / simulated are allowed (§19.1)'},
        {'key': 'earth_rows', 'label': 'Rows with gravity = earth',
         'value': info['earth_rows'], 'target': rows, 'passed': info['earth_rows'] > 0,
         'required': False, 'note': 'without variation in a feature, its contribution cannot be estimated'},
    ]

    reasons: list[str] = []
    if len(train) < MIN_ROWS:
        reasons.append(f'{len(train)} rows with a valid data_source, {MIN_ROWS} needed')
    if len(train_risk) < MIN_CLASSES:
        reasons.append(f'{len(train_risk)} risk_level classes in the training set, '
                       f'{MIN_CLASSES} needed')
    if len(train_ext) < MIN_CLASSES:
        reasons.append(f'{len(train_ext)} extinction_probability classes, '
                       f'{MIN_CLASSES} needed')

    return {
        'checks': checks,
        'dataset': info,
        'mismatches': info['mismatches'],
        'training_set': {
            'rows': len(train),
            'risk_classes': sorted(train_risk),
            'ext_classes': sorted(train_ext),
            'can_train': not reasons,
            'reasons': reasons,
            # Design: rows whose data_source falls outside the §19.1 schema are excluded from training.
            'excluded_rows': rows - len(train),
            'labels_are_rule_derived': True,
        },
        'model': active_model_info(),
    }


def active_model_info() -> dict[str, Any]:
    row = query('SELECT * FROM ml_models WHERE active = 1 ORDER BY id DESC', one=True)
    if not row:
        return {'trained': False, 'version': None,
                'note': 'A prediction is only produced by a trained model and is not '
                        'substituted for the rule-based calculation (§17.1).'}
    metrics = json.loads(row['metrics'])
    return {'trained': True, 'id': row['id'], 'version': row['version'],
            'kind': row['kind'], 'trained_at': row['created_at'], 'metrics': metrics}


def train(options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Trains two classifiers. Available only once the checks pass."""
    opts = {**DEFAULTS, **(options or {})}
    rows = training_rows()
    rnd = random.Random(int(opts['seed']))
    order = list(range(len(rows)))
    rnd.shuffle(order)
    cut = max(1, int(len(order) * (1 - float(opts['test_share']))))
    train_idx, test_idx = order[:cut], order[cut:]

    xs = [features(r['p']) for r in rows]
    metrics: dict[str, Any] = {'rows': len(rows), 'train_rows': len(train_idx),
                               'test_rows': len(test_idx), 'targets': {}}
    params: dict[str, Any] = {'feature_names': FEATURE_NAMES, 'classes': list(CLASSES),
                              'weights': {}}

    for target in TARGETS:
        ys = [CLASSES.index(r[target]) for r in rows]
        w, b = _fit([xs[i] for i in train_idx], [ys[i] for i in train_idx],
                    int(opts['epochs']), float(opts['lr']), float(opts['l2']))
        metrics['targets'][target] = {
            'train_accuracy': _accuracy(w, b, [xs[i] for i in train_idx],
                                        [ys[i] for i in train_idx]),
            'test_accuracy': _accuracy(w, b, [xs[i] for i in test_idx],
                                       [ys[i] for i in test_idx]),
            'class_counts': {c: sum(1 for y in ys if CLASSES[y] == c) for c in CLASSES},
        }
        params['weights'][target] = {'w': w, 'b': b}

    metrics['labels_are_rule_derived'] = True
    metrics['hyperparameters'] = {k: opts[k] for k in ('epochs', 'lr', 'l2',
                                                       'test_share', 'seed')}
    execute('UPDATE ml_models SET active = 0 WHERE active = 1')
    cur = execute('INSERT INTO ml_models (created_at, kind, version, params, metrics, '
                  'active) VALUES (?,?,?,?,?,1)',
                  (iso(utc_now()), 'softmax_regression', VERSION,
                   json.dumps(params), json.dumps(metrics, ensure_ascii=False)))
    return {'id': int(cur.lastrowid), 'version': VERSION, 'metrics': metrics,
            'note': 'The dataset labels are computed by the §14 formulas: the model '
                    'approximates the rules, not independent observations (§19.3).'}


def predict(p: dict[str, Any]) -> dict[str, Any]:
    """Prediction from the trained model. Without a model, the calling code returns 409."""
    row = query('SELECT * FROM ml_models WHERE active = 1 ORDER BY id DESC', one=True)
    if not row:
        return {}
    params = json.loads(row['params'])
    x = features(p)
    out: dict[str, Any] = {'model_version': row['version'], 'model_id': row['id'],
                           'predictions': {}}
    for target, wb in params['weights'].items():
        probs = _predict_one(wb['w'], wb['b'], x)
        best = max(range(len(CLASSES)), key=probs.__getitem__)
        out['predictions'][target] = {
            'label': CLASSES[best],
            'probabilities': {c: round(v, 4) for c, v in zip(CLASSES, probs)},
        }
    out['note'] = ('ML model prediction. The §14 rule-based calculation remains the '
                   'primary source of the verdict — this prediction does not replace it (§17.1).')
    return out
