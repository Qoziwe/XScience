# XScience — Functional Specification

> A complete description of what the interface prototype does: every screen, element, state, validation rule, formula, text, and data format. The document is written from the code of the files `XScience Login.dc.html` and `XScience Console.dc.html`. The backend is written against it.
>
> Notation:
> - **[PROTOTYPE]** — how it works now in the browser.
> - **[BACKEND]** — what the server should do.
> - **[MOCK-UP]** — the behavior is simulated and must be replaced by a real implementation.
> - **[QUESTION]** — not defined by the specification, needs a team decision.

---

## Contents

0. [Conventions](#0-conventions)
1. [Glossary](#1-glossary)
2. [Architecture](#2-architecture)
3. [Reference Tables (Enumerations)](#3-reference-tables-enumerations)
4. [Data Model](#4-data-model)
5. [Global Navigation and Shared State](#5-global-navigation-and-shared-state)
6. [Login Page](#6-login-page)
7. [Overview Tab](#7-overview-tab)
8. [Map Tab](#8-map-tab)
9. [Analysis Tab](#9-analysis-tab)
10. [Alert and Recommendations Window](#10-alert-and-recommendations-window)
11. [Reports Tab](#11-reports-tab)
12. [Data Tab](#12-data-tab)
13. [Rules Tab](#13-rules-tab)
14. [Calculation](#14-calculation)
15. [Text Generation](#15-text-generation)
16. [Analysis History and Storage](#16-analysis-history-and-storage)
17. [Models Tab](#17-models-tab)
18. [Proposed Backend API](#18-proposed-backend-api)
19. [Dataset](#19-dataset)
20. [Display Settings](#20-display-settings)
21. [Status Colors](#21-status-colors)
22. [Prototype Mock-ups and Limitations](#22-prototype-mock-ups-and-limitations)
23. [Reference Test Cases](#23-reference-test-cases)
24. [Open Questions](#24-open-questions)

---

## 0. Conventions

- All numbers in input data use a decimal point (`0.5`, not `0,5`).
- Time in the prototype is stored as an `HH:MM:SS` string in the browser's local time (no date). **[BACKEND]** store ISO 8601 with a timezone (`2026-11-14T09:12:04Z`), format on the client.
- The analysis number is an integer `id`, displayed zero-padded to 4 digits: `#0004`.
- The report number is `RPT-` + the padded analysis number: `RPT-0004`. One analysis → exactly one report.
- Number formatting (`f1`): integer → no decimal part (`21`), fractional → up to 2 digits with no trailing zeros (`0.5`, `2.5`, `0.05`).
- The interface is fully in English. Value codes are in English.

## 1. Glossary

| Term | Meaning |
| --- | --- |
| Sector | A compartment of the ship. Each analysis is performed within one sector |
| Analysis | A single run of the calculation over 7 parameters in the selected sector. An immutable record |
| Partial score | The score for one parameter (e.g. `OxygenRisk`) |
| `RiskScore` (R) | The sum of 6 partial risk scores, 3–16 |
| `ExtinctionScore` (E) | The sum of 3 partial extinction scores, 0–8 |
| Risk level | `low` / `medium` / `high`, derived from R |
| Extinction probability | `low` / `medium` / `high`, derived from E |
| Verdict | The final state: `low` = Safe, `medium` = Needs Attention, `high` = Dangerous |
| Confidence | A number from 45–94%, how reliable the assessment is given the specification's uncertainties |
| Report | A document for Earth, generated automatically for each analysis |
| Current sector (`cur`) | The sector selected by the operator; shared across all tabs |
| Active analysis (`activeId`) | The analysis whose result is shown on the Analysis tab |
| Stale result | The active analysis no longer matches the current form values or sector |

## 2. Architecture

### 2.1 Currently [PROTOTYPE]

Everything runs in the browser: calculation, texts, history (in `localStorage`), reports, authorization (compared against demo data in the code). There is no server.

### 2.2 Target [BACKEND]

```
React client ──HTTPS──► Flask API ──► DB (users, sessions, analyses, reports, photos)
                              │
                              ├──► calculation module (section 14) — the single source of truth
                              ├──► text module (section 15) / AI model
                              ├──► report-transmission-to-Earth queue
                              └──► (later) sensor reading ingestion
```

What moves to the server:

1. Authorization, sessions, lockouts (section 6).
2. Validation of all inputs (section 9.3) — again, independently of the client.
3. Calculation of R, E, levels, verdict, confidence (section 14).
4. Generation of the conclusion, explanations, recommendations, report (section 15).
5. Storage of analysis and report history (section 16).
6. Ship-state aggregation (section 7.4).
7. Report transmission queue (section 11.4).
8. Storage of photos and annotations (section 17.3).

The client only displays server data and validates the form for convenience (the button is disabled, hints are shown).

## 3. Reference Tables (Enumerations)

### 3.1 Materials — `material_type`

| Code | Label | `MaterialRisk` |
| --- | --- | --: |
| `paper` | Paper | 3 |
| `fabric` | Fabric | 2 |
| `plastic` | Plastic | 3 |
| `wood` | Wood | 2 |
| `wire_insulation` | Wire Insulation | 3 |
| `other` | Other | 2 |

Display order is as in the table. For `other`, the `material_description` field is required (a non-empty string after trimming whitespace).

### 3.2 Gravity — `gravity`

| Code | Label | Short label | `GravityRisk` |
| --- | --- | --- | --: |
| `earth` | Earth | Earth | 0 |
| `microgravity` | Microgravity | μg | 1 |

### 3.3 Flow Presets (Simple Mode)

| Code | Label | `air_flow_cm_s` |
| --- | --- | --: |
| `none` | None | 0 |
| `weak` | Weak | 2.5 |
| `medium` | Medium | 10 |
| `strong` | Strong | 20 |

Only the number `air_flow_cm_s` is sent to the server. The mode (`simple`/`precise`) is interface state and is not saved with the analysis.

### 3.4 Sectors — `sector` [QUESTION 16.14: placeholder layout]

| Code | Tag | Name | Description | x | y | w | h |
| --- | --- | --- | --- | --: | --: | --: | --: |
| `sh` | AL | Airlock | Docking node and exit hatch. | 14 | 95 | 80 | 70 |
| `km` | CM | Command Module | Control and communication stations. | 104 | 80 | 120 | 100 |
| `zh` | HM | Habitation Module | Crew quarters, galley, rest area. | 234 | 60 | 150 | 140 |
| `l1` | LB-1 | Laboratory 1 | Scientific equipment and samples. | 394 | 40 | 116 | 85 |
| `l2` | LB-2 | Laboratory 2 | Scientific equipment and samples. | 394 | 135 | 116 | 85 |
| `sk` | ST | Storage | Cargo, supplies, containers. | 520 | 80 | 96 | 100 |
| `ep` | PB | Power Bay | Power distribution, cable runs. | 626 | 95 | 80 | 70 |

`x, y, w, h` — the sector's rectangle on the diagram, with `viewBox="0 0 720 250"`, 16 corner radius. Display order is as in the table. **[BACKEND]** serve the sector list from the DB or configuration (`GET /api/sectors`), including geometry, so the layout can change without touching the client.

### 3.5 Levels

| Code | Risk level | Extinction probability | Verdict | Verdict subtitle |
| --- | --- | --- | --- | --- |
| `low` | Low | Low | Safe | conditions do not support flame development |
| `medium` | Medium | Medium | Needs Attention | development or unstable combustion is possible |
| `high` | High | High | Dangerous | high probability of rapid spread |

Sector status on the map: `none` (no data) plus the three verdict codes. Short labels on the map: `no data` / `normal` / `caution` / `danger`. In the legend: `No data` / `Safe` / `Caution` / `Danger`.

### 3.6 Report Transmission Status

| Code | Label (full) | Label (short) |
| --- | --- | --- |
| `queued` | Queued for transmission | queued |
| `sent` | Sent to Earth · HH:MM:SS | sent |

**[BACKEND]** recommended to add `failed` (transmission error) and `acknowledged` (Earth confirmed receipt). [QUESTION 16.16]

## 4. Data Model

### 4.1 AnalysisInput — analysis input

```json
{
  "sector": "l1",
  "material_type": "paper",
  "material_description": "",
  "thickness_mm": 0.5,
  "oxygen_percent": 21,
  "air_flow_cm_s": 5,
  "gravity": "microgravity",
  "temperature_C": 25,
  "time_s": 30
}
```

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `sector` | string | yes | one of the codes in 3.4 |
| `material_type` | string | yes | one of the codes in 3.1 |
| `material_description` | string | yes, if `material_type = other` | non-empty after `trim`; not used in the calculation [QUESTION 16.6] |
| `thickness_mm` | number | yes | 0.05 ≤ x ≤ 10 |
| `oxygen_percent` | number | yes | 13 ≤ x ≤ 35 |
| `air_flow_cm_s` | number | yes | 0 ≤ x ≤ 30 |
| `gravity` | string | yes | `earth` / `microgravity` |
| `temperature_C` | number | yes | 20 ≤ x ≤ 300 |
| `time_s` | number | yes | 0 ≤ x ≤ 600 |

The steps (0.05 / 0.5 / 0.5 / 5 / 1) are only the slider/arrow steps in the interface. Keyboard input does **not** validate the step: `oxygen_percent = 21.3` is accepted. **[QUESTION]** should off-step values be rounded or rejected.

### 4.2 Analysis — analysis record (a history entry in the prototype)

```json
{
  "id": 4,
  "ts": "09:20:11",
  "sector": "l1",
  "p": { "material": "paper", "desc": "", "thickness": 0.5, "o2": 21, "flow": 5, "gravity": "microgravity", "temp": 25, "time": 30 },
  "risk": 9,
  "ext": 2,
  "level": "high",
  "extLevel": "medium",
  "v": "medium",
  "conf": 62,
  "sent": null
}
```

| Field | Value |
| --- | --- |
| `id` | max(id in history) + 1; starts at 1 in the prototype |
| `ts` | time the calculation completed |
| `sector` | sector code |
| `p` | input parameters (prototype field names; the mapping is in the table below) |
| `risk`, `ext` | `RiskScore`, `ExtinctionScore` |
| `level`, `extLevel` | risk level, extinction probability |
| `v` | verdict |
| `conf` | confidence, an integer 45–94 |
| `sent` | `null` = queued; a time string = sent |

Name mapping (prototype → API):

| Prototype `p.*` | API |
| --- | --- |
| `material` | `material_type` |
| `desc` | `material_description` |
| `thickness` | `thickness_mm` |
| `o2` | `oxygen_percent` |
| `flow` | `air_flow_cm_s` |
| `gravity` | `gravity` |
| `temp` | `temperature_C` |
| `time` | `time_s` |

**[BACKEND]** recommended full record:

```json
{
  "id": 4,
  "created_at": "2026-11-14T09:20:11Z",
  "operator_id": "u_17",
  "sector": "l1",
  "input": { "...": "AnalysisInput without sector" },
  "source": "manual",
  "scores": {
    "material_risk": 3, "oxygen_risk": 2, "flow_risk": 2, "temperature_risk": 0, "time_risk": 1, "gravity_risk": 1,
    "oxygen_deficit": 0, "low_flow_penalty": 0, "thickness_bonus": 2,
    "risk_score": 9, "risk_level": "high",
    "extinction_score": 2, "extinction_probability": "medium"
  },
  "verdict": "medium",
  "danger_index": 9,
  "confidence": 62,
  "confidence_reasons": ["boundary:oxygen_percent", "boundary:air_flow_cm_s", "boundary:time_s", "boundary:thickness_mm"],
  "notes": [ { "ref": "16.1", "text": "..." } ],
  "texts": { "summary": "...", "why": "...", "why_ext": "...", "rec_intro": "...", "rec_steps": [ ... ] },
  "model_version": "rules-v0.1",
  "report_id": "RPT-0004"
}
```

`source`: `manual` (manual entry) — currently the only one; later `sensor`. An analysis is not modified after creation. All texts are stored together with the analysis so the report never changes after the fact when the rules or model change.

### 4.3 Report — report for Earth

```json
{
  "id": "RPT-0004",
  "analysis_id": 4,
  "created_at": "2026-11-14T09:20:11Z",
  "author": "AI status module (generation mock-up)",
  "status": "queued",
  "sent_at": null,
  "channel": "mock",
  "content": { "...": "see section 11.3" }
}
```

### 4.4 User, Session, LoginAttempt [BACKEND]

```json
{ "id": "u_17", "login": "demo", "password_hash": "argon2id$...", "totp_secret": "…", "role": "operator", "is_active": true }
{ "id": "s_…", "user_id": "u_17", "created_at": "…", "last_seen_at": "…", "expires_at": "created_at + 8h", "stage": "password_ok | authenticated" }
{ "login": "demo", "ip": "…", "at": "…", "result": "bad_password | bad_code | ok | locked" }
```

### 4.5 Photo [BACKEND]

```json
{ "id": "ph_…", "analysis_id": null, "file_name": "flame.jpg", "size_bytes": 482133, "mime": "image/jpeg", "uploaded_at": "…",
  "annotation": { "size": "medium", "brightness": "", "shape": "round" } }
```

In the prototype, the photo is not saved and is not linked to the analysis (section 17.3).

## 5. Global Navigation and Shared State

### 5.1 Header (on all panel tabs)

Left to right:

1. **Logo**: a 30×30 square with 9 corner radius and an "X"; next to it "XScience" and the caption "Fire Hazard · Microgravity".
2. **Primary tabs** (segmented switch): `Overview`, `Map`, `Analysis`, `Reports`.
   - "Overview" has an `N dangerous` counter on a red background if any sectors have a "Dangerous" verdict. Otherwise there is no counter.
   - "Reports" has a counter of the number of analyses, if it is > 0.
   - The active tab is highlighted with a light background and shadow.
3. **Reference tabs** (no background): `Data`, `Rules`, `Models`.
4. **On the right**: a "Sensors not connected · manual entry" indicator (gray dot) and a link-button "demo · Sign Out" → the login page.

**[PROTOTYPE]** "Sign Out" is just a link: the session is not ended, the panel opens without logging in.
**[BACKEND]** `POST /api/auth/logout` destroys the session; the panel redirects to login without a valid session; the name on the button is the current user's login.

### 5.2 Footer

"Prototype for training and research purposes. Not a certified fire-safety instrument." and, on the right, "NASA ranges have not been verified (16.13)."

### 5.3 Shared Client State

| Field | Initial | Meaning |
| --- | --- | --- |
| `tab` | `overview` | the open tab |
| `cur` | `null` | current sector, shared across Overview, Map, and Analysis |
| `p` | empty form | form values (strings, section 9.2) |
| `hist` | from storage | all analyses, ascending by `id` |
| `activeId` | the `id` of the last analysis, or `null` | result shown on the "Analysis" tab |
| `repId` | `null` | the selected report; `null` → the latest |
| `modal` | `null` | `{id, view: 'alert' \| 'recs'}` |
| `running` | `false` | a calculation is in progress |

Synchronization rules:

- Selecting a sector anywhere (the mini-map, the map, the sector table, the form buttons, a history row) changes `cur` everywhere.
- "Whole Ship" on Overview sets `cur = null`. In that state, no sector is selected on the "Analysis" tab, and analysis is blocked.
- Opening an analysis from history or a list sets `activeId`, sets `cur` to the analysis's sector, and copies its parameters into the form.

### 5.4 Keyboard

| Keys | Condition | Action |
| --- | --- | --- |
| Ctrl+Enter / Cmd+Enter | on the "Analysis" tab, no modal open | run the analysis (if allowed) |
| Esc | a modal is open | close the window |

## 6. Login Page

File `XScience Login.dc.html`. A card up to 400 px wide, centered.

### 6.1 Step 1 — login and password

Elements:

- Heading "Sign In", subtitle "Access for staff only. Accounts are issued by an administrator."
- "Login" field: `autocomplete=username`, no autocapitalization or spellcheck.
- "Password" field: `autocomplete=current-password`. A "Show" / "Hide" button toggles the field type.
- "Forgot your password?" link **[PROTOTYPE]** does nothing. [QUESTION] procedure: contact the administrator / reset via code.
- A "Caps Lock is on" warning — shown when keys are pressed in the password field if Caps Lock is on.
- "Sign In" button.
- An "Attempts remaining: N" line after the first failure (if not locked out).

Rules:

| Rule | Value |
| --- | --- |
| "Sign In" button disabled | login is empty after `trim`, or password is empty, or a lockout is active |
| Wrong login/password pair | message "Incorrect login or password.", password is cleared, counter +1 |
| Error message | never specifies which one is wrong |
| Attempt limit | 5 |
| After the 5th failure | a 30 s lockout: "Too many attempts. Sign-in is temporarily locked.", fields disabled, button "Retry in N s" with a countdown |
| End of lockout | counter resets to 0, the message disappears |
| Success | moves to step 2, the password is wiped from form memory |

### 6.2 Step 2 — confirmation code

- Caption "step 2 of 2", heading "Confirmation Code", text "Enter the 6-digit code from the authenticator app."
- "Code" field: `inputmode=numeric`, `autocomplete=one-time-code`, everything but digits is discarded, max 6 characters, monospace font with letter-spacing, placeholder `000000`.
- The "Confirm" button is active only with exactly 6 digits.
- Wrong code: "Incorrect code. Attempts remaining: N." (limit 3), the field is cleared.
- 3rd wrong code: returns to step 1, the login is cleared, message "Code entered incorrectly three times. Please sign in again."
- "Back": returns to step 1 (the login is kept, the code and its counter are reset).

### 6.3 Step 3 — success

- "Signed in".
- "Session active until HH:MM or until sign-out. After 15 minutes of inactivity, you will need to sign in again." HH:MM — current time + 8 h.
- "Open Panel" button → `XScience Console.dc.html`.

### 6.4 Hints Below the Card

- "A sign-in error never specifies which is wrong: the login or the password."
- "After 5 incorrect attempts, sign-in is locked for 30 seconds."
- "The password is not saved in the browser and does not appear in the analysis history."
- "Interface prototype. Login, password, and code verification must be performed on the server (Flask) over HTTPS. To test the mock-up: login demo, password xscience-demo, code 123456."

### 6.5 Authorization Backend Requirements [BACKEND]

| Requirement | Value |
| --- | --- |
| Transport | HTTPS only |
| Password storage | argon2id or bcrypt, no reversible encryption |
| Second factor | TOTP (RFC 6238), 6 digits, ±1 step window |
| Password limit | 5 failures → 30 s lockout; counted per login **and** per IP |
| Code limit | 3 failures → the step-1 session is invalidated |
| Responses | identical for "no such login" and "wrong password", identical response time |
| Session | cookie `HttpOnly; Secure; SameSite=Strict`; absolute lifetime 8 h; 15 min idle timeout |
| CSRF | a token on every mutating request |
| Registration | none; accounts are created by an administrator |
| Log | all sign-in attempts (`LoginAttempt`) |
| Demo account | must not exist in a production environment |

## 7. Overview Tab

Opens by default. Shows either the whole ship (`cur = null`) or a single sector (`cur = code`).

### 7.1 Danger Banner

Shown if at least one sector's latest analysis has a "Dangerous" verdict.

- Red background, white text "DANGER".
- Text: one sector → "Sector LB-1 · Laboratory 1. Immediate action required."; several → "Sectors: LB-1, PB. Immediate action required." (labels in the order from 3.4).
- "Open Recommendations" button → the recommendations window (section 10.3) for the **most recent** (highest `id`) of the latest dangerous analyses.

The banner disappears only once a sector gets a new analysis with a verdict other than "Dangerous". There is no "acknowledge" button. [QUESTION] is an "acknowledged" mark needed.

The banner and the counter on the "Overview" tab relate only to "Dangerous". Sectors with a "Needs Attention" verdict open the alert window but are not flagged by the banner (they appear yellow on the map and in the table). [QUESTION 16.18]

### 7.2 Title Row

- "Overview".
- Scope chips: "Whole Ship" (active when `cur = null`). When a sector is selected, a second chip "LB-1 · Laboratory 1 ×" appears. Clicking either chip → `cur = null`.
- Primary button on the right: "New Analysis" (whole ship) or "Analysis in Sector" (a sector is selected) → the "Analysis" tab.

### 7.3 Assessment Card

Header: "Overall Ship Assessment" + "all sectors", or "Sector Assessment" + "LB-1 · Laboratory 1", with "AI module · mock-up" on the right.

**No data.** "No data yet" and the text:
- ship: "Run an analysis in any sector — the result will appear here and color the sector on the map."
- sector: "No analysis has been run in sector LB-1 yet."

**Data present.** Two columns:

Left:
- a colored bar + a large verdict + subtitle;
- the conclusion (section 7.4 / 15.2);
- (sector only) buttons "Open Result" (the "Analysis" tab with this analysis), "Recommendations" (window 10.3), "Report" (the "Reports" tab with this report).

Right:
- "Assessment confidence N%" + a bar + an explanation;
- 4 tiles:
  - ship: "Dangerous" (red number if > 0), "Needs Attention", "Safe", "No Data";
  - sector: "RiskScore" `R / 16`, "ExtinctionScore" `E / 8`, "Risk" (level), "Extinction" (level).

Bottom line:
- ship: "Data from the latest analyses across N of 7 sectors. The assessment is advisory; the decision rests with the crew."
- sector: "Analysis #0004 · 09:20:11. The assessment is advisory; the decision rests with the crew."

### 7.4 Ship-State Aggregation

The **latest** analysis of each sector is used (by history order). Sectors with no analyses are `none`.

```
analysed = sectors with at least one analysis;  nA = |analysed|
if nA == 0:                    → "No data yet"
worst = high,   if any sector has status high
      = medium, else if any has medium
      = low,    otherwise
verdict    = VERD[worst]
subtitle   = nA < 7 ? "across nA of 7 sectors — picture incomplete" : "across all sectors"
confidence = round( mean(conf of latest analyses) × (0.6 + 0.4 × nA / 7) )
confNote   = nA < 7 ? "Reduced: not all sectors have been analyzed." : "All sectors have been analyzed."
```

Conclusion:

| worst | Text |
| --- | --- |
| high | "Danger in sectors: {high labels joined by ", "}. [Needing attention: {medium labels}. ]Priority is to neutralize the danger in the listed sectors." (the bracketed phrase only if medium sectors exist) |
| medium | "No critical sectors. Needing attention: {medium labels}." |
| low | "Conditions are safe in all analyzed sectors." |

For a single sector: the verdict and confidence come from its latest analysis, the subtitle from 3.5, the conclusion from 15.2, the confidence explanation: if `bndCount > 0` → "Reduced: N value(s) on uncertain boundaries (16.1).", otherwise "All readings are within defined ranges.".

[QUESTION] Staleness: an analysis that is an hour old is currently still considered current. A validity period and a "stale" status are needed.

### 7.5 Mini-map

- Heading "Ship Map", link "Open Map" → the "Map" tab.
- SVG `viewBox 0 0 720 250`: a horizontal "spine" (a line from x=94 to x=626 at y=130, 8 thick, rounded ends) and 7 rectangles (3.4) filled by status (section 21). Inside, only the sector tag, size 26.
- The selected sector has a 4 px outline in `accent-900`; the rest have a 1.5 px outline in the status color.
- Clicking a sector → `cur = sector` (the assessment card switches to it).
- Legend: No data / Safe / Caution / Danger.
- Caption "Click a sector — the assessment above will show only that one."

### 7.6 Sector Table

Columns: Sector (tag) · Name · State (dot + verdict, or "No data") · Scores (`R9 · E2` or "—") · Time of last analysis · Report ("sent" / "queued" / "—") · an "Analyze →" button.

- Clicking a row → `cur = sector`.
- "Analyze →" → `cur = sector` and the "Analysis" tab (without the click bubbling up to the row).
- The selected sector's row is highlighted.
- Minimum table width 720 px; horizontal scroll on narrow screens.

## 8. Map Tab

### 8.1 Diagram (left column)

- Heading "Ship Map", caption "Select a sector to see its status and run an analysis."
- The same diagram as the mini-map, but each sector shows 3 lines of text: tag (17, bold), name (11.5), status (11) — `no data` / `normal` / `caution` / `danger`.
- Legend.
- Caption "Placeholder diagram: the ship's layout and compartment assignments are not defined in the specification."

### 8.2 Sector Card (right column)

No sector selected: "No sector selected" + "Click a compartment on the diagram. Analysis cannot be run until a sector is selected."

Sector selected:

1. Tag, name, description (3.4).
2. Status line: dot + the latest analysis's verdict (or "No data") + `R9 · E2` (or "—").
3. If there is an analysis: the conclusion (15.2) and the latest analysis's parameters: Material, Thickness, Oxygen, Air Flow, Temperature, Burn Time, Gravity (with units).
4. If there is no analysis: "No analysis has been run in this sector yet."
5. Buttons "Analysis in This Sector" (the "Analysis" tab) and "Show on Overview" (the "Overview" tab, `cur` is kept).
6. "Latest Analyses": up to 5 analyses for the sector, newest first: verdict dot, `#id`, time, verdict. Clicking → opens the analysis (5.3).

## 9. Analysis Tab

Three columns, which wrap on narrow screens: the form (up to 390 px), the result (main), the side panel (up to 340 px).

### 9.1 Form Header

"Parameters", a counter `N of 8` (how many fields are in `ok` status), a "Clear" button.

"Clear": the form returns to its empty state, `activeId = null` (the result is hidden, the checklist is shown). **The sector is not reset.** History is unchanged. The button is disabled while a calculation is running.

### 9.2 Form Fields

All form values are stored as **strings** (an empty string = not filled in). Field order:

**0. Ship sector.** A 2×N grid of buttons: sector status dot, tag, name. The selected one is highlighted. To the right of the heading, the selected sector's tag, or "not filled in". Below the grid: a "Choose on Map" link (→ the "Map" tab) and the text "The analysis runs within a single sector and feeds into the overall ship assessment."

**1. Material.** A 2×3 grid of buttons: label + "risk N" (`MaterialRisk`). Choosing "Other" reveals a "Material Description" field (placeholder "Composition, density, coating, if any…"). If the description is empty — "Describe the material — the calculation is unavailable without a description", the material field's status is `empty`.

**2. Thickness.** A 0.05–10 slider (step 0.05) + a number field + "mm".

**3. Oxygen.** A 13–35 slider (step 0.5) + a number field + "%". Below the slider: labels "13", "35" and a "21 · air" tag button at 36.4% of the width (21% on the 13–35 scale) — clicking it sets 21.

**4. Air Flow.** A "Simple" / "Precise" toggle (default "Precise").
- Precise: a 0–30 slider (step 0.5) + a field + "cm/s".
- Simple: 4 preset buttons (3.3) labeled with their value. The button whose value equals the current number is considered selected.
- Switching Precise → Simple: if the current number equals one of the presets, it is kept; otherwise the field is **cleared** (the value is not rounded to the nearest preset).
- Switching Simple → Precise: the number is kept.

**5. Gravity.** Two buttons, "Earth" / "Microgravity". Caption "Category only. The g-level itself is not assessed."

**6. Temperature in the combustion zone.** A 20–300 slider (step 5) + a field + "°C".

**7. Burn time.** A 0–600 slider (step 1) + a field + "s".

Common to numeric fields:
- While a field is empty, the slider sits at the minimum with 45% opacity; moving the slider records the value.
- In the top-right corner of each field, a status:
  - `ok` → the contribution to the scores (if the `showContrib` setting is on), otherwise blank: Material `R +3`; Thickness `E +2`; Oxygen `R +2 · E +0`; Flow `R +2 · E +0`; Gravity `R +1`; Temperature `R +0`; Time `R +1`;
  - `empty` → "not filled in";
  - `bad` → "out of range", the field border is darker.
- Contributions are only calculated for fields in `ok` status: other fields' values are not substituted in the meantime.

### 9.3 Validation

Each field's status:

| Field | `empty` | `bad` | `ok` |
| --- | --- | --- | --- |
| Sector | not selected | — | selected |
| Material | not selected, or `other` with an empty description | — | selected (+ a description for `other`) |
| Gravity | not selected | — | selected |
| Numeric | empty string | not a number or outside [min; max] | within [min; max] inclusive |

Messages shown below the field on `bad`:

| Field | Text |
| --- | --- |
| Thickness | Allowed range: 0.05 to 10 mm |
| Oxygen | Allowed range: 13 to 35 % |
| Flow | Allowed range: 0 to 30 cm/s |
| Temperature | Allowed range: 20 to 300 °C |
| Time | Allowed range: 0 to 600 s |

Warnings (non-blocking, shown only when `ok`):

| Condition | Text |
| --- | --- |
| O₂ < 16 | At this oxygen concentration, the flame may not be sustained |
| flow = 0 | Without air flow, the flame can be unstable, especially under microgravity |
| flow > 15 | At very high flow, the flame may be blown out |

**[BACKEND]** on error, respond `422` with a list of fields (section 18.9). Error texts from README §10 ("Enter an oxygen concentration from 13 to 35 percent", etc.) are an acceptable variant for the API.

### 9.4 "Analysis" Button

- Label "Analysis" and hint "Ctrl ↵"; while running — "Calculating…".
- Active only if **all 8** fields are `ok` and no calculation is running.
- Line below the button (priority top to bottom):

| Condition | Text |
| --- | --- |
| calculation in progress | Parameters are locked until the calculation finishes. |
| any field is `bad` | Some values are out of the allowed range. The calculation is unavailable. |
| not all fields filled | Missing: {field names joined by ", ", lowercase}. The assessment cannot be produced without all parameters. |
| a result exists and is stale | The form has changed. Run the analysis to refresh the result. |
| otherwise | All parameters are set. |

Field names: sector, material, thickness, oxygen, air flow, gravity, temperature, burn time.

### 9.5 Calculation Flow

1. Re-check: if any field is not `ok`, nothing happens.
2. Form values are converted to numbers, the sector is fixed.
3. `running = true`: the form is disabled (55% opacity), the result is dimmed (40%).
4. **[PROTOTYPE]** after 650 ms:
   - an analysis record (4.2) is created with `id = max + 1`;
   - it is appended to the end of history, history is trimmed to the last 100 records and saved;
   - `activeId = repId = id`, `running = false`;
   - if the verdict is `medium` or `high` → the alert window "WARNING" / "DANGER" opens (section 10.2);
   - the report is queued for transmission (section 11.4).

**[BACKEND]** `POST /api/analyses` synchronously returns the full analysis and report record; the 650 ms delay is unnecessary.

### 9.6 Result — No Active Analysis

A "No result yet" card, text "An assessment is only produced when a sector is selected and all seven parameters are filled in. Missing values are not substituted or guessed." and an 8-item checklist. Each item has a dot (filled in / not), a name, and a value: "LB-1 · Laboratory 1", "Paper", "0.5 mm", "microgravity", "out of range", or "not filled in".

On page load, the latest analysis from history becomes active, so this card is only visible when history is empty or after "Clear".

### 9.7 Result — Active Analysis Present

Top to bottom:

1. **Header.** "Analysis Result", `#0004 · 09:20:11 · LB-1 · Laboratory 1`. If the result is stale — a banner "Parameters changed — this result is from a previous run." Below it, a parameter line `Paper 0.5 mm · O₂ 21% · 5 cm/s · 25 °C · 30 s · microgravity` and "Assessment per the rules in section 9. Not a fire-spread forecast."
   - **Staleness:** the result is stale if any of the form fields (`material`, `thickness`, `o2`, `flow`, `gravity`, `temp`, `time`), as a string, differs from the analysis's parameters converted to a string, or if `cur` differs from the analysis's sector. The material description is not part of the comparison.

2. **AI Module Assessment for the Sector.** Header: title, "status model · v0.1", "updated 09:20:11".
   - Left column: a colored bar, verdict, subtitle (3.5), conclusion (15.2), "Assessment confidence N%" with a bar and explanation:
     - "Reduced: " + reasons joined by "; " + ".", where reasons are: "N value(s) on uncertain boundaries (16.1)", "material properties not specified", "values outside NASA-verified ranges (16.13)";
     - no reasons → "All readings are within defined ranges."
   - Right column, "Factored Into the Assessment": 7 rows (Material, Thickness, Oxygen, Air Flow, Temperature, Burn Time, Gravity) — the value and contribution cells. The number of cells equals the maximum possible score: 3, and 1 for gravity. For thickness, `ThicknessBonus` is shown; for the rest, the risk score. Caption "The status assessment is advisory. The crew decides on actions."

3. **Report Line.** A dot (sent → blue, queued → yellow), "Report RPT-0004 for Earth", status (3.6). Buttons "Recommendations" (window 10.3) and "Open Report" (the "Reports" tab).

4. **Two Scale Cards.**
   - "Risk Level" / `RiskScore`: a level-colored bar, "Low/Medium/High", `R / 16`. A 14-cell scale for values 3…16: a cell is filled if its value ≤ R; zone colors: 3 — low, 4–6 — medium, ≥7 — high (unfilled cells are a light tint of the zone). Labels "3 · low", "4–6 · medium", "≥ 7 · high".
   - "Extinction Probability" / `ExtinctionScore`: "Low/Medium/High", `E / 8`. A 9-cell scale for 0…8: `E` cells filled. Labels "0–1 · low", "2–3 · medium", "≥ 4 · high".

5. **Banner 16.2** — only if `risk_level = high` **and** `extinction_probability = high`: "High risk combined with a high extinction probability: the flame is unstable, blowout and reignition are both possible. Scores are calculated independently."

6. **Why This Level / Recommended Actions.** On the left, two explanatory paragraphs (15.1). On the right, the first 3 steps of the unified recommendations generator (15.3–15.4) tagged "draft · 16.9"; the full list is behind the "Recommendations" button (window 10.3).

7. **Breakdown.**
   - "What Made Up the Risk" + `Σ R`: 6 rows (name, code, input value, cells, score).
   - "What Made Up the Extinction Score" + `Σ E`: 3 rows (O₂ Deficit / `OxygenDeficit` — 3 cells; Weak Flow / `LowFlowPenalty` — 2; Thickness / `ThicknessBonus` — 3) and a note: "Thickness affects only extinction, not risk — this contradicts the parameter's description (16.3)."

### 9.8 Side Panel (only with an active analysis, except in history)

1. **Material card** ("draft · 16.11"): name, `MaterialRisk N / 3`, description, "Found Onboard", "Main Threat" (texts — 15.6). For "Other", instead of "Found Onboard" — "Description" with the operator's text or "—".
2. **Calculation Assumptions** + a count: a list of notes (15.5).
3. **Run History** (always visible): a count, a "CSV" button. Empty — "No runs yet." Rows (newest first): a dot colored by **risk level** (not the verdict), `#0004 09:20:11`, `R9 · E2`, a line `LB-1 · Paper 0.5 mm · O₂ 21 · 5 cm/s · μg`. The current active analysis is highlighted. Clicking (except during a calculation) → opens the analysis (5.3). Caption "Stored in this browser. The storage location is undefined (16.12)."

## 10. Alert and Recommendations Window

### 10.1 Trigger Condition

The alert window opens automatically **immediately after an analysis completes** if that analysis's verdict is `medium` or `high`. At `low`, the window does not open.

| Verdict | Index D (14.4) | Window | Header | Title | Subtitle |
| --- | --: | --- | --- | --- | --- |
| `high` — Dangerous | ≥ 10 | yes | red | DANGER | Dangerous values detected. Immediate action required. |
| `medium` — Needs Attention | 6–9 | yes | yellow | WARNING | Elevated values detected. Monitoring and addressing the leading factor are required. |
| `low` — Safe | ≤ 5 | no | — | — | — |

The threshold is chosen by verdict (section 14.4), not by `risk_level`: because of the scale's skew (16.4), `risk_level = high` is reached almost always (the baseline case is R = 9).

> ⚠️ A "Needs Attention" verdict is common (reference case A). The window will open after most analyses, and the operator may stop responding to it. For "WARNING" the window is deliberately visually calmer than for "DANGER" (yellow header, smaller title). [QUESTION 16.18]

The window only opens for a **new** analysis. Recommendations can be reopened from window 10.3 (buttons on Overview, on the "Analysis" tab, and on the danger banner).

### 10.2 "Alert" View

A modal window over a dimmed background (60%), up to 680 px wide.

| Element | `high` | `medium` |
| --- | --- | --- |
| Header background | `oklch(0.5 0.17 28)` | `oklch(0.78 0.12 88)` |
| Header text color | white | `oklch(0.30 0.07 75)` |
| Line above the title | `SECTOR LB-1 · LABORATORY 1` (monospace, letter-spaced) | same |
| Title | "DANGER", 68 px | "WARNING", 48 px |
| Subtitle | "Dangerous values detected. Immediate action required." | "Elevated values detected. Monitoring and addressing the leading factor are required." |
| Primary button | "Open Recommendations", background `oklch(0.5 0.17 28)`, white text | "Open Recommendations", background `oklch(0.42 0.09 75)`, white text |

The rest is the same for both variants — the window body:

- the explanation (15.1, both paragraphs in sequence);
- three tiles: `R / 16` RiskScore, `E / 8` ExtinctionScore, `N%` confidence;
- "Report RPT-0004: Queued for transmission" / "…: Sent to Earth · 09:20:14";
- buttons: primary "Open Recommendations" → the "Recommendations" view (10.3); "Close" → closes the window.

Esc closes it. Clicking the backdrop does not close the window.

### 10.3 "Recommendations" View

Opened from the alert, from the danger banner on Overview, the "Recommendations" button on Overview (sector), and on the "Analysis" tab. Works for any verdict. The content is the output of the **single** recommendations generator (15.3–15.4), stored together with the analysis.

- Header colored by verdict: `high` — red with "DANGER"; `medium` — yellow with "WARNING"; `low` — dark blue (`accent-800`) with "Safe". Next to it, `SECTOR LB-1 · LABORATORY 1`.
- "Mitigation Recommendations", intro text (15.4).
- Numbered steps `01`, `02`… (a title + explanation, 15.4).
- "Report RPT-0004: {status}".
- Buttons "Acknowledged" (closes the window), "Open Report" (closes the window, the "Reports" tab, this report selected).
- Height up to 92% of the screen, with internal scrolling.

**[PROTOTYPE]** "Acknowledged" records nothing. **[BACKEND]** it is recommended to store the fact and time of the operator's acknowledgment (`POST /api/analyses/{id}/ack`) and include it in the report. [QUESTION]

## 11. Reports Tab

### 11.1 List (left column)

"Reports for Earth" + a count. Empty — "A report is generated automatically for each analysis." Rows (newest first): verdict dot, `RPT-0004 09:20:11`, verdict, `LB-1 · Laboratory 1 · sent/queued`. The selected report is highlighted. The default selection is the latest one.

### 11.2 Document (right column)

- `Report RPT-0004`, title `LB-1 · Laboratory 1`, verdict chip, "Download TXT" button.
- Metadata (key–value pairs):

| Key | Value |
| --- | --- |
| Sector | LB-1 · Laboratory 1 |
| Generated | 09:20:11 |
| Author | AI status module (generation mock-up) |
| Transmission | Queued for transmission / Sent to Earth · HH:MM:SS |
| Comm channel | mock-up, no actual transmission |
| Analysis | #0004 |

- Sections:

| Section | Content |
| --- | --- |
| Conclusion | `{verdict}. {conclusion, 15.2}` |
| Input Parameters | `Paper, 0.5 mm; O₂ 21%; flow 5 cm/s; 25 °C; 30 s; microgravity.` |
| Scores | `RiskScore 9 of 16 (high); ExtinctionScore 2 of 8 (medium). Assessment confidence 62%.` |
| Limitations | The assessment is built on the rules in section 9; no trained ML model is connected. NASA ranges are not validated. Gravity is accounted for as a category. Recommendations are advisory in nature. |

- "Recommendations": intro text + steps (15.4).
- Empty: "No reports yet. Run an analysis in one of the sectors."

### 11.3 TXT Format

File `RPT-0004.txt`, UTF-8, lines separated by `\n`:

```
REPORT RPT-0004
Sector: LB-1 · Laboratory 1
Conclusion: Needs Attention

Sector: LB-1 · Laboratory 1
Generated: 09:20:11
Author: AI status module (generation mock-up)
Transmission: Sent to Earth · 09:20:14
Comm channel: mock-up, no actual transmission
Analysis: #0004

CONCLUSION
{text}

INPUT PARAMETERS
{text}

SCORES
{text}

LIMITATIONS
{text}

RECOMMENDATIONS
{intro text}
01. {title} — {explanation}
02. …
```

**[BACKEND]** `GET /api/reports/{id}.txt`. A machine-readable JSON format for transmission to Earth is also recommended. [QUESTION 16.16]

### 11.4 Transmission [MOCK-UP]

- When an analysis is created: `sent = null` (queued).
- After 2.5 s the status changes to "Sent" with a timestamp; the change is saved to history.
- On page load, the timer restarts for all records with `sent = null`.

**[BACKEND]** a real queue: `queued` → `sent` (after successful transmission) / `failed` (with retries); `acknowledged` once Earth confirms. The client receives status updates via polling (`GET /api/reports?since=`) or over WebSocket/SSE.

## 12. Data Tab

- "Dataset", caption "simulated_rule_based · values from a file, the calculation is for cross-checking only".
- 5 tiles: "30 — rows · target 50–100", "0 — rows with gravity = earth", "1 — risk_level class (high only)", "{N} — discrepancies with the formulas" (red if N > 0; currently N = 1), "30 — invalid data_source" (red).
- Filter chips: All, Paper, Fabric, Plastic, Wood, Wire Insulation. A "Discrepancies with the calculation only" toggle. On the right, "showing N of 30".
- Table (minimum width 1040 px, horizontal scroll): #, Material, mm, O₂ %, cm/s, °C, s, Flame (cm), Rate (cm/s), Risk (dot + level from the file), Extinction (from the file), Result, Cross-check, a "To Form →" button.
- **Cross-check:** the row is recalculated using the formulas in section 14 (`gravity = microgravity`). A match requires **both** `risk_level` **and** `extinction_probability` to agree: "matches". Otherwise — "by formula: extinction medium (E=3)", the row is tinted red. Currently only row 13 disagrees.
- "To Form →" copies the row's parameters into the form and opens the "Analysis" tab. The sector is **not** changed; the analysis is not run.

## 13. Rules Tab

- "Scoring Rules", caption "a range is highlighted when the corresponding form field is filled in".
- Two formulas: `Material + Oxygen + Flow + Temperature + Time + Gravity = {R}` and `OxygenDeficit + LowFlowPenalty + ThicknessBonus = {E}`. The values are shown only when the form is fully complete (all 8 fields `ok`); otherwise "—".
- 9 table cards (name, code, the field's current value or "—", ranges with scores). A range is highlighted if the corresponding field's value, while `ok`, falls within it:

| Card | Ranges → score |
| --- | --- |
| Material / MaterialRisk | paper, plastic, wire insulation → 3; fabric, wood, other → 2 |
| Oxygen / OxygenRisk | < 16% → 0; 16–18% → 1; 18–21% (gap 18–19) → 2; > 21% → 3 |
| Flow / FlowRisk | = 0 → 1; 0–5 → 2; 5–15 → 3; 15–30 → 2 |
| Temperature / TemperatureRisk | 20–50 → 0; 50–100 → 1; 100–200 → 2; > 200 → 3 |
| Time / TimeRisk | 0–10 → 0; 10–30 → 1; 30–60 → 2; > 60 → 3 |
| Gravity / GravityRisk | microgravity → 1; Earth → 0 |
| O₂ Deficit / OxygenDeficit | < 16 → 3; 16–18 → 2; 18–19 → 1; ≥ 19 → 0 |
| Weak Flow / LowFlowPenalty | < 1 → 2; 1–3 → 1; ≥ 3 → 0 |
| Thickness / ThicknessBonus | < 0.2 → 3; 0.2–0.5 → 2; 0.5–2 → 1; > 2 → 0 |

- "Open Specification Questions": 16.1–16.13, each marked "open" / "resolved" (16.7 and 16.8 are resolved), summary "11 open · 2 resolved".

## 14. Calculation

**This is the single source of truth for the backend.** The boundary convention comes from the pseudocode in README 9.3 (matches 29 of the 30 dataset rows). [QUESTION 16.1]

### 14.1 Partial Risk Scores

```python
MATERIAL_RISK = {"paper": 3, "plastic": 3, "wire_insulation": 3, "fabric": 2, "wood": 2, "other": 2}

def oxygen_risk(o2):        # %
    if o2 < 16:  return 0
    if o2 <= 18: return 1
    if o2 <= 21: return 2   # 18 < o2 < 19 is a gap in the specification; 2 was adopted
    return 3

def flow_risk(v):           # cm/s
    if v == 0:   return 1
    if v <= 5:   return 2
    if v <= 15:  return 3
    return 2

def temperature_risk(t):    # °C
    if t <= 50:  return 0
    if t <= 100: return 1
    if t <= 200: return 2
    return 3

def time_risk(s):           # s
    if s <= 10:  return 0
    if s <= 30:  return 1
    if s <= 60:  return 2
    return 3

def gravity_risk(g):
    return 1 if g == "microgravity" else 0
```

### 14.2 Partial Extinction Scores

```python
def oxygen_deficit(o2):
    if o2 < 16: return 3
    if o2 < 18: return 2
    if o2 < 19: return 1
    return 0

def low_flow_penalty(v):
    if v < 1: return 2
    if v < 3: return 1
    return 0

def thickness_bonus(mm):
    if mm < 0.2:  return 3
    if mm <= 0.5: return 2
    if mm <= 2:   return 1
    return 0
```

### 14.3 Sums and Levels

```python
risk = MATERIAL_RISK[m] + oxygen_risk(o2) + flow_risk(v) + temperature_risk(t) + time_risk(s) + gravity_risk(g)   # 3..16
ext  = oxygen_deficit(o2) + low_flow_penalty(v) + thickness_bonus(mm)                                            # 0..8

def risk_level(r):       return "low" if r <= 3 else "medium" if r <= 6 else "high"
def extinction_level(e): return "high" if e >= 4 else "medium" if e >= 2 else "low"
```

### 14.4 Status Verdict

```python
def stability_adjust(ext):
    if ext <= 1: return +2   # the flame is stable, extinction is unlikely — more dangerous
    if ext >= 4: return -1   # likely to self-extinguish
    return 0

def verdict(risk, ext):
    d = risk + stability_adjust(ext)      # danger_index, 2..18
    if d >= 10: return "high"             # Dangerous
    if d >= 6:  return "medium"           # Needs Attention
    return "low"                          # Safe
```

### 14.5 Uncertain Boundaries and Confidence

A value is considered to lie on an uncertain boundary (16.1) if:

| Parameter | Condition |
| --- | --- |
| `oxygen_percent` | ∈ {16, 18, 19, 21} **or** 18 < x < 19 |
| `air_flow_cm_s` | ∈ {1, 5, 15} |
| `temperature_C` | ∈ {50, 100, 200} |
| `time_s` | ∈ {10, 30, 60} |
| `thickness_mm` | ∈ {0.5, 2} |

```python
def boundary_count(p): ...   # 0..5, one per parameter

def confidence(p):
    c = 94
    c -= 8 * boundary_count(p)
    if p.material_type == "other": c -= 14
    if p.oxygen_percent > 30 or p.air_flow_cm_s > 15: c -= 10
    return max(45, min(94, c))
```

Confidence is an interface heuristic, not a statistical probability. Comparing values to boundaries uses exact numeric equality. **[BACKEND]** use `Decimal` or a tolerance-based comparison so a `0.5` from JSON reliably matches the boundary.

### 14.6 Ship Aggregation

See section 7.4.

## 15. Text Generation

Currently all texts are produced by rules. **[BACKEND]** when moving to an AI model, the input is the input parameters, the partial scores, the levels, the verdict, and the sector; the output must contain the same fields. Texts are stored together with the analysis. [QUESTION 16.9, 16.15]

### 15.1 Explanation (`why`, `whyExt`)

`why` is assembled from factors (in this order):

| Condition | Phrase |
| --- | --- |
| MaterialRisk = 3 | "{material, lowercase} is a highly flammable material" |
| OxygenRisk = 3 | "oxygen above normal ({O₂}%)" |
| FlowRisk = 3 | "flow of {v} cm/s actively feeds the flame" |
| TemperatureRisk ≥ 2 | "high temperature in the combustion zone ({t} °C)" |
| TimeRisk ≥ 2 | "prolonged burning ({s} s)" |
| GravityRisk = 1 | "microgravity increases the uncertainty of flame behavior" |

- Factors present: "Risk is increased by: " + phrases joined by "; " + "."
- None: "All factors are at minimum values — conditions do not support flame development."

`whyExt`: extinction factors — OxygenDeficit ≥ 2 → "oxygen deficiency ({O₂}%)"; LowFlowPenalty ≥ 1 → "no air flow" (if flow = 0) or "weak air flow"; ThicknessBonus ≥ 2 → "thin material ({mm} mm)".
Text: "Extinction: {low/medium/high} probability — {factors joined by ", "}." or "… probability, no extinction factors."

### 15.2 Conclusion (`summary`)

| Condition | Text |
| --- | --- |
| risk high and ext high | Combustion is unstable: conditions simultaneously support rapid spread and flame extinguishment. Monitoring is required — reignition is possible after extinguishment. |
| risk high | The combination of material, oxygen, and flow creates conditions for rapid flame spread. Extinction is unlikely — intervention is required. |
| risk medium | Individual parameters increase the hazard, but conditions for sustained rapid combustion have not developed. Monitoring and addressing the leading factor is sufficient. |
| risk low | All factors are at minimum values. There is no threat to the sector at current readings. |

> Prototype inaccuracy: in the "AI Module Assessment for the Sector" card on the "Analysis" tab, the last variant says "for the module", while everywhere else it says "for the sector". Use "for the sector".

### 15.3 Unified Recommendations Generator

Recommendations are produced by **one** generator (rules in 15.4). Its output — the intro text `rec_intro` and the ordered list of steps `rec_steps` — is created once per analysis, stored together with it, and shown identically everywhere:

| Where | What is shown |
| --- | --- |
| Recommendations window (10.3) | the intro text and all steps |
| Report for Earth (11.2, 11.3) | the intro text and all steps |
| "Analysis" tab, "Recommended Actions" block (9.7) | the first 3 steps (title + explanation), the first step highlighted; the full list is behind the "Recommendations" button |
| Overview (sector card) and the map | only through the "Recommendations" button → window 10.3 |

There is no separate "short" generator. The rules must not diverge between locations: the text in the block on the "Analysis" tab, in the window, and in the report is one and the same.

> The current prototype still has a second, legacy generator (3 items in the "Recommended Actions" block on the "Analysis" tab, not sector-aware). It should be removed: the target behavior is the table above.

### 15.4 Rules of the Unified Generator (recommendations window, report, block on the "Analysis" tab)

Input: parameters, scores, sector, verdict `v`. Steps, in order:

| # | Condition | Title | Explanation |
| - | --- | --- | --- |
| 1 | material = `wire_insulation` **or** sector = `ep` | De-energize the line and the heat source | Wiring combustion is sustained by current: as long as the line is live, extinguishing is largely ineffective. |
| 1′ | otherwise, if TemperatureRisk ≥ 2 | Shut off the heat source | Temperature of {t} °C in the combustion zone accelerates material heating. |
| 2 | OxygenRisk = 3 **or** FlowRisk = 3 | Reduce the oxygen supply | Stop sector ventilation and O₂ supply, shut off air ducts. |
| 3 | `v ≠ low` | sector action (table below) | |
| 4 | risk_level = high | Isolate the fire | Separate flammable materials from the fire, prevent flame spread to adjacent sectors. |
| 5 | `v ≠ low` | Apply the appropriate extinguishing method | "For electrical equipment — non-aqueous agent only." (wire insulation or `ep`) / "Choose an agent based on the material type." |
| 6 | ext high **and** `v ≠ low` | Keep monitoring after the flame goes out | The flame is unstable: reignition is possible. |
| 7 | `v = low` | Continue monitoring | Sector conditions do not support flame development, no action required. |
| 8 | always | Confirm report receipt on Earth | The report is transmitted automatically; report the measures taken. |

Sector actions:

| Sector | Title | Explanation |
| --- | --- | --- |
| `sh` | Close the airlock hatches | Prevent fire and smoke from spreading to adjacent compartments. |
| `km` | Transfer control to the backup station | Preserve ship communication and control until the fire is contained. |
| `zh` | Evacuate the crew from the sector | Gather crew in a safe module and account for everyone. |
| `l1`, `l2` | Stop the experiment and shut off gas supply | De-energize sector equipment and shut off gas lines. |
| `sk` | Isolate racks and containers | Do not move flammable cargo until the fire is extinguished. |
| `ep` | Switch power to backup lines | Disconnect the damaged bus to preserve power to other sectors. |

Step numbering is `01`, `02`… by the steps actually included.

Intro text: "Sector {tag}: {verdict, lowercase}. RiskScore {R} of 16, ExtinctionScore {E} of 8. Recommendations prepared by the AI module (generation mock-up) and require alignment with onboard protocols."

> ⚠️ The action texts are not aligned with the crew's real protocols (16.15). They must be reviewed before any real-world use.

### 15.5 "Calculation Assumptions" Notes

In order, only when the condition holds:

| Ref | Condition | Text |
| --- | --- | --- |
| 16.1 | O₂ on a boundary (14.5) | O₂ = {x}% is on an uncertain boundary: OxygenRisk = {a}, OxygenDeficit = {b}. |
| 16.1 | flow ∈ {1, 5, 15} | Flow {x} cm/s is on a range boundary: FlowRisk = {a}, LowFlowPenalty = {b}. |
| 16.1 | temperature ∈ {50, 100, 200} | Temperature {x} °C is on a boundary: TemperatureRisk = {a}. |
| 16.1 | time ∈ {10, 30, 60} | Time {x} s is on a boundary: TimeRisk = {a}. |
| 16.1 | thickness ∈ {0.5, 2} | Thickness {x} mm is on a boundary: ThicknessBonus = {a}. |
| 16.6 | material = other | "Other": base risk 2, the description is not factored into the calculation. |
| 16.4 | always | The "low" level is only reachable at RiskScore = 3 — the scale is skewed toward "high". |
| — | always | Gravity is accounted for as a category. No forecast is built from g-level and flame size. |

### 15.6 Material Cards [QUESTION 16.11: drafts]

| Material | Description | Found Onboard | Main Threat |
| --- | --- | --- | --- |
| Paper | A thin cellulose material. Heats up quickly and ignites easily; the flame spreads across the surface of the sheet, especially with a thin layer. | documentation, packaging, filters | rapid spread |
| Fabric | Dense fabric heats up more slowly than paper but can smolder and sustain combustion for a long time; the fibers retain heat. | clothing, upholstery, straps | smoldering, hidden combustion |
| Plastic | Melts when heated; in microgravity the melt collects into burning droplets that can detach and carry fire. The smoke is toxic. | housings, containers, films | melt droplets, toxic smoke |
| Wood | A thick material: requires more heat to warm up and sustain combustion. Chars and can smolder for a long time. | rare; samples, tools | prolonged smoldering |
| Wire Insulation | Heats from the inside via current — the heat source stays on. Combustion within wire bundles can be hidden; combustion products are toxic. | cable runs, panels | hidden heating under current |
| Other | Properties are not specified. A base risk of 2 is used; what to do when additional properties are present is undefined (16.6). | (Description: operator's text) | unknown |

## 16. Analysis History and Storage

### 16.1 [PROTOTYPE]

| Parameter | Value |
| --- | --- |
| Location | `localStorage`, key `xsci.hist.v3` |
| Format | a JSON array of records from 4.2, ascending by `id` |
| Limit | the last 100 records |
| Reading | records without a valid `sector` / `p` / `p.material` are discarded |
| Old formats | keys `xsci.hist.v1`, `xsci.hist.v2` are not read |
| Deletion | none |

### 16.2 CSV Export

The "CSV" button in history, file `xscience_history.csv`:

```
id,time,sector,material_type,thickness_mm,gravity,oxygen_percent,air_flow_cm_s,temperature_C,time_s,risk_score,risk_level,extinction_score,extinction_probability
```

No escaping (values contain no commas). The material description and verdict are not exported. **[BACKEND]** `GET /api/analyses.csv`; add `verdict`, `confidence`, `material_description` (escaped), `created_at` in ISO.

### 16.3 [BACKEND]

- Tables `analyses`, `reports`, `photos`, `users`, `sessions`, `login_attempts`.
- No 100-record limit; pagination for the client.
- Analyses and reports are not deleted or edited (a safety log).
- Each analysis stores an `operator_id`.

## 17. Models Tab

### 17.1 Stage 2 — Risk and Extinction ML Model

- Status "not trained". Text explaining that no prediction is produced and the rule-based calculation is not replaced.
- 4 data-readiness checks:

| Check | Value | Explanation | Passed |
| --- | --- | --- | --- |
| Rows in the dataset | 30 / 50 | the training minimum from section 13 has not been reached | no |
| `risk_level` classes | 1 / 3 | every row is high; a classifier cannot be trained (16.4) | no |
| Valid `data_source` | 0 / 30 | the value `simulated_rule_based` is absent from schema 12.1 | no |
| Rows with gravity = earth | 0 / 30 | the feature does not vary, its contribution cannot be assessed | — (informational) |

- The "Train Model" button is always disabled. Reason: "Training unavailable: the dataset fails three of the four checks."
- Two prediction fields show "—": "Risk Level Prediction", "Extinction Probability Prediction" — "only produced by a trained model".

**[PROTOTYPE]** the number of classes is computed from the data; the other values are hardcoded constants. **[BACKEND]** `GET /api/models/ml/readiness` computes all checks against the current dataset; `POST /api/models/ml/train` is only available once all required checks pass.

### 17.2 Stage 3 — d² Law

- Status "reduced form". Text: only the law d²(t) = d₀² − K·t is implemented; the full model is not part of the prototype; the source of K is undefined.
- Fields:
  - "Initial Diameter d₀", mm, 0.1–5, step 0.05;
  - "Burning Constant K", mm²/s, 0.01–5, step 0.01, caption "the value is set by the operator and is not substituted by default".
- "Complete Burnout": `t_b = d₀² / K`, 1 decimal place, "s"; "—" without both valid values.
- Chart (only with valid d₀ and K): X axis 0…t_b s, Y axis 0…d₀² mm².
  - A straight line d²(t) from (0, d₀²) to (t_b, 0).
  - A dashed line d(t) = √(d₀² − K·t), normalized to d₀ (41 points, evenly spaced in time).
  - Axis labels: `d₀²` (2 digits) and `t_b s`.
- Otherwise: "Set d₀ and K — the chart is only built from entered values."
- "Not implemented in the prototype": mass transfer, species transport, the energy equation, reaction, radiation q_rad, the moment of extinction.
- Values are not saved and are not linked to an analysis.

**[BACKEND]** `POST /api/models/d2 {d0_mm, k_mm2_s}` → `{t_burn_s, points:[{t, d2, d}]}`; the source of K is a fuel reference table [QUESTION].

### 17.3 Flame Photo

- Status "recognition not connected". Text: the photo is attached as an observation artifact, the operator fills in the attributes, there is no automatic recognition.
- "Upload Flame Photo" area / "JPEG or PNG, one photo" (`accept="image/*"`).
- After upload: a thumbnail, file name, size in KB, a "Remove" button. A new photo replaces the previous one and resets the annotation.
- Annotation (single choice, clicking again deselects it; unavailable without a photo):
  - Size: small / medium / large;
  - Brightness: dim / moderate / bright;
  - Shape: elongated / round.
- Caption: with a photo — "Operator observations. Not part of the risk or extinction calculation."; without a photo — "Filled in after a photo is uploaded."

**[PROTOTYPE]** the photo exists only in the page's memory (an object URL), is not saved, and is not linked to an analysis. **[BACKEND]** `POST /api/photos` (multipart), `PATCH /api/photos/{id}` (annotation), linking to an analysis [QUESTION]; validate MIME type and size; store outside the web root.

## 18. Proposed Backend API

All responses are JSON, except for exports. All endpoints except `/api/auth/*` require a session at the `authenticated` stage. Errors use the format in 18.9.

### 18.1 Authorization

| Method and path | Body | Response |
| --- | --- | --- |
| `POST /api/auth/login` | `{login, password}` | `200 {stage:"code_required"}` · `401 {error:"invalid_credentials", attempts_left}` · `429 {error:"locked", retry_after_s}` |
| `POST /api/auth/code` | `{code}` | `200 {user:{login, role}, expires_at}` · `401 {error:"invalid_code", attempts_left}` · `401 {error:"restart_login"}` |
| `POST /api/auth/logout` | — | `204` |
| `GET /api/me` | — | `200 {login, role, expires_at}` · `401` |

### 18.2 Sectors and Ship State

`GET /api/sectors` →

```json
[{ "id":"l1", "code":"LB-1", "name":"Laboratory 1", "desc":"…", "geometry":{"x":394,"y":40,"w":116,"h":85} }]
```

`GET /api/ship/status` →

```json
{
  "verdict": "high",
  "confidence": 71,
  "analysed": 3, "total": 7,
  "summary": "Danger in sectors: LB-1. …",
  "counts": { "high":1, "medium":1, "low":1, "none":4 },
  "sectors": [
    { "id":"l1", "status":"high", "last_analysis_id":7, "last_at":"…", "risk":14, "ext":1, "report_status":"sent" },
    { "id":"sh", "status":"none" }
  ],
  "dangers": [{ "sector":"l1", "analysis_id":7 }]
}
```

### 18.3 Analyses

| Method and path | Purpose |
| --- | --- |
| `POST /api/analyses` | body — AnalysisInput (4.1). `201` → the full record from 4.2 (with texts) + `report` + `alert_level`: `null` (verdict `low`), `"medium"` or `"high"` (= the verdict; the client uses it to open the alert window) |
| `GET /api/analyses?sector=l1&limit=50&before_id=` | a list, newest first |
| `GET /api/analyses/{id}` | a single record |
| `POST /api/analyses/{id}/ack` | the operator's "Acknowledged" confirmation (recommended) |
| `GET /api/analyses.csv` | export |

Contract: the client **does not** send scores, levels, the verdict, or texts — the server computes all of it. The server re-validates per 4.1. Resubmission (a double click) is protected via the `Idempotency-Key` header.

### 18.4 Reports

| Method and path | Purpose |
| --- | --- |
| `GET /api/reports?limit=&since=` | a list: `{id, analysis_id, sector, created_at, verdict, status, sent_at}` |
| `GET /api/reports/{id}` | the document (metadata, sections, recommendations — 11.2) |
| `GET /api/reports/{id}.txt` | TXT (11.3) |
| `POST /api/reports/{id}/resend` | resend on `failed` |

### 18.5 Reference Data

| Method and path | Purpose |
| --- | --- |
| `GET /api/reference` | materials, gravity, flow presets, field ranges and steps, score tables (13) |
| `GET /api/dataset` | dataset rows with cross-check results |
| `GET /api/issues` | open specification questions |

### 18.6 Models

`GET /api/models/ml/readiness`, `POST /api/models/ml/train`, `POST /api/models/ml/predict` (only with a trained model), `POST /api/models/d2`.

### 18.7 Photos

`POST /api/photos` (multipart: `file`, optional `analysis_id`) → `{id, file_name, size_bytes}`; `PATCH /api/photos/{id}` `{size, brightness, shape}`; `DELETE /api/photos/{id}`.

### 18.8 Sensors (future) [QUESTION 16.17]

`POST /api/sensors/readings` `{sector, sensor_id, ts, values:{oxygen_percent, air_flow_cm_s, temperature_C, …}}`. Sensors most likely do not provide material, thickness, or burn time — those would still be entered by the operator or taken from the sector's material registry. A sensor-based analysis is created with `source: "sensor"` only when all 7 values are present.

### 18.9 Error Format

```json
{ "error": "validation_failed",
  "fields": {
    "oxygen_percent": "Enter an oxygen concentration from 13 to 35 percent",
    "sector": "Select a ship sector",
    "material_description": "Describe the material, or choose one of the suggested options"
  } }
```

| Code | When |
| --- | --- |
| 400 | malformed JSON |
| 401 | no session / invalid login credentials |
| 403 | insufficient permissions |
| 404 | object not found |
| 409 | a retry with the same `Idempotency-Key` but a different body |
| 422 | validation error |
| 429 | lockout / rate limit exceeded |

## 19. Dataset

### 19.1 Schema

| Column | Type | Unit | Values | Note |
| --- | --- | --- | --- | --- |
| `material_type` | string | — | codes from 3.1 | input |
| `thickness_mm` | float | mm | 0.05–10 | input |
| `gravity` | string | — | `earth`, `microgravity` | input |
| `oxygen_percent` | float | % | 13–35 | input |
| `air_flow_cm_s` | float | cm/s | 0–30 | input |
| `temperature_C` | float | °C | 20–300 | input |
| `time_s` | int | s | 0–600 | input |
| `flame_size_cm` | float | cm | — | output; rule undefined |
| `flame_spread_rate_cm_s` | float | cm/s | — | output; rule undefined |
| `risk_level` | string | — | `low`/`medium`/`high` | output / ML target |
| `extinction_probability` | string | — | `low`/`medium`/`high` | output / ML target |
| `expected_result` | string | — | `possible_extinction`/`unstable`/`fast_flame_spread` | output; rule undefined |
| `data_source` | string | — | `NASA_article`/`estimated`/`simulated` | required |

### 19.2 Rows (all `gravity = microgravity`, `data_source = simulated_rule_based`)

| # | material | mm | O₂ | flow | °C | s | flame | rate | risk | extinction | result |
| -: | --- | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |
| 1 | paper | 0.1 | 20 | 2 | 150 | 10 | 3.78 | 0.14 | high | high | possible_extinction |
| 2 | paper | 0.2 | 16 | 20 | 40 | 90 | 3.42 | 0.34 | high | high | possible_extinction |
| 3 | fabric | 0.5 | 26 | 0 | 200 | 45 | 5.68 | 0.21 | high | high | possible_extinction |
| 4 | plastic | 0.8 | 15 | 1 | 150 | 120 | 2.35 | 0.06 | high | high | possible_extinction |
| 5 | wood | 2 | 16 | 3 | 40 | 240 | 1.72 | 0.06 | high | medium | unstable |
| 6 | wire_insulation | 0.4 | 21 | 0 | 250 | 20 | 4.85 | 0.15 | high | high | possible_extinction |
| 7 | paper | 0.1 | 18 | 30 | 250 | 10 | 7.05 | 1.09 | high | high | possible_extinction |
| 8 | paper | 0.2 | 26 | 25 | 150 | 10 | 7.68 | 1.47 | high | medium | fast_flame_spread |
| 9 | fabric | 0.5 | 18 | 0 | 200 | 30 | 3.55 | 0.09 | high | high | possible_extinction |
| 10 | plastic | 0.8 | 19 | 10 | 60 | 240 | 3.42 | 0.25 | high | low | fast_flame_spread |
| 11 | wood | 2 | 16 | 25 | 100 | 240 | 4.52 | 0.53 | high | medium | unstable |
| 12 | wire_insulation | 0.4 | 28 | 2 | 40 | 300 | 4.82 | 0.26 | high | medium | fast_flame_spread |
| 13 | paper | 0.1 | 26 | 30 | 80 | 90 | 7.48 | 1.67 | high | high | fast_flame_spread |
| 14 | paper | 0.2 | 16 | 20 | 40 | 300 | 3.42 | 0.34 | high | high | possible_extinction |
| 15 | fabric | 0.5 | 15 | 25 | 80 | 180 | 4.05 | 0.45 | high | high | possible_extinction |
| 16 | plastic | 0.8 | 28 | 20 | 150 | 90 | 7.72 | 1.34 | high | low | fast_flame_spread |
| 17 | wood | 2 | 22 | 25 | 180 | 90 | 6.92 | 1.12 | high | low | fast_flame_spread |
| 18 | wire_insulation | 0.4 | 19 | 3 | 60 | 45 | 2.72 | 0.11 | high | medium | fast_flame_spread |
| 19 | paper | 0.1 | 16 | 25 | 100 | 240 | 4.52 | 0.53 | high | high | possible_extinction |
| 20 | paper | 0.2 | 22 | 8 | 180 | 60 | 5.22 | 0.38 | high | medium | fast_flame_spread |
| 21 | fabric | 0.5 | 26 | 1 | 40 | 240 | 4.18 | 0.18 | high | medium | fast_flame_spread |
| 22 | plastic | 0.8 | 21 | 2 | 120 | 30 | 3.75 | 0.15 | high | medium | fast_flame_spread |
| 23 | wood | 2 | 22 | 10 | 25 | 20 | 3.87 | 0.32 | high | low | fast_flame_spread |
| 24 | wire_insulation | 0.4 | 24 | 25 | 120 | 90 | 6.85 | 1.21 | high | medium | fast_flame_spread |
| 25 | paper | 0.1 | 30 | 8 | 250 | 180 | 8.05 | 0.81 | high | medium | fast_flame_spread |
| 26 | paper | 0.2 | 26 | 15 | 40 | 20 | 5.58 | 0.73 | high | medium | fast_flame_spread |
| 27 | fabric | 0.5 | 19 | 15 | 40 | 10 | 3.72 | 0.35 | high | medium | fast_flame_spread |
| 28 | plastic | 0.8 | 30 | 5 | 250 | 180 | 7.75 | 0.61 | high | low | fast_flame_spread |
| 29 | wood | 2 | 19 | 10 | 120 | 10 | 4.02 | 0.29 | high | low | fast_flame_spread |
| 30 | wire_insulation | 0.4 | 22 | 8 | 60 | 300 | 4.02 | 0.29 | high | medium | fast_flame_spread |

### 19.3 Known Dataset Issues

- `data_source = simulated_rule_based` is not one of the allowed values.
- Row 13: by the formulas, E = 0 + 0 + 3 = 3 → `medium`, but the file says `high`. This is the only discrepancy.
- `risk_level` is only ever `high`; `gravity` is only ever `microgravity`.
- Thickness is hardcoded per material.
- The rules for `flame_size_cm`, `flame_spread_rate_cm_s`, and `expected_result` are not described.
- 30 rows against a target of 50–100.

## 20. Display Settings

Panel tweaks, which do not affect the calculation:

| Setting | Values | Default | What it does |
| --- | --- | --- | --- |
| `showContrib` | yes / no | yes | shows a field's contribution (`R +2 · E +0`) next to the form field's label |
| `signalColors` | Signal / Monochrome | Signal | the palette for level and verdict indicators (21.2); the map and status dots do not change |

## 21. Status Colors

### 21.1 Map, Status Dots, Banners

| Status | Sector fill | Text on the sector | Outline | Dot |
| --- | --- | --- | --- | --- |
| none | `#ebe6e0` | neutral-700 | neutral-400 | neutral-400 |
| low | `oklch(0.90 0.05 155)` | `oklch(0.32 0.07 155)` | `oklch(0.62 0.08 155)` | `oklch(0.66 0.1 155)` |
| medium | `oklch(0.91 0.08 88)` | `oklch(0.34 0.08 75)` | `oklch(0.68 0.1 85)` | `oklch(0.78 0.12 88)` |
| high | `oklch(0.5 0.17 28)` | `#fff` | `oklch(0.42 0.17 28)` | `oklch(0.5 0.17 28)` |

Red "DANGER" (banner, alert, tab counter): background `oklch(0.5 0.17 28)`, white text.

Yellow "WARNING" (alert window header): background `oklch(0.78 0.12 88)`, text `oklch(0.30 0.07 75)`; the window's primary button `oklch(0.42 0.09 75)` with white text.

### 21.2 Level Indicators (fill / tint / text)

| Level | Signal | Monochrome |
| --- | --- | --- |
| low | `oklch(0.74 0.08 155)` / `oklch(0.95 0.025 155)` / `oklch(0.42 0.07 155)` | accent-300 / accent-100 / accent-700 |
| medium | `oklch(0.83 0.09 88)` / `oklch(0.96 0.035 90)` / `oklch(0.46 0.08 75)` | accent-500 / accent-200 / accent-800 |
| high | `oklch(0.70 0.11 30)` / `oklch(0.95 0.025 30)` / `oklch(0.46 0.12 30)` | accent-700 / accent-300 / accent-900 |

### 21.3 Base Palette

Background `#f5f2ee`, cards `#fbf9f6`, text `#383b3f`, dividers `#e6e1da`, accent `#86a3bd` (ramp 100 `#e8eef3` … 900 `#324b63`, working shade 700 `#4f7090`), neutrals 100 `#f1ede8` … 800 `#4d4a46`. Fonts: IBM Plex Sans (text), IBM Plex Mono (numbers, codes).

## 22. Prototype Mock-ups and Limitations

| What | How it works in the prototype | What is needed |
| --- | --- | --- |
| Authorization | a demo account in the client code | a server (6.5) |
| Panel protection | none, opens without logging in | redirect without a session |
| Sign out | a link | `POST /api/auth/logout` |
| 8 h / 15 min session | text only | real timeouts |
| "Forgot your password?" | does nothing | a recovery procedure |
| Calculation | in the browser | on the server (14) |
| "AI module", conclusion, recommendations, report | templates and rules | a model or rules on the server, versioned in the record |
| Transmission to Earth | a 2.5 s timer | a queue and a comm channel |
| Sensors | manual entry | reading ingestion (18.8) |
| History | `localStorage`, 100 records | a DB |
| Time | `HH:MM:SS` only | ISO 8601 with a date |
| Ship layout | 7 placeholder sectors | a real layout from configuration |
| ML model | not trained, button disabled | once the data is fixed |
| Photo | page memory only | storage and linkage to the analysis |
| "Acknowledged" in recommendations | records nothing | an acknowledgment log |

## 23. Reference Test Cases

For validating the server-side calculation (all microgravity unless noted).

| # | Input | Partial risk scores (M,O,F,T,S,G) | R / level | Extinction scores (OD,LF,TB) | E / level | D | Verdict | Boundaries | Confidence | Alert |
| - | --- | --- | --- | --- | --- | --: | --- | --: | --: | --- |
| A | paper 0.5 mm, O₂ 21, flow 5, 25 °C, 30 s | 3,2,2,0,1,1 | 9 / high | 0,0,2 | 2 / medium | 9 | Needs Attention | 4 | 62 | yes, WARNING |
| B | plastic 0.8, O₂ 28, flow 20, 150 °C, 90 s | 3,3,2,2,3,1 | 14 / high | 0,0,1 | 1 / low | 16 | Dangerous | 0 | 84 (−10 for flow > 15) | yes, DANGER |
| C | fabric 5 mm, O₂ 14, flow 0, 20 °C, 5 s, **Earth** | 2,0,1,0,0,0 | 3 / low | 3,2,0 | 5 / high | 2 | Safe | 0 | 94 | no |
| D | wire insulation 0.4, O₂ 21, flow 0, 250 °C, 20 s | 3,2,1,3,1,1 | 11 / high | 0,2,2 | 4 / high | 10 | Dangerous | 1 | 86 | yes, DANGER |
| E | paper 0.1, O₂ 26, flow 30, 80 °C, 90 s (row 13) | 3,3,2,1,3,1 | 13 / high | 0,0,3 | 3 / medium | 13 | Dangerous | 0 | 84 | yes, DANGER |
| F | other 1 mm, O₂ 18.5, flow 3, 60 °C, 45 s | 2,2,2,1,2,1 | 10 / high | 1,0,1 | 2 / medium | 10 | Dangerous | 1 (O₂ in the gap) | 72 (−8 −14) | yes, DANGER |

Aggregation example: analysis A in `l1`, B in `ep`, C in `zh`, the rest with no data → worst = high; nA = 3; mean conf = (62 + 84 + 94) / 3 = 80; confidence = round(80 × (0.6 + 0.4 × 3/7)) = round(80 × 0.7714) = 62; conclusion "Danger in sectors: PB. Needing attention: LB-1. Priority is to neutralize the danger in the listed sectors."

Edge cases:

| Case | Expectation |
| --- | --- |
| All fields filled, no sector selected | Analysis unavailable, "Missing: sector." |
| Material "Other" with no description | Analysis unavailable, the material shows "not filled in" |
| O₂ = `12.9` | Status `bad`, "Allowed range: 13 to 35 %", analysis unavailable |
| O₂ = `abc` (pasted) | Status `bad` |
| Flow in simple mode, transitioning from 7.3 | The field is cleared |
| Double Ctrl+Enter | The second trigger is ignored while a calculation is running |
| Changing the form after an analysis | Banner "Parameters changed…", the result does not recalculate itself |
| Changing the sector after an analysis | The result is marked stale |
| "Clear" | The form is empty, the result is hidden, the sector and history are kept |
| A new safe analysis in a dangerous sector | The sector is recolored, the danger banner disappears (if no other sectors are dangerous) |
| Esc while a window is open | The window closes |
| An analysis with a "Needs Attention" verdict | The "WARNING" window opens (yellow); there is no banner on Overview |
| An analysis with a "Safe" verdict | The window does not open |
| The "Recommended Actions" block on the "Analysis" tab | The first 3 steps from the same list shown in the window and the report |
| Reloading the page while "Queued" | Transmission is simulated again |

## 24. Open Questions

| # | Question |
| --- | --- |
| 16.1 | Whether range boundaries are inclusive; the O₂ 18–19% gap; the OxygenDeficit overlap at 18% |
| 16.2 | How to surface the "high risk + high extinction probability" combination (currently a banner and a −1 to the danger index) |
| 16.3 | Thickness's role in RiskScore |
| 16.4 | The risk scale's skew toward "high" |
| 16.5 | Fixing the dataset |
| 16.6 | How the "Other" material description should be used |
| 16.9 | Rules for explanations and recommendations |
| 16.10 | A model for the flame-size/growth chart (the chart and diagram have been removed from the interface) |
| 16.11 | Material card texts |
| 16.12 | History storage (backend decision: a DB) |
| 16.13 | Validating the NASA ranges |
| 16.14 | The ship's real layout and sector composition |
| 16.15 | Aligning recommendations with crew protocols |
| 16.16 | The format, channel, and acknowledgment of reports sent to Earth |
| 16.17 | Mapping sensors to parameters; what the operator still enters when sensors are present |
| 16.18 | The alert window opens for both "Needs Attention" and "Dangerous". Risk of operator habituation ("Needs Attention" is common, see case A); whether Overview needs a banner for "Needs Attention" too; whether a separate threshold or setting is needed |
| 16.19 | The validity period of a sector's analysis for the overall ship assessment |
| 16.20 | Whether a dangerous sector needs an "acknowledged" mark |
| 16.21 | User roles (operator, administrator, observer on Earth) and their permissions |
| 16.22 | Validating the input step (e.g. O₂ = 21.3 at a step of 0.5) |
