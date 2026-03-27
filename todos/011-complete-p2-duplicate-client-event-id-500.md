---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, data-integrity]
---

# Duplicate client_event_id causes 500 error

## Problem
`schema.sql:28` — `client_event_id TEXT UNIQUE`. A retry with the same ID throws UNIQUE constraint violation → raw 500 error. In batch mode, one duplicate rolls back all 50 events.

## Fix
Use `INSERT OR IGNORE` for the events table, or catch the constraint error and return 409.

## Files
- `server/src/db/queries.js`
- `server/src/routes/events.js`
