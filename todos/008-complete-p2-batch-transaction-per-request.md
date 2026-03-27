---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, performance]
---

# Batch endpoint creates transaction wrapper per request

## Problem
`events.js:47` creates a new `db.transaction()` on every batch request. The single-event path correctly creates it once at registration time (line 21).

## Fix
Move the batch transaction to registration time alongside `processInTransaction`.

## Files
- `server/src/routes/events.js`
