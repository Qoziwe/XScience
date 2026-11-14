"""§18.5–18.6 — набор данных, ML-модель риска/затухания и закон d²."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..domain import d2
from ..domain.dataset import all_rows, summary
from ..domain.validation import to_params, validate_input
from ..errors import ApiError, bad_json, validation_error
from ..services import auth, ml

bp = Blueprint('models', __name__, url_prefix='/api')


@bp.get('/dataset')
def dataset():
    """§18.5 — строки набора с результатом сверки по формулам §14."""
    auth.require_auth()
    rows = all_rows()
    if request.args.get('only_mismatches') in ('1', 'true', 'yes'):
        rows = [r for r in rows if not r['ok']]
    if (which := request.args.get('dataset')):
        rows = [r for r in rows if r['dataset'] == which]
    return jsonify({'summary': summary(), 'rows': rows})


@bp.get('/models/ml/readiness')
def readiness():
    """§17.1 — четыре проверки готовности данных и состояние модели."""
    auth.require_auth()
    return jsonify(ml.readiness())


@bp.post('/models/ml/train')
def train():
    """§17.1 — обучение доступно только при пройденных обязательных проверках."""
    row = auth.require_auth()
    auth.require_csrf(row)
    state = ml.readiness()
    if not state['training_set']['can_train']:
        raise ApiError(409, 'training_unavailable',
                       reasons=state['training_set']['reasons'],
                       checks=[c for c in state['checks'] if c['required']
                               and not c['passed']])
    options = request.get_json(silent=True) or {}
    if not isinstance(options, dict):
        raise bad_json()
    return jsonify(ml.train(options)), 201


@bp.post('/models/ml/predict')
def predict():
    """§17.1 — прогноз только при обученной модели, иначе 409."""
    auth.require_auth()
    body = request.get_json(silent=True)
    if body is None:
        raise bad_json()
    errors, clean = validate_input({'sector': 'l1', **body} if 'sector' not in body
                                   else body)
    # Сектор для прогноза не нужен — ошибку по нему не показываем.
    errors.pop('sector', None)
    if errors:
        raise validation_error(errors)
    out = ml.predict(to_params(clean))
    if not out:
        raise ApiError(409, 'model_not_trained',
                       detail='Прогноз выдаётся только обученной моделью (§17.1).')
    return jsonify(out)


@bp.post('/models/d2')
def law_d2():
    """§17.2 — сокращённая форма закона d²."""
    auth.require_auth()
    body = request.get_json(silent=True)
    if body is None:
        raise bad_json()
    errors, clean = d2.validate(body)
    if errors:
        raise validation_error(errors)
    return jsonify(d2.solve(clean['d0_mm'], clean['k_mm2_s']))
