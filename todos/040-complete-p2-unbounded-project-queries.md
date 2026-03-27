---
status: complete
priority: p2
issue_id: "040"
tags: [code-review, performance, database]
---

## Problem Statement

All four project list queries (`_getProjects`, `_getProjectsByTag`, `_getActiveProjects`, `_getIdleProjects`) lack a `LIMIT` clause. With hundreds of projects, every call returns the entire table.

## Findings

- **Source:** Performance oracle
- **File:** `server/src/db/queries.js:46-60`

## Proposed Solutions

- Add `LIMIT @limit OFFSET @offset` to all project list queries (matching sessions pattern)
- Default limit of 50
- Effort: Small | Risk: Low

## Acceptance Criteria

- [ ] All project list queries have LIMIT/OFFSET
- [ ] API response includes pagination metadata
