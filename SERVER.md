# Архитектурная документация: XScience Server (Termux Edition)

Этот документ описывает развёртывание бэкенда панели оценки пожарной
обстановки на Android (Termux): демонизацию через `Runit`
(`termux-services`), туннелирование трафика через Cloudflare Zero Trust
(`xscienceapi.andatra.space`) и администрирование службы. Фронтенд (React)
развёрнут отдельно на GitHub Pages — см. ниже «Фронтенд».

## 1. Обзор

```
[ Браузер оператора ]
        │ HTTPS
        ▼
[ xscience.andatra.space ]  ──  GitHub Pages (статика React, CNAME)
        │ fetch (credentials: include), CORS
        ▼
[ Cloudflare Edge: Zero Trust Tunnel "termux-android" ]
        │ xscienceapi.andatra.space -> 127.0.0.1:5007
        ▼
[ Смартфон (Android + Termux) ]
        └──► [ Gunicorn (Runit-демон, -w 1 --threads 20, порт 5007) ]
                    ├──► Flask app (app/__init__.py)
                    ├──► Фоновый поток передачи отчётов (XSCI_REPORT_WORKER)
                    ├──► Фоновый поток имитации датчиков (XSCI_SENSOR_WORKER)
                    └──► SQLite (backend/data/xscience.sqlite3)
```

**Важно:** `-w 1` (один воркер) обязателен. Оба фоновых потока (передача
отчётов и марковская имитация датчиков) должны продвигать состояние только
в одном процессе — при нескольких воркерах/процессах они начнут работать
наперегонки и дадут противоречивую историю (см. `backend/README.md`,
раздел «Перед продом»).

## 2. Фронтенд (отдельно от этого документа)

* **Хостинг:** GitHub Pages, workflow `.github/workflows/pages.yml`, деплой
  при пуше в `main` (пути `frontend/**`).
* **Домен:** `xscience.andatra.space`, custom domain зарегистрирован через
  `gh api repos/Qoziwe/XScience/pages` (`cname` + `https_enforced=true`) —
  при workflow-деплое (`build_type=workflow`) одного файла
  `frontend/public/CNAME` в артефакте недостаточно, Pages не регистрирует
  кастомный домен автоматически, нужен отдельный вызов API/настройка в
  Settings → Pages.
* **`VITE_API_BASE_URL`** в workflow указывает на `https://xscienceapi.andatra.space/api`.

## 3. Бэкенд на Termux

* **Путь на устройстве:** `/data/data/com.termux/files/home/XScience/backend`
* **Python:** venv (`backend/venv`), запуск под Termux Python (на момент
  деплоя — cp314, arm64).
* **Зависимости:** `requirements.txt` (Flask, опционально `argon2-cffi` —
  без компилятора `clang` в Termux собирается долго/падает, без него
  бэкенд сам переключается на `scrypt` из stdlib) + `python-dotenv` и
  `gunicorn`, доставленные отдельно (их нет в `requirements.txt`, нужны
  только для прод-запуска на телефоне).
* **Конфиг:** `.env` (из `.env.example`), ключевые отличия от шаблона:
  ```
  XSCI_PORT=5007
  XSCI_COOKIE_SECURE=1
  XSCI_COOKIE_DOMAIN=.andatra.space
  XSCI_CORS_ORIGIN=https://xscience.andatra.space
  ```
  `XSCI_ENV` оставлен `development`, чтобы работал статический демо-код
  второго фактора (`XSCI_DEMO_CODE=123456`, демо-учётка `demo` /
  `xscience-demo`) для показа на хакатоне.
* **Важно:** сам `run.py`/`app/config.py` не вызывают `load_dotenv()` —
  simple `python3 run.py` не подхватывает `.env` даже с установленным
  `python-dotenv`. Поэтому переменные грузятся явно в run-скрипте демона
  (`set -a; . ./.env; set +a`) перед запуском gunicorn.

### A. Демонизация (Runit / termux-services)

