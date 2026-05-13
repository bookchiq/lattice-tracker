---
status: pending
priority: p3
issue_id: "093"
tags: [code-review, agent-native, schema, follow-up]
dependencies: ["089"]
---

## Problem Statement

PR #13 reassigns `last_activity_at` to mean "last real work." A natural agent question that *was* answerable from `GET /api/projects` — "which projects had a Claude session open in the last 24h?" — is no longer directly expressible without joining the sessions table.

Flagged by **agent-native-reviewer (P2)**.

## Findings

Currently the agent has to:
1. Query `GET /api/sessions?status=active,waiting_for_input` — catches *currently*-open sessions
2. Query `GET /api/sessions` and order by `started_at` — catches recently-started sessions

Neither cleanly answers "session was alive in the last 24h." Adding `last_seen_at` to projects (bumped by *any* event, including passive ones) restores the expressivity without re-muddying `last_activity_at`.

## Proposed Solutions

**Option A: Add `last_seen_at` column to `projects` (recommended)**

Schema migration (migration 2+ pattern per CLAUDE.md):
```sql
ALTER TABLE projects ADD COLUMN last_seen_at TEXT;
```

Update the consolidated `upsertProject` (per todo #089) to always update `last_seen_at` regardless of event type. `last_activity_at` continues to only update on real-work events.

- Pros: Restores full expressivity; doesn't compromise the PR #13 fix.
- Cons: One new column; one migration; one new API field.
- Effort: Medium.

**Option B: Derive at query time from `events` table**

Add a `GET /api/projects?include=last_seen_at` option that left-joins on `events`.

- Pros: No schema change.
- Cons: Hot-path query cost; harder to use in dashboards.

**Option C: Do nothing**

- Pros: Defer until an agent workflow actually needs it.
- Cons: The need is plausible (e.g., "show me what I had open yesterday").

## Recommended Action

Defer until an actual agent workflow needs it. Tracked here so the gap isn't forgotten.

## Technical Details

- **Affected files (when implemented):**
  - `server/src/db/schema.sql` — would be migration 2+ added via `migrate(...)` in `plugins/db.js`
  - `server/src/db/queries.js` — `_upsertProject` would also set `last_seen_at`
  - `server/src/routes/projects.js` — expose the field

## Acceptance Criteria

- [ ] Decide if/when to implement based on real agent demand
- [ ] If implemented: follow migration convention from CLAUDE.md (inline `migrate()` block in `plugins/db.js`, not schema.sql)

## Resources

- PR #13: https://github.com/bookchiq/lattice-tracker/pull/13
- Reviewer: agent-native-reviewer
- Depends on #089 for the consolidated upsertProject path
