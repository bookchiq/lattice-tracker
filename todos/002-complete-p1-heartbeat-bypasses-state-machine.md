---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, data-integrity]
---

# updateSessionHeartbeat bypasses state machine

## Problem
`queries.js:113` — `updateSessionHeartbeat` writes status directly without checking `VALID_TRANSITIONS`. A heartbeat can resurrect `completed` or `abandoned` sessions. The event processor default branch (line 115-119) also uses this to transition waiting→active, bypassing the guard.

## Fix
Add `VALID_TRANSITIONS` check inside `updateSessionHeartbeat`, or route status changes through `updateSessionStatus`.

## Files
- `server/src/db/queries.js`
