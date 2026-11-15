# XScience — React client

The frontend for the fire-hazard assessment panel. Rewritten from the design
prototype (`XScience Login.dc.html`, `XScience Console.dc.html`) into React,
following [FUNCTIONAL_SPEC.md](../FUNCTIONAL_SPEC.md). The specification is
the source of truth; where the prototype diverges from it, the fix favors
the specification (see below).

## Stack

React 19 · TypeScript · Vite · React Router 7. No UI libraries: tokens and
classes live in `src/styles`, the palette is spec §21.3.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173 → /login
npm run build      # tsc -b + vite build
npm run typecheck
npm run smoke      # renders every screen in Node, without a browser
npm run e2e        # httpApi against a live backend (needs backend/run.py)
```

The data source is chosen via the `VITE_API` variable:

| Value | Behavior |
| --- | --- |
| `http` (default) | the Flask API at `/api` — see [../backend](../backend/README.md) |
| `local` | calculation in the browser + `localStorage` (prototype, works without a server) |

Demo login (§6.4): username `demo`, password `xscience-demo`, code `123456`.
The panel is also reachable directly at `/console` — as in the prototype,
it is not yet protected by a session (§22).

## Structure

```
src/
  domain/      pure domain logic — no React
    types.ts        types (§3, §4)
    reference.ts    reference tables, labels, colors (§3, §21)
    scoring.ts      R, E, levels, verdict, confidence (§14)
    texts.ts        explanations, conclusion, recommendations, assumptions (§15)
    validation.ts   field statuses, result staleness (§9.3, §9.7)
    report.ts       report document, TXT, history CSV (§11, §16.2)
    ship.ts         ship-status aggregation (§7.4)
    dataset.ts      dataset and cross-check against the formulas (§19)
    rules.ts        scoring tables for the "Rules" tab (§13)
    issues.ts       open questions (§24)
    format.ts       f1, pad, now, pn (§0)
  api/         seam to the data source
    types.ts        the XScienceApi contract
    localApi.ts     [PROTOTYPE] calculation in the browser + localStorage
    httpApi.ts      the Flask API (§18): /api/auth/*, /api/analyses, history polling
    index.ts        implementation selection via VITE_API
  state/       store.tsx (§5.3) and derived form/result hooks
  components/  header, footer, ship diagram, modal window, primitives
  screens/     Login + Console (7 tabs)
  styles/      tokens.css (§21.3), base.css, app.css
scripts/       smoke.tsx — renders every screen; e2e.ts — runs httpApi
```

Rule: `domain/` knows nothing about React, `api/` knows nothing about the
screens, and the screens never compute scores themselves.

## Backend

Implemented: `src/api/httpApi.ts` talks to Flask (`../backend`, port 5000);
the dev-server proxy is configured in `vite.config.ts`. The screens don't
change when switching implementations — all communication goes through the
`src/api` seam.

Contract (§18.3): the client **does not** send scores, levels, verdict, or
texts — the server computes all of it; `POST /api/analyses` returns the full
analysis record, the report, and the `alert_level` that opens the alert
window. The client receives history changes (including a change in report
transmission status) by polling `GET /api/analyses` every 1.5 s.

The `domain/scoring.ts`, `domain/texts.ts`, `domain/ship.ts`, and
`domain/report.ts` modules are a direct port of spec sections 14–15; the
server holds a line-by-line port of them (`backend/app/domain/`). When the
rules are edited, both implementations must change: the client-side one is
still needed for `VITE_API=local` mode.

Report texts and recommendations come from the server: if an AI module is
configured on the backend, a language model writes them; otherwise the
deterministic §15 rules do. The screens don't change; the analysis record
additionally carries `texts_source` (`llm` / `rules`) and `texts_model`.

What's fetched from the server, when one is present:

| Screen | Endpoint |
| --- | --- |
| "Models", Stage 2 | `GET /api/models/ml/readiness`, `POST /api/models/ml/train`, `POST /api/models/ml/predict` |
| "Models", Stage 3 | `POST /api/models/d2` — the chart is computed locally, the server serves as a cross-check |
| "Models", photos | `POST /api/photos`, `PATCH /api/photos/{id}`, `POST /api/photos/{id}/recognize` |
| "Data" | `GET /api/dataset` |
| Alert window, "Acknowledged" | `POST /api/analyses/{id}/ack` |
| Entering `/console` | `GET /api/me` — without a session, redirects to `/login` (§6.5) |

The `models`, `dataset`, `photos`, and `sensors` sections of the contract are
**optional**: `localApi` has none of them (all simulation generation is
server-side, see `backend/README.md`), and the same screens work off local
§19/§17 constants and an in-page-memory snapshot — the prototype keeps
working without a server. The sensor-simulation toggle in the header and the
manual-entry switch on the "Analysis" tab simply don't render while
`api.sensors` is absent.

The prediction on the "Models" tab is only requested once a model is
trained and the analysis form is fully filled in; next to it, the accuracy
on a held-out set is shown, along with a note that the dataset labels were
computed by the §14 rules.

What remains a mock-up (§22): report transmission to Earth (queue → "sent"
after 2.5 s, though the status is now stored in the DB), and time without a
date. In `VITE_API=local` mode, authorization also remains a mock-up
(session in `localStorage`, key `xsci.session.v1`), as does history storage.

## Prototype fixes per the specification

| What | In the prototype | Here |
| --- | --- | --- |
| Alert window (§10.1) | opened only for a "Dangerous" verdict | opens for both "Needs Attention" and "Dangerous" |
| Recommendations (§15.3) | two generators: a separate one for the "Analysis" tab block | one generator; the block shows the first 3 steps of the same list shown in the window and the report |
| Conclusion for low risk (§15.2) | "Threat to the module…" in the AI-module card | "Threat to the sector…" everywhere |
| Recommendation step 1 (§15.4) | condition based only on material `wire_insulation` | material `wire_insulation` **or** sector `ep` |
| Result restoration | a background history refresh brought back a hidden result after "Clear" | `activeId` is restored only on first load |

## Calculation verification

`npm run smoke` checks rendering. The calculation has been manually checked
against the §23 control examples (A–F) and the aggregation example: all six
examples and the aggregation (worst = high, confidence 62, conclusion text)
match; the one discrepancy with the dataset is row 13, as noted in §19.3.
