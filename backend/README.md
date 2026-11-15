# XScience — backend (Flask)

The server side of the fire-hazard assessment panel. Implements the API
from `FUNCTIONAL_SPEC.md` §18: analyses, sectors, ship status, reports, the
AI text module, the risk ML model, the d² law, and flame photos. **The
server performs the entire calculation** — the client only sends the raw
input (§4.1) and receives back the finished record (§4.2) with scores,
verdict, and texts (§18.3).

The panel has no login — every endpoint is open, by design: it is meant to
run as an open access point for whoever can reach it.

There are two different "AI"s in the project — don't confuse them:

| What | How it's done | Affects the verdict |
| --- | --- | --- |
| Report texts and recommendations (§2.2, §15) | a language model from any provider, falling back to the §15 rules | **no**, prose only |
| Risk and extinction prediction (§17.1) | softmax regression trained on the §19 dataset | **no**, the verdict comes from the §14 calculation |
| Flame-photo features (§17.3) | a vision model from the same layer | **no**, this is an observation |

Scores, levels, verdict, and confidence are always computed by the
deterministic §14 rules. The model never sees them as something to
contest: it receives them already finished and only writes the text.

## Running it

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt                      # Flask
cp .env.example .env                                 # and fill in secrets
python3 run.py                                       # http://127.0.0.1:5000
```

Port **5000** — `frontend/vite.config.ts` already proxies to it. Next:

```bash
cd ../frontend && npm run dev      # http://localhost:5173
```

The client selects the API implementation via the `VITE_API` variable:
`http` (default — this backend) or `local` (calculation in the browser, a
server-free prototype).

## Verification

```bash
cd backend && python3 -m unittest discover -s tests -t .   # 82 tests
cd ../frontend && npm run e2e                              # real httpApi against a live server
```

Checking a live model provider (a single request, no DB or server needed):

```bash
cd backend
set -a; . ./.env; set +a
python3 scripts/check_ai.py                     # report texts
python3 scripts/check_ai.py --photo flame.jpg   # plus §17.3 recognition
```

The script prints whether the model's response was accepted or whether the
record would have fallen back to the §15 rules, and shows the texts
themselves. Exit code 1 means the response was rejected or the provider was
unreachable.

- `tests/test_scoring.py` — the §23 control examples (A–F) and the ship
  aggregation example: the same numbers as in the specification and the TS version.
- `tests/test_api.py` — endpoints, idempotency, validation, record
  immutability, the report document.
- `tests/test_ai.py` — provider adapters (via a local fake server, no
  network or keys needed), model-response validation, fallback to the §15 rules.
- `tests/test_models.py` — the dataset, §17.1 checks, training and prediction,
  the d² law.
- `tests/test_photos.py` — upload, file-content validation, annotation,
  recognition.

`npm run e2e` requires a running server and an empty database.

## Structure

```
app/
  __init__.py      app factory, CORS, report-transmission background thread
  config.py        config from the environment (.env.example)
  db.py            sqlite3 without an ORM; schema.sql — the §4.4/§4.2/§4.3 tables
  errors.py        the §18.9 unified error format
  domain/          pure logic, a line-by-line port of frontend/src/domain/
    scoring.py     §14 — scores, levels, verdict, confidence
    validation.py  §9.3, §4.1 — input validation → 422
    texts.py       §15 — explanation, conclusion, recommendations, assumptions
    report.py      §11 — report document, TXT, CSV
    ship.py        §7.4 — ship-status aggregation
    reference.py   §3 — materials, sectors, ranges, labels
    dataset.py     §19 — dataset and cross-check against the formulas
    d2.py          §17.2 — the law d²(t) = d₀² − K·t
  services/
    security.py    id generation, idempotency request-body hashing
    analyses.py    creating and reading §4.2 records
    reports.py     reports and the Earth-transmission mock-up
    ml.py          §17.1 — training and prediction (softmax regression, stdlib)
    photos.py      §17.3 — files outside the web root, annotation, recognition
    ai/            the AI layer, the provider is plugged in via config
      base.py        neutral request types (text + image) and ProviderConfig
      config.py      reads XSCI_AI_* with per-function overrides
      client.py      calls the adapter + lenient JSON-response parsing
      texts.py       §15 — report texts, validation, fallback to the rules
      vision.py      §17.3 — photo features from a fixed vocabulary
      providers/     openai_compat, anthropic, google
  api/             blueprints by §18 section
  data/            dataset_extra.csv (the §19 dataset extension)
