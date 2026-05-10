---
status: complete
priority: p3
issue_id: "083"
tags: [code-review, db, migrations, robustness]
dependencies: []
---

## Problem Statement

`server/src/plugins/db.js:23-46` runs each migration via `db.exec(...)` followed by `db.pragma('user_version = N')`. better-sqlite3's `exec()` does NOT wrap multi-statement SQL in a transaction. If a statement in the middle of a migration fails (e.g., `CREATE INDEX` after `CREATE TABLE`), `user_version` won't bump (good), but the partially-applied schema would be retried on next boot — `IF NOT EXISTS` saves us today, but not all future migrations will be that forgiving.

## Findings

- **Source:** security-sentinel (P2-low / robustness)
- **File:** `server/src/plugins/db.js:23-46`

## Proposed Solutions

### Option A: Wrap each migration in a transaction
```js
const apply = db.transaction(() => {
  db.exec(MIGRATION_2_SQL);
  db.pragma('user_version = 2');
});
apply();
```
- Pros: All-or-nothing per migration; safer for future ALTERs that may be non-idempotent
- Cons: Tiny diff, easy to forget on the next migration
- Effort: Small

### Option B: Build a tiny migration helper that always wraps
```js
function migrate(version, sql) {
  if (currentVersion < version) {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
    fastify.log.info(`Applied migration ${version}`);
  }
}
```
- Pros: Future migrations stay safe by default
- Cons: Slight indirection
- Effort: Small

### Option C: Leave as-is; document `IF NOT EXISTS` as the safety net
- Pros: No change
- Cons: Future-you will write a non-idempotent migration eventually
- Effort: None

## Acceptance Criteria

- [ ] Each migration block is atomic (DDL + version bump succeed or fail together)
- [ ] Test (or manual) — induce a migration failure (e.g., bad SQL); verify `user_version` did not advance
