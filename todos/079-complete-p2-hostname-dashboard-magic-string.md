---
status: complete
priority: p2
issue_id: "079"
tags: [code-review, agent-native, dashboard, conventions]
dependencies: []
---

## Problem Statement

The dashboard sends `hostname: 'dashboard'` in `project.note` events to mark UI-originated entries. This magic string is hardcoded twice in `server/dashboard/app.js:651, 659`, asserted in `server/test/notes.test.js:33, 48`, and rendered back to the user via `note.author` in `renderNote`.

There's no documented convention for what `hostname` should be on events from various origins:
- Hooks send the real machine hostname (`hooks/scripts/lib/common.sh:159` `LATTICE_HOSTNAME`)
- Dashboard sends `'dashboard'`
- Future agent-driven note posts (via `/lattice:note` slash command — see #075) — what should they send?

A real machine that happens to be named `dashboard` would collide.

## Findings

- **Source:** pattern-recognition-specialist, agent-native-reviewer, security-sentinel (security: hostname is self-reported; trust model is single-user)
- **Files:** `server/dashboard/app.js:651, 659`; `server/test/notes.test.js:33, 48`; `docs/plans/lattice-spec.md` (no mention)

## Proposed Solutions

### Option A: Constant + spec entry
- Define `const DASHBOARD_HOSTNAME = 'dashboard'` near the top of `app.js`; reuse at both sites and in tests
- Add to `docs/plans/lattice-spec.md`: reserved hostname values ("dashboard" for browser, real hostname for hooks, `agent:<name>` for headless agents)
- Pros: Documents intent; one-line change to rename later
- Cons: Trivial overhead
- Effort: Small

### Option B: Prefix scheme (`ui:dashboard`, `hook:Sarahs-Mac-mini`, `agent:claude-code`)
- More explicit about origin
- Pros: Self-describing; collision-proof
- Cons: Existing hooks would all need updating; breaks backward compatibility
- Effort: Medium

### Option C: Add nullable `origin` column to notes table; keep hostname as-is
- Schema change, but cleanest separation
- Pros: Hostname stays a real machine identifier; origin is intent
- Cons: Migration needed; over-engineering for single user
- Effort: Medium

## Recommended

**Option A** for now. Revisit if the spec ever formalizes multi-origin attribution.

## Acceptance Criteria

- [ ] `'dashboard'` literal appears exactly once in source (a named constant)
- [ ] `docs/plans/lattice-spec.md` documents the reserved hostname conventions
- [ ] `commands/note.md` (from #075) uses the documented convention for agent-originated notes
