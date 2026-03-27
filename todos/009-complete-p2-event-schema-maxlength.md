---
status: complete
priority: p2
issue_id: "009"
tags: [code-review, security]
---

# No maxLength on event schema string fields

## Problem
`events.js:8-13` — `event_type`, `session_id`, `project_id`, `hostname` have no length limits. A 1MB `event_type` string would be accepted.

## Fix
Add `maxLength` to all string properties: event_type (100), session_id (255), project_id (500), hostname (255), timestamp (30).

## Files
- `server/src/routes/events.js`
