---
status: complete
priority: p2
issue_id: "043"
tags: [code-review, api, data-integrity]
---

## Problem Statement

`GET /api/sessions/:id` returns snapshots queried by `project_id`, not `session_id`. This returns all project snapshots, not just the session's snapshots.

## Findings

- **Source:** JS quality reviewer
- **File:** `server/src/routes/sessions.js:32`
- **Evidence:** `queries.getSnapshotsByProjectId(session.project_id, ...)` instead of session-scoped query

## Proposed Solutions

- Add `getSnapshotsBySessionId` query and use it in the session detail route
- Effort: Small | Risk: Low

## Acceptance Criteria

- [ ] Session detail returns only that session's snapshots
- [ ] Or document that project-scoped snapshots is intentional and rename the field
