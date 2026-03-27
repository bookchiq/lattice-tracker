---
status: complete
priority: p1
issue_id: "035"
tags: [code-review, performance, dashboard, api]
---

## Problem Statement

`loadProjects()` in the dashboard fetches the project list, then fires a separate `GET /projects/:id` for every project to get `latest_session`, `latest_snapshot`, and `latest_checkpoint`. With 20 projects this is 21 HTTP requests per poll cycle. Combined with the 100 req/min rate limit, the dashboard will hit rate-limit errors at ~100 projects.

Additionally, `showView('projects')` calls `loadProjects()` explicitly AND creates a poller that also calls it immediately, doubling the initial load.

## Findings

- **Source:** Performance oracle, architecture strategist, code simplicity reviewer, JS quality reviewer
- **File:** `server/dashboard/app.js:210-219` (N+1), `server/dashboard/app.js:173-175` (double load)
- **Evidence:** `Promise.all(projects.map(p => apiFetch(...)))` fires N requests

## Proposed Solutions

### Option A: Add `GET /api/projects?include=latest` server endpoint
- Single SQL query with LEFT JOINs returns all projects with latest session/snapshot
- Remove N+1 client-side fetching
- Pros: 21+ requests → 1 request
- Cons: More complex SQL
- Effort: Medium
- Risk: Low

### Option B: Enrich the list endpoint to always include latest_session
- Pros: Simpler client code
- Cons: Heavier default response
- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] Dashboard loads all project data in 1-2 API calls, not N+1
- [ ] Remove double `loadProjects()` call on view switch
- [ ] Rate limit not exhausted by normal dashboard usage
