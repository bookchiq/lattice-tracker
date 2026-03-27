---
status: complete
priority: p2
issue_id: "045"
tags: [code-review, reliability, database]
---

## Problem Statement

Stale session cleanup (marking abandoned sessions) runs only at server startup. If the server runs for weeks, stale `active` sessions accumulate when heartbeats stop arriving.

## Findings

- **Source:** Architecture strategist, performance oracle
- **File:** `server/src/plugins/db.js:32-42`

## Proposed Solutions

- Add a periodic cleanup interval (e.g., every 5 minutes) via setInterval in the db plugin
- Use `onClose` hook to clear the interval
- Effort: Small | Risk: Low

## Acceptance Criteria

- [ ] Stale sessions are cleaned up periodically, not just at startup
- [ ] Interval is properly cleared on server shutdown
