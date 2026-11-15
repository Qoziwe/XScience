"""§18.5–18.6 — dataset, risk/extinction ML model, and the d² law."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..domain import d2
from ..domain.dataset import all_rows, summary
from ..domain.validation import to_params, validate_input
from ..errors import ApiError, bad_json, validation_error
from ..services import ml

bp = Blueprint('models', __name__, url_prefix='/api')


@bp.get('/dataset')
def dataset():
    """§18.5 — dataset rows with the §14 formula cross-check result."""
    rows = all_rows()
    if request.args.get('only_mismatches') in ('1', 'true', 'yes'):
        rows = [r for r in rows if not r['ok']]
    if (which := request.args.get('dataset')):
        rows = [r for r in rows if r['dataset'] == which]
    return jsonify({'summary': summary(), 'rows': rows})


@bp.get('/models/ml/readiness')
def readiness():
    """§17.1 — the four data-readiness checks and model state."""
    return jsonify(ml.readiness())


@bp.post('/models/ml/train')
def train():
    """§17.1 — training is only available once all required checks pass."""
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
    """§17.1 — prediction only when a model is trained, otherwise 409."""
    body = request.get_json(silent=True)
    if body is None:
        raise bad_json()
    errors, clean = validate_input({'sector': 'l1', **body} if 'sector' not in body
                                   else body)
    # The sector is not needed for prediction — don't surface an error for it.
    errors.pop('sector', None)
    if errors:
        raise validation_error(errors)
    out = ml.predict(to_params(clean))
    if not out:
        raise ApiError(409, 'model_not_trained',
                       detail='A prediction is only returned by a trained model (§17.1).')
    return jsonify(out)


@bp.post('/models/d2')
def law_d2():
    """§17.2 — reduced form of the d² law."""
    body = request.get_json(silent=True)
    if body is None:
        raise bad_json()
    errors, clean = d2.validate(body)
    if errors:
        raise validation_error(errors)
    return jsonify(d2.solve(clean['d0_mm'], clean['k_mm2_s']))
