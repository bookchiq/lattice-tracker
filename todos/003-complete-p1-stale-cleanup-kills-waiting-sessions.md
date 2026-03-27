---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, data-integrity]
---

# Stale cleanup marks waiting sessions as abandoned

## Problem
`session.waiting` in event-processor.js does NOT update `last_heartbeat_at`. The startup cleanup in db.js marks sessions with `last_heartbeat_at` older than 10 minutes as `abandoned`. A session legitimately waiting for user input >10 minutes gets killed.

## Fix
Either (a) update `last_heartbeat_at` when transitioning to `waiting_for_input`, or (b) exclude `waiting_for_input` sessions from the stale cleanup query.

## Files
- `server/src/plugins/db.js`
- `server/src/services/event-processor.js`
