---
status: complete
priority: p1
issue_id: "074"
tags: [code-review, architecture, db, migrations]
dependencies: []
---

## Problem Statement

The `notes` table is defined in TWO places: `server/src/db/schema.sql:70-78` (loaded by migration 1 for fresh installs) AND `server/src/plugins/db.js:31-46` (migration 2's inline `CREATE TABLE`). They happen to match today by careful copy-paste; nothing enforces it. A future ALTER will require touching both, and there's no test that asserts a fresh-install DB equals a migrated DB.

This is the first non-trivial migration in the repo, so the convention being set here matters for migration 3+.

## Findings

- **Source:** architecture-strategist, pattern-recognition-specialist, code-simplicity-reviewer (all P1)
- **Files:** `server/src/db/schema.sql:70-78`, `server/src/plugins/db.js:31-46`

## Proposed Solutions

### Option A: Inline-only migrations
- Keep `schema.sql` as the v1 baseline only; revert the notes-table addition there.
- All migrations 2+ live as inline blocks in `db.js`.
- Pros: One source of truth per version; clear historical narrative.
- Cons: Fresh installs replay every migration in order (more startup work; trivial here).

### Option B: Per-migration files
- Extract migration 2 to `server/src/db/migrations/002_notes.sql`; keep `schema.sql` as the canonical full schema.
- Migration loader reads ordered migration files.
- Pros: Diff-friendly history; SQL stays out of JS strings.
- Cons: New file convention; small upfront work.

### Option C: Shared constant
- Pull the CREATE TABLE into a `const NOTES_DDL` used by both `schema.sql` (impossible — SQL file) or both `db.js` paths.
- Pros: Smallest change.
- Cons: schema.sql is plain SQL; can't share constants across boundaries cleanly.

## Acceptance Criteria

- [ ] Pick one convention (A or B); document it in `CLAUDE.md` so migration 3 doesn't repeat the mistake
- [ ] If A: revert `schema.sql:70-78,93` (notes table + its index) so it represents only the v1 baseline
- [ ] If B: extract migration 2 to a SQL file and update `db.js` to read it
- [ ] Add a test (or at least a manual step) that fresh-install + migrated-from-v1 produce identical `sqlite_schema`