* **Служебная директория:** `$PREFIX/var/service/xscience-backend/`
* **Run-скрипт** (`$PREFIX/var/service/xscience-backend/run`):
  ```sh
  #!/data/data/com.termux/files/usr/bin/sh
  exec 2>&1
  cd /data/data/com.termux/files/home/XScience/backend
  set -a
  . ./.env
  set +a
  exec /data/data/com.termux/files/home/XScience/backend/venv/bin/gunicorn -w 1 --threads 20 -b 127.0.0.1:5007 run:app
  ```
* **Логирование:** `$PREFIX/var/service/xscience-backend/log/run` —
  симлинк на `$PREFIX/share/termux-services/svlogger`. Логи пишутся в
  `$PREFIX/var/log/sv/xscience-backend/current`.
  * Грабли: если `log/` создать ПОСЛЕ того, как `runsv` для сервиса уже
    запущен, он не заметит новую поддиректорию и `log/supervise/` не
    появится (`sv status` будет писать `unable to open supervise/ok`).
    Фикс — убить процесс `runsv xscience-backend` (`pgrep -fa 'runsv
    xscience-backend'` → `kill <pid>`), `runsvdir` поднимет его заново и
    на этот раз подхватит `log/`.

### B. Сеть и Cloudflare Zero Trust Tunnel

* **Коннектор тоннеля:** `termux-android` — общий тоннель для нескольких
  проектов на этом устройстве (routes: `eventumapi`→5001, `termuxssh`→ssh
  8022, `amadeus`→5002, `chan`→5003, `presentum`→5004, `observatum`→5005,
  `venator`→5006, **`xscienceapi`→5007**). Отдельный тоннель заводить не
  нужно — только новый published application route в существующем.
* **Route:** `xscienceapi.andatra.space` ➔ `http://127.0.0.1:5007`.
* ⚠️ Указывать именно `127.0.0.1`, а не `localhost` — на Android/Bionic
  резолв `localhost` в IPv6 `::1` даёт задержку ~5 секунд на запрос.
* **`cloudflared tunnel login`** на Termux ломается (`SIGSYS` на
  `faccessat2` при попытке открыть браузер — seccomp Android блокирует
  синтаксис, Go-рантайм падает вместо грациозного фолбэка). Это не нужно:
  тоннель `termux-android` remotely-managed (токен, без `cert.pem`),
  роутинг настраивается целиком в дашборде Cloudflare, локально — ничего.

## 4. Структура на Termux

```text
~/XScience/
├── backend/
│   ├── .env                  # секреты прод-конфига (не в git)
│   ├── .env.example
│   ├── run.py                 # точка входа (app = create_app())
│   ├── seed.py                 # демо-учётка
│   ├── requirements.txt
│   ├── app/                    # фабрика, домен, сервисы, API — см. backend/README.md
│   ├── data/
│   │   └── xscience.sqlite3
│   └── venv/
└── frontend/                    # деплоится отдельно на GitHub Pages, на телефоне не нужен
```

## 5. Шпаргалка администрирования

### Служба:
```bash
sv status xscience-backend         # статус (main + log)
sv restart xscience-backend        # после git pull / правки .env
sv down xscience-backend
sv up xscience-backend
```

### Логи:
```bash
cat $PREFIX/var/log/sv/xscience-backend/current     # все строки с момента ротации
tail -f $PREFIX/var/log/sv/xscience-backend/current # вживую
```

### Обновление кода:
```bash
cd ~/XScience && git pull
cd backend && ./venv/bin/pip install -r requirements.txt   # если менялись зависимости
sv restart xscience-backend
```

### Проверка живости:
```bash
curl -i http://127.0.0.1:5007/api/me   # 401 {"error":"unauthorized"} — сервер жив, просто не залогинен
curl -i https://xscienceapi.andatra.space/api/me   # то же самое снаружи, через тоннель
```

### Питание телефона 24/7:
```bash
termux-wake-lock   # не даёт CPU уходить в глубокий сон при выключенном экране
```
Плюс в настройках Android — исключить Termux из оптимизации батареи,
иначе ОС может убить процесс при долгом простое.
