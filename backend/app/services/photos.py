"""
Фото пламени (§4.5, §17.3, §18.7).

Файлы лежат в каталоге вне веб-корня (XSCI_PHOTO_DIR, по умолчанию
data/photos) и отдаются только по сессии. В БД — метаданные, разметка
оператора и, отдельно, результат распознавания моделью.

[ВОПРОС §17.3] привязка фото к анализу спецификацией не решена. Принятое
решение: analysis_id необязателен — его можно передать при загрузке или
позже через PATCH; признаки снимка остаются наблюдением и в расчёт риска
и затухания не входят.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import current_app

from ..db import execute, query
from ..domain.format import iso, utc_now
from ..errors import ApiError, not_found, validation_error
from .ai import vision
from .ai.base import LlmError
from .security import new_id

#: §17.3 — «JPEG или PNG, один снимок».
ALLOWED = {'image/jpeg': '.jpg', 'image/png': '.png'}
#: Подпись файла — проверяем содержимое, а не только заголовок Content-Type.
MAGIC = ((b'\xff\xd8\xff', 'image/jpeg'), (b'\x89PNG\r\n\x1a\n', 'image/png'))


def storage_dir() -> Path:
    path = Path(current_app.config['PHOTO_DIR'])
    path.mkdir(parents=True, exist_ok=True)
    return path


def sniff(data: bytes) -> str | None:
    for prefix, mime in MAGIC:
        if data.startswith(prefix):
            return mime
    return None


def save(file_name: str, data: bytes, analysis_id: int | None,
         user_id: str | None) -> dict[str, Any]:
    limit = current_app.config['PHOTO_MAX_BYTES']
    if not data:
        raise validation_error({'file': 'Выберите снимок'})
    if len(data) > limit:
        raise validation_error({'file': f'Снимок больше {limit // (1024 * 1024)} МБ'})
    mime = sniff(data)
    if not mime:
        raise validation_error({'file': 'Поддерживаются только JPEG и PNG'})
    if analysis_id is not None and not query(
            'SELECT id FROM analyses WHERE id = ?', (analysis_id,), one=True):
        raise validation_error({'analysis_id': 'Анализ не найден'})

    photo_id = new_id('ph')
    stored = photo_id + ALLOWED[mime]
    (storage_dir() / stored).write_bytes(data)
    execute('INSERT INTO photos (id, analysis_id, file_name, size_bytes, mime, '
            'stored_name, uploaded_at, uploaded_by, annotation) '
            'VALUES (?,?,?,?,?,?,?,?,?)',
            (photo_id, analysis_id, (file_name or 'photo')[:200], len(data), mime,
             stored, iso(utc_now()), user_id, '{}'))
    return public(_row(photo_id))


def _row(photo_id: str) -> Any:
    row = query('SELECT * FROM photos WHERE id = ?', (photo_id,), one=True)
    if not row:
        raise not_found()
    return row


def public(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'],
        'analysis_id': row['analysis_id'],
        'file_name': row['file_name'],
        'size_bytes': row['size_bytes'],
        'mime': row['mime'],
        'uploaded_at': row['uploaded_at'],
        'annotation': json.loads(row['annotation'] or '{}'),
        'recognition': json.loads(row['recognition']) if row['recognition'] else None,
        'file_url': f'/api/photos/{row["id"]}/file',
        'note': 'Наблюдения оператора. В расчёт риска и затухания не входят (§17.3).',
    }


def get(photo_id: str) -> dict[str, Any]:
    return public(_row(photo_id))


def listing(analysis_id: int | None = None, limit: int = 100) -> list[dict[str, Any]]:
    if analysis_id is not None:
        rows = query('SELECT * FROM photos WHERE analysis_id = ? ORDER BY uploaded_at '
                     'DESC LIMIT ?', (analysis_id, limit))
    else:
        rows = query('SELECT * FROM photos ORDER BY uploaded_at DESC LIMIT ?', (limit,))
    return [public(r) for r in rows]


def file_path(photo_id: str) -> tuple[Path, str, str]:
    row = _row(photo_id)
    path = storage_dir() / row['stored_name']
    if not path.exists():
        raise not_found()
    return path, row['mime'], row['file_name']


def annotate(photo_id: str, body: Any) -> dict[str, Any]:
    """Разметка оператора (§17.3): одиночный выбор, пустая строка снимает выбор."""
    row = _row(photo_id)
    if not isinstance(body, dict):
        raise validation_error({'_': 'Ожидается объект JSON'})
    current = json.loads(row['annotation'] or '{}')
    errors: dict[str, str] = {}
    for key, allowed in vision.VOCAB.items():
        if key not in body:
            continue
        value = body[key]
        if value in (None, ''):
            current.pop(key, None)
            continue
        if not isinstance(value, str) or value.strip().lower() not in allowed:
            errors[key] = 'Допустимо: ' + ', '.join(allowed)
            continue
        current[key] = value.strip().lower()
    if errors:
        raise validation_error(errors)

    analysis_id = row['analysis_id']
    if 'analysis_id' in body:
        value = body['analysis_id']
        if value is None:
            analysis_id = None
        elif isinstance(value, int) and query('SELECT id FROM analyses WHERE id = ?',
                                              (value,), one=True):
            analysis_id = value
        else:
            raise validation_error({'analysis_id': 'Анализ не найден'})

    execute('UPDATE photos SET annotation = ?, analysis_id = ? WHERE id = ?',
            (json.dumps(current, ensure_ascii=False), analysis_id, photo_id))
    return public(_row(photo_id))


def recognize(photo_id: str) -> dict[str, Any]:
    """§17.3 — признаки по снимку vision-моделью. Разметку оператора не трогает."""
    row = _row(photo_id)
    path = storage_dir() / row['stored_name']
    if not path.exists():
        raise not_found()
    try:
        out = vision.recognize(path.read_bytes(), row['mime'],
                               logger=current_app.logger)
    except LlmError as e:
        if not vision.available():
            raise ApiError(409, 'vision_not_configured', detail=str(e)) from e
        raise ApiError(502, 'vision_failed', detail=str(e)) from e
    execute('UPDATE photos SET recognition = ? WHERE id = ?',
            (json.dumps(out, ensure_ascii=False), photo_id))
    return public(_row(photo_id))


def delete(photo_id: str) -> None:
    row = _row(photo_id)
    (storage_dir() / row['stored_name']).unlink(missing_ok=True)
    execute('DELETE FROM photos WHERE id = ?', (photo_id,))
