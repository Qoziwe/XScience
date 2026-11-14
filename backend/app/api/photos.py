"""§18.7 — фото пламени."""
from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from ..errors import bad_json, validation_error
from ..services import auth, photos

bp = Blueprint('photos', __name__, url_prefix='/api')


@bp.post('/photos')
def upload():
    """multipart: file + необязательный analysis_id → метаданные снимка."""
    row = auth.require_auth()
    auth.require_csrf(row)
    upload_file = request.files.get('file')
    if upload_file is None:
        raise validation_error({'file': 'Выберите снимок'})

    raw = request.form.get('analysis_id')
    analysis_id = None
    if raw not in (None, ''):
        try:
            analysis_id = int(raw)
        except ValueError:
            raise validation_error({'analysis_id': 'Ожидается номер анализа'})

    return jsonify(photos.save(upload_file.filename or 'photo', upload_file.read(),
                               analysis_id, row['user_id'])), 201


@bp.get('/photos')
def listing():
    auth.require_auth()
    raw = request.args.get('analysis_id')
    analysis_id = int(raw) if raw and raw.isdigit() else None
    return jsonify(photos.listing(analysis_id))


@bp.get('/photos/<photo_id>')
def one(photo_id: str):
    auth.require_auth()
    return jsonify(photos.get(photo_id))


@bp.get('/photos/<photo_id>/file')
def file(photo_id: str):
    """Сам снимок — только по сессии; файлы лежат вне веб-корня."""
    auth.require_auth()
    path, mime, name = photos.file_path(photo_id)
    return send_file(path, mimetype=mime, download_name=name)


@bp.patch('/photos/<photo_id>')
def patch(photo_id: str):
    """Разметка оператора (§17.3) и привязка к анализу."""
    row = auth.require_auth()
    auth.require_csrf(row)
    body = request.get_json(silent=True)
    if body is None:
        raise bad_json()
    return jsonify(photos.annotate(photo_id, body))


@bp.post('/photos/<photo_id>/recognize')
def recognize(photo_id: str):
    """Распознавание признаков vision-моделью. Без настроек — 409."""
    row = auth.require_auth()
    auth.require_csrf(row)
    return jsonify(photos.recognize(photo_id))


@bp.delete('/photos/<photo_id>')
def delete(photo_id: str):
    row = auth.require_auth()
    auth.require_csrf(row)
    photos.delete(photo_id)
    return '', 204
