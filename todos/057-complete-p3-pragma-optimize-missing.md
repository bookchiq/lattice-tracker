---
status: complete
priority: p3
issue_id: "057"
tags: [code-review, performance, database]
---

## Problem Statement

No `PRAGMA optimize` is called on SQLite. SQLite recommends running it periodically to update query planner statistics.

## Proposed Solutions

- Add `db.pragma('optimize')` in the `onClose` hook before `db.close()`
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] PRAGMA optimize runs on server shutdown
