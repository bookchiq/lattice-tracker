---
status: complete
priority: p2
issue_id: "089"
tags: [code-review, simplification, architecture, queries]
dependencies: []
---

## Problem Statement

PR #13 introduces `ensureProject` alongside `upsertProject` to split "create row if missing" from "create + bump last_activity_at." This works but doubles the surface area — two prepared statements, two exported functions, and an `if/else` branch in `event-processor.js:44-48`. Three reviewers independently flagged this:

- **code-simplicity-reviewer (P1):** collapse to one function with a nullable `last_activity_at`.
- **architecture-strategist (P2):** the `ensureProject`/`upsertProject` pair is "trap-shaped" — a future contributor reaching for `ensureProject` by default may silently stop bumping activity in a code path that should.
- **pattern-recognition-specialist (P2):** `PASSIVE_EVENT_TYPES` is a new pattern (only `Set` of its kind), but the upfront branch is fine if we keep both functions.

## Findings

The nullability of `last_activity_at` *is* the "should we bump" signal. We don't need a second function — we need the existing SQL to no-op when the caller passes `null`.

**Proposed SQL change** (`server/src/db/queries.js:42-48`):

```sql
INSERT INTO projects (id, git_remote_url, canonical_name, last_activity_at, created_at)
VALUES (@id, @git_remote_url, @canonical_name, @last_activity_at, datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  last_activity_at = MAX(
    COALESCE(projects.last_activity_at, ''),
    COALESCE(@last_activity_at, projects.last_activity_at, '')
  ),
  git_remote_url = COALESCE(@git_remote_url, projects.git_remote_url)
```

When `@last_activity_at` is `NULL`, the inner `COALESCE` resolves to the existing value, and `MAX(existing, existing) = existing` → no change. When non-null, behavior is identical to today.

**Call-site change** (`server/src/services/event-processor.js:43-50`):

```js
queries.upsertProject({
  ...projectFields,
  last_activity_at: PASSIVE_EVENT_TYPES.has(event.event_type) ? null : event.timestamp,
});
```

Plus: stop defaulting `last_activity_at` to `new Date().toISOString()` in `upsertProject` (queries.js:55) — pass `null` through.

## Proposed Solutions

**Option A: Single function with nullable timestamp (recommended)**
- Pros: ~23 LOC removed; one code path; nullability is self-documenting; eliminates the trap-shaped naming.
- Cons: SQL is slightly denser (double `COALESCE`).
- Effort: Small.

**Option B: Rename to `touchProject` / `ensureProjectRow`**
- Pros: Names communicate semantics (touch = bumps, ensure-row = doesn't).
- Cons: Still two functions, still a branch, still a foot-gun for the next contributor.
- Effort: Small.

**Option C: Keep current design**
- Pros: No churn.
- Cons: Three reviewers flagged it; the consolidation is genuinely cleaner.

## Recommended Action

Option A.

## Technical Details

- **Affected files:**
  - `server/src/db/queries.js` — update `_upsertProject` SQL, remove `_ensureProject` + `ensureProject` + export
  - `server/src/services/event-processor.js` — collapse if/else to single call
- **Database:** no schema change.

## Acceptance Criteria

- [ ] `_ensureProject` and `ensureProject` removed from `server/src/db/queries.js`
- [ ] `ensureProject` removed from queries export
- [ ] `_upsertProject` SQL uses double-COALESCE pattern
- [ ] `upsertProject` no longer auto-defaults `last_activity_at`
- [ ] `event-processor.js` calls `upsertProject` once, passing `null` for passive events
- [ ] Existing tests in `events.test.js` still pass (including the two added by PR #13)
- [ ] Net LOC reduction vs current PR #13 state

## Resources

- PR #13: https://github.com/bookchiq/lattice-tracker/pull/13
- Reviewers: code-simplicity-reviewer, architecture-strategist, pattern-recognition-specialist
