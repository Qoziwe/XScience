# Architecture documentation: XScience Server (Termux Edition)

This document describes deploying the fire-hazard assessment panel's backend
on Android (Termux): daemonizing it via `Runit` (`termux-services`),
tunneling traffic through Cloudflare Zero Trust
(`xscienceapi.andatra.space`), and administering the service. The frontend
(React) is deployed separately on GitHub Pages — see "Frontend" below.

## 1. Overview

```
[ Operator's browser ]
        │ HTTPS
        ▼
[ xscience.andatra.space ]  ──  GitHub Pages (static React, CNAME)
        │ fetch (credentials: include), CORS
        ▼
[ Cloudflare Edge: Zero Trust Tunnel "termux-android" ]
        │ xscienceapi.andatra.space -> 127.0.0.1:5007
        ▼
[ Phone (Android + Termux) ]
        └──► [ Gunicorn (Runit daemon, -w 1 --threads 20, port 5007) ]
                    ├──► Flask app (app/__init__.py)
                    ├──► Report transmission background thread (XSCI_REPORT_WORKER)
                    ├──► Sensor simulation background thread (XSCI_SENSOR_WORKER)
                    └──► SQLite (backend/data/xscience.sqlite3)
```

**Important:** `-w 1` (a single worker) is mandatory. Both background
threads (report transmission and the Markov-chain sensor simulation) must
advance state in only one process — with multiple workers/processes they
would race each other and produce an inconsistent history (see
`backend/README.md`, the "Before production" section).

## 2. Frontend (separate from this document)

* **Hosting:** GitHub Pages, workflow `.github/workflows/pages.yml`,
  deployed on push to `main` (paths `frontend/**`).
* **Domain:** `xscience.andatra.space`; the custom domain is registered via
  `gh api repos/Qoziwe/XScience/pages` (`cname` + `https_enforced=true`) —
  with a workflow deploy (`build_type=workflow`), having
  `frontend/public/CNAME` in the artifact alone is not enough; Pages does not
  register the custom domain automatically, a separate API call/setting
  under Settings → Pages is required.
* **`VITE_API_BASE_URL`** in the workflow points to `https://xscienceapi.andatra.space/api`.

## 3. Backend on Termux

* **Path on the device:** `/data/data/com.termux/files/home/XScience/backend`
* **Python:** a venv (`backend/venv`), run under Termux Python (at deploy
  time — cp314, arm64).
* **Dependencies:** `requirements.txt` (Flask, optionally `argon2-cffi` —
  without the `clang` compiler in Termux it builds slowly/fails, and without
  it the backend falls back to stdlib `scrypt` on its own) + `python-dotenv`
  and `gunicorn`, delivered separately (they aren't in `requirements.txt`,
  needed only for the production run on the phone).
* **Config:** `.env` (from `.env.example`), key differences from the template:
  ```
  XSCI_PORT=5007
  XSCI_COOKIE_SECURE=1
  XSCI_COOKIE_DOMAIN=.andatra.space
  XSCI_CORS_ORIGIN=https://xscience.andatra.space
  ```
  `XSCI_ENV` is left as `development` so the static second-factor demo code
  still works (`XSCI_DEMO_CODE=123456`, demo account `demo` /
  `xscience-demo`) for the hackathon demo.
* **Important:** `run.py`/`app/config.py` themselves do not call
  `load_dotenv()` — a plain `python3 run.py` won't pick up `.env` even with
  `python-dotenv` installed. So the variables are loaded explicitly in the
  daemon's run script (`set -a; . ./.env; set +a`) before starting gunicorn.

### A. Daemonization (Runit / termux-services)

* **Service directory:** `$PREFIX/var/service/xscience-backend/`
* **Run script** (`$PREFIX/var/service/xscience-backend/run`):
  ```sh
  #!/data/data/com.termux/files/usr/bin/sh
  exec 2>&1
  cd /data/data/com.termux/files/home/XScience/backend
  set -a
  . ./.env
  set +a
  exec /data/data/com.termux/files/home/XScience/backend/venv/bin/gunicorn -w 1 --threads 20 -b 127.0.0.1:5007 run:app
  ```
* **Logging:** `$PREFIX/var/service/xscience-backend/log/run` — a symlink to
  `$PREFIX/share/termux-services/svlogger`. Logs are written to
  `$PREFIX/var/log/sv/xscience-backend/current`.
  * Gotcha: if `log/` is created AFTER `runsv` for the service is already
    running, it won't notice the new subdirectory and `log/supervise/` won't
    appear (`sv status` will report `unable to open supervise/ok`). Fix —
    kill the `runsv xscience-backend` process (`pgrep -fa 'runsv
    xscience-backend'` → `kill <pid>`); `runsvdir` will bring it back up and
    pick up `log/` this time.

### B. Networking and the Cloudflare Zero Trust Tunnel

* **Tunnel connector:** `termux-android` — a shared tunnel for several
  projects on this device (routes: `eventumapi`→5001, `termuxssh`→ssh
  8022, `amadeus`→5002, `chan`→5003, `presentum`→5004, `observatum`→5005,
  `venator`→5006, **`xscienceapi`→5007**). No separate tunnel is needed —
  only a new published application route in the existing one.
* **Route:** `xscienceapi.andatra.space` ➔ `http://127.0.0.1:5007`.
* ⚠️ Use `127.0.0.1`, not `localhost` — on Android/Bionic, resolving
  `localhost` to IPv6 `::1` adds a ~5-second delay per request.
* **`cloudflared tunnel login`** is broken on Termux (`SIGSYS` on
  `faccessat2` when trying to open a browser — Android's seccomp blocks the
  syscall, and the Go runtime crashes instead of falling back gracefully).
  This isn't needed anyway: the `termux-android` tunnel is remotely managed
  (token-based, no `cert.pem`), and routing is configured entirely in the
  Cloudflare dashboard — nothing local is required.

## 4. Layout on Termux

```text
~/XScience/
├── backend/
│   ├── .env                  # production config secrets (not in git)
│   ├── .env.example
│   ├── run.py                 # entry point (app = create_app())
│   ├── seed.py                 # demo account
│   ├── requirements.txt
│   ├── app/                    # factory, domain, services, API — see backend/README.md
│   ├── data/
│   │   └── xscience.sqlite3
│   └── venv/
└── frontend/                    # deployed separately on GitHub Pages, not needed on the phone
```

## 5. Administration cheat sheet

### Service:
```bash
sv status xscience-backend         # status (main + log)
sv restart xscience-backend        # after git pull / editing .env
sv down xscience-backend
sv up xscience-backend
```

### Logs:
```bash
cat $PREFIX/var/log/sv/xscience-backend/current     # all lines since the last rotation
tail -f $PREFIX/var/log/sv/xscience-backend/current # live
```

### Updating the code:
```bash
cd ~/XScience && git pull
cd backend && ./venv/bin/pip install -r requirements.txt   # if dependencies changed
sv restart xscience-backend
```

### Liveness check:
```bash
curl -i http://127.0.0.1:5007/api/me   # 401 {"error":"unauthorized"} — the server is alive, just not logged in
curl -i https://xscienceapi.andatra.space/api/me   # the same, from outside, through the tunnel
```

### Keeping the phone powered 24/7:
```bash
termux-wake-lock   # keeps the CPU from going into deep sleep with the screen off
```
Also, in Android settings — exclude Termux from battery optimization,
otherwise the OS may kill the process after a long idle period.