scripts/
  gen_dataset.py   dataset-extension generator
```

The calculation and text logic is a line-by-line port of
`frontend/src/domain/*.ts`; when the rules are edited, **both**
implementations must change (or the calculation can be dropped from the
client, keeping it only for `VITE_API=local` mode).

## Endpoints

| Method and path | § | Purpose |
| --- | --- | --- |
| `POST /api/analyses` | 18.3 | input §4.1 → `201 {analysis, report, alert_level}` |
| `GET /api/analyses` | 18.3 | `?sector=&limit=&before_id=`, newest first |
| `GET /api/analyses/{id}` | 18.3 | a single record |
| `POST /api/analyses/{id}/ack` | 18.3 | "Acknowledged" by the operator |
| `GET /api/analyses.csv` | 16.2 | history export |
| `GET /api/sectors` | 18.2 | sectors with geometry |
| `GET /api/ship/status` | 18.2 | aggregation from the latest sector analyses |
| `GET /api/reports` | 18.4 | `?limit=&since=` |
| `GET /api/reports/{id}` | 18.4 | the report document (§11.2) |
| `GET /api/reports/{id}.txt` | 18.4 | TXT (§11.3) |
| `POST /api/reports/{id}/resend` | 18.4 | resend |
| `POST /api/photos` | 18.7 | multipart `file` + optional `analysis_id` → metadata |
| `GET /api/photos` | 18.7 | `?analysis_id=`, a list |
| `GET /api/photos/{id}` | 18.7 | metadata for a single photo |
| `GET /api/photos/{id}/file` | 18.7 | the photo itself |
| `PATCH /api/photos/{id}` | 18.7 | operator annotation, linking to an analysis |
| `POST /api/photos/{id}/recognize` | 17.3 | photo features from the vision model |
| `DELETE /api/photos/{id}` | 18.7 | delete the photo and its file |
| `GET /api/models/ml/readiness` | 17.1 | the four data-readiness checks + model state |
| `POST /api/models/ml/train` | 17.1 | training; `409` with reasons if the checks fail |
| `POST /api/models/ml/predict` | 17.1 | prediction from the trained model; `409` without a model |
| `POST /api/models/d2` | 17.2 | `{d0_mm, k_mm2_s}` → `t_burn_s` + 41 chart points |
| `GET /api/dataset` | 18.5 | the §19 dataset with cross-checks; `?dataset=v1\|v2`, `?only_mismatches=1` |
| `GET /api/health` | — | liveness check + what AI configuration is set (no keys returned) |
| `GET /api/sensors` | — | [PROTOTYPE] sensor-simulation status: `{enabled, manual_override}` |
| `POST /api/sensors/toggle` | — | `{enabled}` — turns generation on/off; enabling resets `manual_override` |
| `POST /api/sensors/override` | — | `{enabled}` — unlock manual entry while sensors are enabled |

Every endpoint is open — there is no login or session. `POST /api/analyses`
accepts an `Idempotency-Key`: a retry with the same key and body returns the
original record (`200`); a different body returns `409`.

## AI module: plugging in any provider

The provider is chosen via config; the code doesn't change. `XSCI_AI_PROVIDER`:

| Value | What it connects to |
| --- | --- |
| `openai_compat` | any OpenAI-compatible gateway: OpenRouter and other routers, Groq, Together, DeepSeek, local Ollama / LM Studio / vLLM. Aliases: `openai`, `openrouter`, `ollama`, `lmstudio`, `vllm`, `groq`, `together` |
| `anthropic` | the Anthropic Messages API (alias `claude`) |
| `google` | Google AI Studio / Gemini (aliases `gemini`, `aistudio`, `googleai`) |
| `none` (default) | AI disabled, texts are written by the §15 rules |

Minimal set: `XSCI_AI_PROVIDER`, `XSCI_AI_MODEL`, `XSCI_AI_API_KEY`, and
`XSCI_AI_BASE_URL` (for OpenAI-compatible providers). Example — OpenRouter:

```bash
XSCI_AI_PROVIDER=openrouter
XSCI_AI_BASE_URL=https://openrouter.ai/api/v1
XSCI_AI_MODEL=<publisher>/<model>
XSCI_AI_API_KEY=<key>
```

The full list of variables, per-API parameters (`XSCI_AI_EXTRA_JSON`), and
examples for Anthropic, Google AI Studio, and Ollama are in `.env.example`.
Each function can have its own provider and model: `XSCI_AI_TEXTS_*` and
`XSCI_AI_VISION_*` override the shared values, and `XSCI_AI_TEXTS=0` /
`XSCI_AI_VISION=0` disable a function. What's actually configured is
visible at `GET /api/health` (keys are never returned).

A custom provider is added as a module in `app/services/ai/providers/`
with a `complete(system, parts, cfg)` function and an entry in `REGISTRY`.

### How it's built, and why

- **The model never computes or disputes the numbers.** It receives the
  parameters, score components, verdict, and confidence as given facts and
  writes only `summary`, `why`, `why_ext`, `rec_intro`, and the
  recommendation steps. Step numbering is assigned by the server.
- **The response is validated.** Formatting is fixed up silently: markup
  (`**`, `` ` ``, `_`) is stripped, numbering the model put in a step title
  is removed (the server assigns it), as are quotes and line breaks;
  overly long values are truncated at a word boundary. Only substantively
  broken responses are rejected — a required field missing, not a string,
  text shorter than the minimum, fewer than 2 or more than 10 steps, or an
  empty step title or description. An unusable response, a timeout, an
  unreachable provider, or missing configuration are all *not* request
  errors: the record gets the deterministic §15 texts instead, and the
  `texts_source` (`llm` / `rules`) and `texts_model` fields honestly state
  what wrote the report. The same note is included in the report's own
  "Limitations" section.
- **The report never changes after the fact.** The text is generated once,
  when the analysis is created, and stored together with it (§15), so
  re-reading the report never calls the model again and can never produce
  a different result.
- **Latency.** Generation runs synchronously inside `POST /api/analyses`;
  the wait limit is `XSCI_AI_TIMEOUT_S` (25 s by default), after which the
  rules take over. On the client this time is shown as "calculating" (§9.5).

## Risk and extinction ML model (§17.1)

`GET /api/models/ml/readiness` runs the four §17.1 checks against the
current dataset and reports the model's state. `POST /api/models/ml/train`
trains a softmax regression (pure Python, no dependencies) on two targets —
`risk_level` and `extinction_probability`; the features are a one-hot
material encoding, gravity, and normalized numeric fields.
`POST /api/models/ml/predict` returns classes with probabilities.

**The prediction never replaces the verdict** (§17.1): the verdict always
comes from the §14 calculation; the prediction is a separate, informational value.

Dataset: the original 30 rows from §19.2 (`dataset=v1`) fail three of the
four checks, so `scripts/gen_dataset.py` adds an extension (`dataset=v2`,
`app/data/dataset_extra.csv`): 90 rows that vary `risk_level` (all three
classes) and `gravity`, with `data_source` values valid per the §19.1 schema.

```bash
python3 scripts/gen_dataset.py --rows 90 --seed 20261114   # deterministic output
```

**An honest limitation that must not be forgotten:** the extension's labels
are computed by the §14 formulas, so the dataset remains `simulated`. The
trained model reproduces the rules rather than independent observations and
is not proof of the underlying physics — this is visible in the responses
(`labels_are_rule_derived: true`) and in the training note. On the current
dataset, held-out accuracy is around 0.87 (risk_level) and 0.78
(extinction_probability). For the model to add anything beyond the rules,
real measurements are needed, not a recomputation of the rules (§19.3). The
`flame_size_cm`, `flame_spread_rate_cm_s`, and `expected_result` fields in
the extension are left empty: no rule is defined for them (§19.1), and
values must not be invented for the dataset.

Rows whose `data_source` falls outside the §19.1 schema are excluded from
training — which is why the `data_source` check in `readiness` remains
unmet (90 out of 120), while training is still available: `training_set`
shows how many rows were excluded and why.

## Flame photos (§17.3)

`POST /api/photos` (multipart) accepts a single JPEG or PNG photo; the type
is determined from the file content, not the header, with a size limit of
`XSCI_PHOTO_MAX_MB` (8 MB). Files live in `XSCI_PHOTO_DIR` (`data/photos`,
outside the web root) and are served via `GET /api/photos/{id}/file`.

`PATCH /api/photos/{id}` — operator annotation from the §17.3 vocabulary
(size / brightness / shape; an empty value clears the selection).
`POST /api/photos/{id}/recognize` — the same three features from the vision
model; values outside the vocabulary are not accepted, and "no flame
visible" zeroes out the features. The operator's annotation and the model's
result are stored **separately**: recognition never overwrites what a
human set.

Photo features are an observation: they are not part of the risk/extinction
calculation and do not affect the verdict (§17.3).

## Security

There is no authentication layer: the panel is meant to be reachable by
anyone who can reach the host. Put access control (a reverse proxy, VPN, or
network-level restriction) in front of it if that's ever a requirement.

### Before production

1. `XSCI_ENV=production` — disables debug mode.
2. Run under a WSGI server (gunicorn/waitress) — `run.py` is for dev only.
   With multiple workers, the report-transmission background thread must
   run in exactly one process: set `XSCI_REPORT_WORKER=0` on the other
   workers and run a separate process that calls `reports.flush_queue`,
   otherwise reports will be marked sent in a race. The same applies to the
   sensor simulation (`XSCI_SENSOR_WORKER=0` on the extra workers, see
   below): two processes independently advancing the Markov state would
   produce an inconsistent history.

## Sensor simulation (prototype, §16.17 — there are no real sensors)

Every `XSCI_SENSOR_TICK_S` (30 s by default) the server generates its own
per-sector readings using the same §14 rules and writes them as ordinary
analyses (`source=sensor`) — this is what keeps the live dashboard going
(via the existing `GET /api/analyses` polling). Normally a single "hot
spot" is active: a sector progresses through the chain low → medium → high
and back (no skipping a step), and adjacent sectors
(`sector_adjacency()`, geometry §3.4) may pick up `medium` while the hot
spot is `high`; the remaining sectors stay `low`. Every
`XSCI_SHIP_REPORT_INTERVAL_S` seconds (300 by default, a multiple of the
tick) a full pass over all seven sectors is captured with a report — only
these records show up in the client's "Reports" tab; intermediate readings
do not generate a report.

Turned on not via config but by a toggle in the interface —
`GET/POST /api/sensors*` (§18, see the endpoint table above).
`XSCI_SENSOR_WORKER` disables the background thread itself (like
`REPORT_WORKER`), not the generation — by default the thread runs but does
nothing while the toggle is off.

## Decisions made on open questions (§24)

| Question | Decision |
| --- | --- |
| 16.1 — range-boundary inclusion | as in §14.1, boundaries are inclusive; reflected in "Calculation Assumptions" |
| 16.16 — report confirmation channel | mock-up: queue → `sent` after 2.5 s, status in the DB (survives a restart, unlike the prototype) |
| 16.19 — how long a sector analysis stays valid | unlimited: the sector's latest analysis is always used (as in the prototype); once a policy exists — filter by `created_at` in `/api/ship/status` |
| 17.3 — linking a photo to an analysis | `analysis_id` is optional: supplied at upload time or later via `PATCH`; photo features are not part of the calculation |
| 19.1 — invalid `data_source` in the dataset | v1 rows are left as-is (the "Data" tab relies on them) but excluded from training; the extension uses `simulated` |

## What's not implemented

- `/api/sensors/*` (§18.8) — there are no real sensors, and the
  specification leaves the format open [QUESTION 16.17].
- `/api/reference` (§18.5) — the client keeps its own reference tables; the
  endpoint is only needed if a second client appears.
- The client is wired up to everything listed above: the "Models" tab pulls
  checks, training, and prediction from the server, "Data" pulls the §19
  dataset, photos go to `POST /api/photos` with a "Recognize" button, and
  "Acknowledged" calls `ack`. All that remains missing is what's also
  missing on the server: §18.8 sensors.
