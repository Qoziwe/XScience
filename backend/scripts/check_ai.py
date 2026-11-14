#!/usr/bin/env python3
"""
Проверка настроенного ИИ-модуля на живом провайдере — один запрос, без БД
и без сервера. Нужна, чтобы после вставки ключа сразу увидеть, принимается
ли ответ модели или запись молча уйдёт на правила §15.

    cd backend
    set -a; . ./.env; set +a         # или экспортировать XSCI_AI_* вручную
    python3 scripts/check_ai.py                     # тексты отчёта
    python3 scripts/check_ai.py --photo flame.jpg   # ещё и распознавание §17.3

Код возврата 0 — ответ модели принят; 1 — отклонён или провайдер недоступен
(в бою это не ошибка запроса: отчёт будет написан правилами §15).
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.scoring import confidence_of, score, verdict_of_scores  # noqa: E402
from app.services.ai import config, texts as ai_texts, vision  # noqa: E402
from app.services.ai.base import LlmError, TextPart  # noqa: E402
from app.services.ai.client import complete_json  # noqa: E402

#: Контрольный пример A из §23 — на нём сверен весь расчёт.
CASE = {'material': 'paper', 'desc': '', 'thickness': 0.5, 'o2': 21, 'flow': 5,
        'gravity': 'microgravity', 'temp': 25, 'time': 30}
SECTOR = 'l1'


def check_texts(verbose: bool) -> bool:
    cfg = config.load('texts')
    if not cfg:
        print('✗ тексты: ИИ не настроен (XSCI_AI_PROVIDER / XSCI_AI_MODEL пусты).')
        print('  Отчёты будут писать детерминированные правила §15 — это рабочий режим.')
        return False

    s = score(CASE)
    v = verdict_of_scores(s)
    conf = confidence_of(CASE)
    print(f'→ тексты: {cfg.label()}, таймаут {cfg.timeout_s:g} с')

    started = time.monotonic()
    try:
        raw = complete_json(ai_texts.SYSTEM,
                            [TextPart(ai_texts.facts(CASE, s, SECTOR, v, conf))], cfg)
    except LlmError as e:
        print(f'✗ провайдер недоступен за {time.monotonic() - started:.1f} с: {e}')
        return False
    elapsed = time.monotonic() - started

    try:
        out = ai_texts.validate(raw)
    except LlmError as e:
        print(f'✗ ответ отклонён ({elapsed:.1f} с): {e}')
        print('  В таком случае сервер молча применит правила §15 '
              '(texts_source = rules). Поправьте промпт или модель.')
        if verbose:
            print(f'  Сырой ответ: {str(raw)[:600]}')
        return False

    print(f'✓ ответ принят за {elapsed:.1f} с, шагов {len(out["rec_steps"])}')
    print(f'\n  ЗАКЛЮЧЕНИЕ: {out["summary"]}')
    print(f'\n  РИСК: {out["why"]}')
    print(f'\n  ЗАТУХАНИЕ: {out["why_ext"]}')
    print(f'\n  ВВОДКА: {out["rec_intro"]}')
    for step in out['rec_steps']:
        print(f'  {step["n"]}. {step["title"]} — {step["detail"]}')
    print(f'\n  Расчёт при этом неизменен: R={s["risk"]} E={s["ext"]} '
          f'вердикт={v} уверенность={conf} (правила §14).')
    return True


def check_vision(path: Path, verbose: bool) -> bool:
    cfg = config.load('vision')
    if not cfg:
        print('\n✗ распознавание: не настроено (XSCI_AI_VISION_* / XSCI_AI_*).')
        return False
    if not path.exists():
        print(f'\n✗ распознавание: файл {path} не найден.')
        return False
    mime = 'image/png' if path.suffix.lower() == '.png' else 'image/jpeg'
    print(f'\n→ распознавание: {cfg.label()}, снимок {path.name}')
    started = time.monotonic()
    try:
        out = vision.recognize(path.read_bytes(), mime)
    except LlmError as e:
        print(f'✗ отклонено за {time.monotonic() - started:.1f} с: {e}')
        return False
    print(f'✓ принято за {time.monotonic() - started:.1f} с: '
          f'размер {out["size"]}, яркость {out["brightness"]}, форма {out["shape"]}')
    print(f'  {out["note"]}')
    if verbose:
        print(f'  пламя в кадре: {out["flame_visible"]}')
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--photo', type=Path, help='снимок для проверки распознавания §17.3')
    ap.add_argument('-v', '--verbose', action='store_true', help='показывать сырой ответ')
    args = ap.parse_args()

    print('Настроено:', config.describe())
    ok = check_texts(args.verbose)
    if args.photo:
        ok = check_vision(args.photo, args.verbose) and ok
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
