# XScience — backend plan (Flask)

> **Status (2026-11-14): the plan has been carried out.** The backend is implemented in `backend/`,
> and the client has been switched over to it (`frontend/src/api/httpApi.ts`). The current
> description of the server, startup commands, and the decisions made for §24 are
> in `backend/README.md`. This file is kept as the original plan and decision
> history; what was deferred from it is listed at the end.

This file is a checklist and contract for the next session, when the
backend gets written. The frontend (React, in `frontend/`) is already done and
waiting for the API; the screens and logic won't need to change — only the
server needs to be implemented and one file connected.

The source of truth for behavior is **FUNCTIONAL_SPEC.md**, section 18
("Proposed Backend API") and section 14 ("Calculation"). This is a digest of
what specifically needs to be done, without restating the whole specification.

## What's already done (frontend)

- A fully working React client in `frontend/`; the calculation currently runs
  in the browser (`frontend/src/api/localApi.ts`), with history in `localStorage`.
- The client is already split along a seam at `frontend/src/api/types.ts` — the
  `XScienceApi` interface with two blocks: `auth` (login/verifyCode/logout) and
  `analyses` (list/create/subscribe).
- All business logic (R/E calculation, texts, recommendations, report, ship
  aggregation) is already implemented in TypeScript in `frontend/src/domain/` —
  this is a direct port of §14–15 of the specification. **Use it as the
  reference when porting to Python**, rather than computing from the
  specification text from scratch:
  - `domain/scoring.ts` — R, E, levels, verdict, confidence (§14)
  - `domain/texts.ts` — explanations, conclusion, recommendations, assumptions (§15)
  - `domain/ship.ts` — ship-status aggregation (§7.4)
  - `domain/report.ts` — report document, TXT, CSV
  - `domain/reference.ts` — reference tables (materials, sectors, levels, colors)
- The dev proxy is already set up: `frontend/vite.config.ts` proxies `/api` →
  `http://127.0.0.1:5000`. The backend must listen on port 5000.
- The 6 control examples from §23 (A–F) and the aggregation example have been
  checked and match the current TS implementation — Python must produce the
  same numbers.

## What needs to be done

### 1. The `XScienceApi` contract → HTTP

Implement `frontend/src/api/httpApi.ts` with the same interface as
`localApi.ts` (see `frontend/src/api/types.ts`), and switch the export in
`frontend/src/api/index.ts`. Do not touch the screens.

```ts
export interface AuthApi {
  login(login: string, password: string): Promise<{ stage: 'code_required' }>;
  verifyCode(code: string): Promise<{ login: string; role: string; expiresAt: string }>;
  logout(): Promise<void>;
}
export interface AnalysesApi {
  list(): Promise<Analysis[]>;
  create(input: { sector: SectorId; params: AnalysisParams }): Promise<{ analysis: Analysis; alertLevel: Level | null }>;
  subscribe(listener: (hist: Analysis[]) => void): () => void; // polling or SSE/WS
}
```

### 2. Minimal set of endpoints (§18)

For the first version of the backend, this subset is enough — the rest
(ML models, photos, sensors) doesn't exist yet and the frontend has nothing
to source data from for it:

| Method and path | § | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | 18.1 | `{login, password}` → `200 {stage:"code_required"}` / `401 {error, attempts_left}` / `429 {error:"locked", retry_after_s}` |
| `POST /api/auth/code` | 18.1 | `{code}` → `200 {user, expires_at}` / `401 {error:"invalid_code", attempts_left}` / `401 {error:"restart_login"}` |
| `POST /api/auth/logout` | 18.1 | `204` |
| `GET /api/me` | 18.1 | `200 {login, role, expires_at}` / `401` |
| `POST /api/analyses` | 18.3 | body — `AnalysisInput` (§4.1) → `201` full record (§4.2) + `report` + `alert_level` |
| `GET /api/analyses` | 18.3 | list, ascending by `id` |
| `GET /api/analyses/{id}` | 18.3 | a single record |
| `GET /api/analyses.csv` | 18.3, 16.2 | CSV export |
| `GET /api/sectors` | 18.2 | list of sectors with geometry — currently hardcoded in the frontend too (`domain/reference.ts: SECTORS`); on the backend it can be served as a constant |
| `GET /api/ship/status` | 18.2 | aggregation — see `domain/ship.ts` |
| `GET /api/reports/{id}` / `.txt` | 18.4 | report document / TXT |
| `GET /api/reports?limit=&since=` | 18.4 | list of reports |

Defer to a separate task: `/api/analyses/{id}/ack`, `/api/models/*`,
`/api/photos`, `/api/sensors/*` — the frontend has stubs for these (the
"Acknowledged" button doesn't write anything, the "Models" tab doesn't call
the API); wire them up once ready.

### 3. The calculation contract — a hard rule

> The client **does not** send scores, levels, verdict, or texts — the server
> computes all of it. The server re-validates the input independently of the
> client (§9.3, §18.9).

This means: `POST /api/analyses` only accepts raw parameters
(`AnalysisInput`, §4.1), and the server computes the scores/levels/verdict/
confidence/texts/report itself and returns them in full in the response. To
port to Python:

- Field ranges and statuses — §9.3 (`domain/validation.ts`)
- Score and verdict formulas — §14 (`domain/scoring.ts`), including
  `stabilityAdjust`/`dangerIndex` (§14.4) and the uncertainty boundaries (§14.5)
- Text generation (explanation, conclusion, recommendations, assumptions) —
  §15 (`domain/texts.ts`) — the rules are deterministic, not AI
- `Idempotency-Key` for resubmission (§18.3) — protection against duplicates
  from a double-click or retry

