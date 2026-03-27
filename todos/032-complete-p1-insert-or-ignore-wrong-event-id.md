---
status: complete
priority: p1
issue_id: "032"
tags: [code-review, data-integrity, api]
---

## Problem Statement

`POST /api/events` and `POST /api/events/batch` return wrong `event_id` when a duplicate `client_event_id` causes `INSERT OR IGNORE` to skip the insert. SQLite's `lastInsertRowid` returns the rowid of the **last successful insert on that connection**, not the ignored row. Clients receive a stale ID as if their event was inserted.

## Findings

- **Source:** JS quality reviewer, performance reviewer
- **File:** `server/src/routes/events.js:34-35` (single), `server/src/routes/events.js:21-26` (batch)
- **Evidence:** `INSERT OR IGNORE` in `queries.js:12` silently drops duplicates; `result.changes === 0` when ignored but `lastInsertRowid` is stale

## Proposed Solutions

### Option A: Check `result.changes` and return 200 for duplicates
- Pros: Simple, honest API response
- Cons: Need to look up existing row to return its ID
- Effort: Small
- Risk: Low

### Option B: Return 409 Conflict for duplicates
- Pros: Clear contract
- Cons: Clients must handle 409
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] Duplicate `client_event_id` returns correct status code (not 201)
- [ ] Response does not contain a stale/wrong event ID
- [ ] Batch endpoint handles partial duplicates correctly
- [ ] Test coverage for duplicate event ID behavior
