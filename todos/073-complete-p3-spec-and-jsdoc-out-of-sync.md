---
status: complete
priority: p3
issue_id: "073"
tags: [code-review, docs, optional-auth]
dependencies: []
---

## Problem Statement

Two doc surfaces are out of sync with the new env vars:

1. **`docs/plans/lattice-spec.md`** — lists `LATTICE_API_TOKEN`, `LATTICE_DASHBOARD_ORIGIN`, `LATTICE_DB_PATH`, etc., but does not mention `LATTICE_AUTH_DISABLED` or `LATTICE_TRUSTED_CIDRS`. Spec is the source of truth per CLAUDE.md.

2. **`server/src/app.js:25` JSDoc** — `buildApp` opts list includes `apiToken`, `host`, `port`, `dashboardOrigin`, but omits the new `authDisabled` and `trustedCidrs` opts (added at lines 40-41, 54-55).

## Findings

- **Source:** pattern-recognition-specialist
- **Files:** `docs/plans/lattice-spec.md`, `server/src/app.js:18-30`

## Proposed Solutions

Add two entries to the spec config section and two `@param` lines to the JSDoc. Both are mechanical.

## Acceptance Criteria

- [ ] `docs/plans/lattice-spec.md` documents `LATTICE_AUTH_DISABLED` and `LATTICE_TRUSTED_CIDRS` (purpose, default, security note)
- [ ] `buildApp` JSDoc lists all opts the function accepts
