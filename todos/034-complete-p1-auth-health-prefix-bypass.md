---
status: complete
priority: p1
issue_id: "034"
tags: [code-review, security, api]
---

## Problem Statement

The auth plugin skips authentication for any URL starting with `/api/health`, which would also match `/api/healthcheck`, `/api/health-admin`, etc. If future routes are added under this prefix, they bypass authentication.

## Findings

- **Source:** JS quality reviewer, security sentinel
- **File:** `server/src/plugins/auth.js:15`
- **Evidence:** `request.url.startsWith('/api/health')` is too broad

## Proposed Solutions

### Option A: Exact path match
- Change to `request.url === '/api/health' || request.url.startsWith('/api/health?')`
- Pros: Simple, precise
- Cons: None
- Effort: Trivial
- Risk: None

### Option B: Route-level auth decoration
- Mark routes as public via config, check in auth hook
- Pros: Scalable, deny-by-default
- Cons: More refactoring
- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] Only exact `/api/health` (with optional query string) skips auth
- [ ] Test verifying `/api/healthcheck` requires auth
