---
status: pending
priority: p3
issue_id: "016"
tags: [code-review, quality]
---

# trigger vs trigger_type naming inconsistency

## Problem
`event-processor.js:79` accepts both `payload.trigger` and `payload.trigger_type`. DB column is `trigger_type`. Tests use `trigger`.

## Fix
Standardize on `trigger` in API payloads (shorter), map to `trigger_type` DB column in event-processor.

## Files
- `server/src/services/event-processor.js`
