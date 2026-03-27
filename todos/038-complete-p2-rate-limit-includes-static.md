---
status: complete
priority: p2
issue_id: "038"
tags: [code-review, performance, api]
---

## Problem Statement

Rate limiter is registered globally, counting static asset requests (HTML, CSS, JS, favicon) against the 100 req/min limit. Dashboard page loads consume 4+ slots. Combined with N+1 project fetches, the rate limit is easily exhausted.

## Findings

- **Source:** Performance oracle
- **File:** `server/src/app.js:61-64`

## Proposed Solutions

- Scope rate limiter to `/api/` routes only via `allowList` config
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] Static asset requests are not rate-limited
- [ ] API requests remain rate-limited
