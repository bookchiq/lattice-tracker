---
status: complete
priority: p1
issue_id: "033"
tags: [code-review, data-integrity, api]
---

## Problem Statement

Events with a `session_id` that does not exist in the sessions table cause an unhandled SQLite foreign key constraint error (500). The event processor only creates sessions for `session.start` events. Any out-of-order arrival (heartbeat before start, lost start event) crashes the request.

## Findings

- **Source:** JS quality reviewer
- **File:** `server/src/services/event-processor.js:40-41`
- **Evidence:** Schema has `events.session_id REFERENCES sessions(id)` with `foreign_keys = ON`. Only `session.start` triggers `upsertSession`. All other event types assume the session exists.

## Proposed Solutions

### Option A: Upsert session for any event carrying a session_id
- Pros: Self-healing, handles out-of-order events
- Cons: Creates sessions with incomplete metadata
- Effort: Small
- Risk: Low

### Option B: Catch FK error and return 422
- Pros: Preserves data model integrity
- Cons: Events are permanently lost
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] Non-start events with unknown session_id do not crash with 500
- [ ] Clear error response or auto-created session
- [ ] Test coverage for out-of-order event arrival
