---
status: pending
priority: p2
issue_id: "004"
tags: [code-review, security]
---

# CORS defaults to wildcard origin

## Problem
`config.js:13` — `dashboardOrigin` defaults to `'*'` if env var is not set, allowing any website to make cross-origin API requests.

## Fix
Default to `'http://localhost:3377'` instead of `'*'`.

## Files
- `server/src/plugins/config.js`
