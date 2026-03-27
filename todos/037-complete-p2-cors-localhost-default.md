---
status: complete
priority: p2
issue_id: "037"
tags: [code-review, security, config]
---

## Problem Statement

CORS origin defaults to `http://localhost:3377` when `LATTICE_DASHBOARD_ORIGIN` is not set. In production behind a reverse proxy, this allows any local process to make authenticated cross-origin requests over HTTP.

## Findings

- **Source:** Security sentinel (M1)
- **File:** `server/src/plugins/config.js:16`, `server/src/app.js:53-56`

## Proposed Solutions

- Require explicit `LATTICE_DASHBOARD_ORIGIN` in production (throw if unset and NODE_ENV=production)
- Validate origin starts with `https://` in production
- Effort: Small | Risk: Low

## Acceptance Criteria

- [ ] Server refuses to start in production without explicit CORS origin
- [ ] Default only applies in development
