---
status: complete
priority: p2
issue_id: "066"
tags: [code-review, naming, optional-auth, consistency]
dependencies: []
---

## Problem Statement

The same single bit has three different names across the boundary:
- `server/src/plugins/config.js:19,42` — `authDisabled` (negative)
- `server/src/routes/config.js:3` — `authRequired` (positive, wire format)
- `server/dashboard/app.js:6,25,29,70,81` — `authRequired` (positive)

The existing convention in `config.js:38-46` is positive/affirmative (`port`, `dbPath`, `apiToken`, `host`, `dashboardOrigin`). `authDisabled` is the only `xDisabled` field. The polarity flip also makes the `??` defaulting at `config.js:19` subtly fragile: an explicit `overrides.authDisabled = false` correctly wins, but a future refactor that passes `authRequired` from a caller will silently invert.

## Findings

- **Source:** pattern-recognition-specialist
- **Files:** `server/src/plugins/config.js`, `server/src/routes/config.js`, `server/dashboard/app.js`, README
- **Evidence:** Three names, two polarities for one bit.

## Proposed Solutions

### Option A: Standardize on `authRequired` everywhere
- Env var: `LATTICE_AUTH_REQUIRED=false` (default true — backward compatible since unset → true)
- Server config: `app.config.authRequired`
- Wire format: unchanged (already `authRequired`)
- Pros: Positive-affirmative matches existing convention; one name end-to-end
- Cons: Env var change is a soft behavior shift if anyone has scripted the old name (just shipped — unlikely)
- Effort: Small

### Option B: Keep `LATTICE_AUTH_DISABLED` env, but use `authRequired` for everything internal
- Translate at the boundary: `authRequired = !parseBool(env.LATTICE_AUTH_DISABLED)`
- Pros: Public API stable; internal consistency
- Cons: One translation point
- Effort: Small

### Option C: Standardize on `authDisabled` everywhere
- Env stays; server config field stays; wire format becomes `{ authDisabled: false }`; dashboard uses `authDisabled`
- Pros: Smallest diff
- Cons: Bucks the positive-affirmative convention; everyone reading the dashboard code has to invert
- Effort: Trivial

## Acceptance Criteria

- [ ] One name (and polarity) used end-to-end, or exactly one documented translation point
- [ ] No `??` defaulting that silently inverts on caller refactor
- [ ] Tests cover both polarities at the chosen translation boundary
