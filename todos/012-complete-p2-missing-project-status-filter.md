---
status: complete
priority: p2
issue_id: "012"
tags: [code-review, agent-native]
---

# Missing project status filter

## Problem
Plan says `GET /api/projects` should be filterable by `status` (active sessions exist?), but only `client_tag` is implemented. Agents can't ask "which projects have active sessions?"

## Fix
Add a query that LEFT JOINs projects with sessions to determine active/idle, wire into `?status=active|idle` query param.

## Files
- `server/src/db/queries.js`
- `server/src/routes/projects.js`
