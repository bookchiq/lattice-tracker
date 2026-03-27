---
status: complete
priority: p2
issue_id: "010"
tags: [code-review, quality]
---

# JSON.parse without error handling in event processor

## Problem
`event-processor.js:11` — If `event.payload` is a non-empty string that is not valid JSON, `JSON.parse()` throws, causing a 500.

## Fix
Wrap in try/catch, default to `{}` on parse failure.

## Files
- `server/src/services/event-processor.js`