Errors — a single format (§18.9):
```json
{ "error": "validation_failed", "fields": { "oxygen_percent": "Enter an oxygen concentration between 13 and 35 percent" } }
```
Codes: 400 (bad JSON), 401, 403, 404, 409 (Idempotency-Key conflict),
422 (validation), 429 (lockout/rate limit).

**Verification**: the control examples from §23 (A–F) must produce the same
R/E/verdict/confidence as in the specification's table and in the current TS
implementation — see `frontend/scripts/smoke.tsx` for an example of the test
structure, but the backend needs its own Python tests for `score()`/`verdict()`.

### 4. Authorization (§6.5)

Currently on the frontend [PROTOTYPE]: a demo account `demo` / `xscience-demo`,
code `123456`, hardcoded in `localApi.ts`. The backend needs:

- Passwords — argon2id or bcrypt, no reversible encryption
- TOTP (RFC 6238), 6 digits, a ±1 step window
- Password limit: 5 failures → 30 s lockout, counted by login **and** IP
- Code limit: 3 failures → invalidate the step-1 session
- Identical response and response time for "no such login" and "wrong password"
- Session: cookie `HttpOnly; Secure; SameSite=Strict`, 8 h absolute lifetime,
  15 min idle timeout
- A CSRF token on every mutating request
- No self-registration — accounts are created by an administrator; there
  must be no demo account in production
- A `login_attempts` table — log every attempt

### 5. Data model (§4, §16.3)

Tables: `users`, `sessions`, `login_attempts`, `analyses`, `reports`,
`photos` (photos — later, see §17.3/§18.7). Analyses and reports are
**never deleted or edited** (a safety log) — `INSERT` only.

The recommended full analysis record is §4.2, the `[BACKEND]` block with a
sample JSON (`scores`, `verdict`, `confidence_reasons`, `texts`,
`model_version`, `report_id`). Store the texts together with the analysis —
so the report doesn't change after the fact when the rules are edited (§15).

The DB has no 100-record limit (the `localStorage` limit is only in the
prototype); pagination on the client (`GET /api/analyses?limit=&before_id=`).

### 6. Report transmission to Earth (§11.4, §18.4)

Currently [MOCK-UP]: after 2.5 s the status flips `queued` → `sent`. On the
backend this can remain the same mock-up (a background task/timer), but the
status must survive a process restart (not be lost) and be delivered to the
client via polling `GET /api/reports?since=` or SSE/WS — decide at
implementation time; the client doesn't care, it just calls `subscribe()`.

### 7. Infrastructure

- Flask, port **5000** (the frontend proxy is already configured for it)
- CORS isn't needed in dev (Vite proxies), but is needed if the frontend and
  backend end up on different origins in production
- `.env`/config — session secret, DB settings; don't commit secrets
- Choice of DB and ORM — up to you (SQLite is plenty to start with; migrating
  to Postgres later isn't critical)

### 8. Open questions the backend will have to resolve explicitly (§24)

The specification leaves these points open — the backend needs to make a
decision (even a temporary one, with a comment) rather than get stuck:

- 16.1 — range-boundary inclusion (currently adopted as in §14.1, matching
  29 of 30 dataset rows)
- 16.16 — format/channel for confirming a report to Earth (a mock-up for now)
- 16.19 — how long a sector analysis stays valid for the overall ship assessment
- 16.21 — user roles and permissions (currently only `operator`)

## Where to start the next session

1. Stand up the Flask app with storage (SQLite) and an `Analysis` model.
2. Port `domain/scoring.ts` → Python 1:1, check it against the control
   examples in §23 (A–F) — this gives confidence that you won't need to
   cross-check against the TS version line by line from then on.
3. Endpoints in order of frontend dependency: `POST/GET /api/analyses` →
   `GET /api/sectors`, `GET /api/ship/status` → auth (`/api/auth/*`, `/api/me`).
4. Write `frontend/src/api/httpApi.ts`, switch over `index.ts`, run
   `npm run smoke` and manually walk through the §23 scenario via the UI.

## Done, and what remains

Done: the port of the calculation and texts to Python (`backend/app/domain/`,
checked against the §23 A–F control examples and the aggregation example),
the §18.1–18.4 endpoints (auth, analyses + CSV + ack, sectors, ship/status,
reports + TXT + resend), the §4.2/§4.3/§4.4 SQLite schema, §6.5 authorization
(argon2id/scrypt, TOTP, limits, cookie sessions, CSRF, attempt log),
`Idempotency-Key`, a report-transmission mock-up with status in the DB,
`frontend/src/api/httpApi.ts` + the `VITE_API` switch. Tests:
`backend/tests` (34) and `npm run e2e`.

Added after the first iteration (at the user's request — the AI part):
a provider-independent AI layer (`app/services/ai/`, configured via env:
OpenAI-compatible gateways, Anthropic, Google AI Studio) that generates
report texts with a fallback to the §15 rules; the §17.1 ML model (softmax
regression on the standard library) with readiness checks, training, and
prediction; the §19 dataset expansion (`scripts/gen_dataset.py`, 90 rows, all
three risk_level classes); the §17.2 d² law; §17.3/§18.7 flame photos with
feature recognition by a vision model. Tests: 79.

Remaining: `/api/sensors/*` (§18.8 — there are no sensors yet, the format is
open), `/api/reference` (§18.5 — the client keeps its own reference tables),
and a frontend part: the "Models" tab doesn't call the endpoints that already
exist, photo upload lives only in the page's memory, the "Acknowledged"
button doesn't call `POST /api/analyses/{id}/ack`, and the `/console` route
isn't protected by a session (§22).
