---
status: pending
priority: p3
issue_id: "015"
tags: [code-review, architecture]
---

# Test helper duplicates app composition

## Fix
Extract app setup into a shared `src/app.js` factory. Both `index.js` and `test/helpers.js` consume it.

## Files
- `server/src/index.js` → `server/src/app.js` (new)
- `server/test/helpers.js`
