---
status: complete
priority: p3
issue_id: "018"
tags: [code-review, agent-native]
---

# List responses lack pagination metadata

## Problem
List endpoints return bare arrays. Agents can't determine if more results exist.

## Fix
Wrap in `{ data: [...], limit, offset }`. Consider adding total count.

## Files
- `server/src/routes/projects.js`
- `server/src/routes/sessions.js`
