---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, security, performance]
---

# No upper bound on pagination parameters

## Problem
`limit` and `offset` query params are parsed with `parseInt()` but never clamped. `?limit=999999999` forces huge SQLite scans.

## Fix
Clamp: `Math.min(Math.max(parseInt(val || '50', 10), 1), 200)` and `Math.max(parseInt(val || '0', 10), 0)`.

## Files
- `server/src/routes/projects.js`
- `server/src/routes/sessions.js`
