# XScience — Working Rules (anchored-first)

Project: a hackathon prototype of a fire-hazard assessment panel for a spacecraft
operating under microgravity. The frontend has been rewritten in React (`frontend/`,
see `frontend/README.md`), based on the original HTML/CSS/JS prototype
(`XScience Login.dc.html`, `XScience Console.dc.html` — these remain as a design
reference and are not edited). The backend (Flask) is implemented in `backend/`
(see `backend/README.md`); the original plan is `BACKEND.md`.
The full breakdown of the calculation rules is in README.md and FUNCTIONAL_SPEC.md,
but do not re-read them directly during a session — see the rule below.

## Rule: everything through anchored

For maximum token savings in this project, all memory operations, context
search, and reading of large files must go through the `anchored` MCP server
rather than native tools:

1. **Session start** — the very first step is to call `anchored_context(cwd=...)`.
   Do not begin work or respond until the context has loaded.
2. **Searching for facts/decisions/project history** — `anchored_search` /
   `anchored_kg_query`. Do not grep or re-read files if the answer might
   already be in memory.
3. **Reading documentation and large files** (README.md, FUNCTIONAL_SPEC.md,
   support.js, *.dc.html, industry.css) — first `anchored_index`, then route
   every question about their content through `anchored_ctx_search`, not a
   direct `Read`/`cat`.
4. **Running commands with large output** (builds, tests, grepping large
   files, git history) — `anchored_execute` / `anchored_batch_execute`
   instead of raw Bash, when the output is large.
5. **Processing a file without intending to edit it** — `anchored_execute_file`
   instead of `Read`.
6. **New facts, decisions, root causes of bugs** — save them immediately via
   `anchored_save` (fact/decision/learning/plan/event — whichever fits), do
   not keep them only in the conversation context.
7. **Exception**: `Read`/`Edit`/`Write` are used as usual for files that are
   actually being edited in the current task — anchored does not replace
   targeted code editing.

These rules are a project decision made by the user, also recorded in
anchored memory (category: preference, scope: project).
