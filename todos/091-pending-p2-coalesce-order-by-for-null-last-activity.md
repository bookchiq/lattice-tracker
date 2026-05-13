---
status: pending
priority: p2
issue_id: "091"
tags: [code-review, data-integrity, dashboard, sql]
dependencies: []
---

## Problem Statement

After PR #13, a project whose only events are passive (`session.heartbeat`, `session.waiting`, `session.end`) will have `last_activity_at = NULL`. The five `ORDER BY last_activity_at DESC` queries in `server/src/db/queries.js` will then sort these projects to the bottom (SQLite sorts NULLs last in DESC), and the dashboard cell at `server/dashboard/app.js:309-310` will render empty.

Flagged by **data-integrity-guardian (P2)**.

## Findings

**When can this happen in practice?**

1. `session.start` was emitted before this fix existed → project has a non-null `last_activity_at` from a prior heartbeat → fine.
2. `session.start` is dropped/lost by the network but later heartbeats succeed → `last_activity_at = NULL`. Real but uncommon.
3. A brand-new project's first-ever event is a heartbeat (e.g., `session.start` failed during a server restart window) → `last_activity_at = NULL`. Real, edge case.
4. The hook installs and starts a session on a machine that was already running before `session.start` infrastructure existed → not applicable today, but could occur during upgrades.

**Affected queries in `server/src/db/queries.js`:**
- `_getProjects` (line ~77)
- `_getProjectsByTag` (line ~78)
- `_getActiveProjects` (line ~83)
- `_getIdleProjects` (line ~91)
- `_searchProjects` (line ~102)

## Proposed Solutions

**Option A: Change ORDER BY to `COALESCE(last_activity_at, created_at) DESC` (recommended)**

- Pros: Cheap; doesn't conflate "row created" with "real work" (still keeps the timestamp itself clean); the dashboard cell can fall back to `created_at` for the relative-time display.
- Cons: Five queries to update.
- Effort: Small.

**Option B: Have `ensureProject` set `last_activity_at = COALESCE(projects.last_activity_at, datetime('now'))` on the INSERT-only path**

- Pros: One change instead of five.
- Cons: Subtly defeats the point of the fix — a heartbeat-only project would have a `last_activity_at` of "when I first saw it," which is not "real work happened" and not "row created" either. Semantically muddled.

**Option C: Update the dashboard fallback only**

- Pros: Smallest change.
- Cons: Doesn't fix the sort order — the project still sinks to the bottom of the list.

## Recommended Action

Option A. Pair with todo #089 (consolidate upsert) — both touch `queries.js` and should land together.

## Technical Details

- **Affected files:**
  - `server/src/db/queries.js` — five ORDER BY clauses
  - `server/dashboard/app.js:309-310` — fallback `timeAgo(project.last_activity_at || project.created_at)`
- **Database:** no schema change.

## Acceptance Criteria

- [ ] All five `ORDER BY last_activity_at DESC` queries updated to `ORDER BY COALESCE(last_activity_at, created_at) DESC`
- [ ] Dashboard cell falls back to `created_at` when `last_activity_at` is null
- [ ] New regression test: a project with only heartbeats appears in `GET /api/projects` results in the correct relative position (by `created_at`)

## Resources

- PR #13: https://github.com/bookchiq/lattice-tracker/pull/13
- Reviewer: data-integrity-guardian
