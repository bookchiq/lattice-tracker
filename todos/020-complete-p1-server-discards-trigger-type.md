---
status: complete
priority: p1
issue_id: "020"
tags: [code-review, server, data-integrity]
---

# Server discards trigger_type from git.snapshot events

## Problem
`event-processor.js:104` — `trigger_type: event.event_type.replace('git.', '')` always produces `"snapshot"` for `git.snapshot` events, ignoring `payload.trigger_type` sent by hooks (session_start, session_end, push, etc.).

## Fix
For the `git.snapshot` case, prefer `payload.trigger_type`: `trigger_type: payload.trigger_type || event.event_type.replace('git.', '')`

## Files
- `server/src/services/event-processor.js`
