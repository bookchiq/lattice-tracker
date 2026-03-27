---
status: complete
priority: p3
issue_id: "014"
tags: [code-review, security]
---

# Missing security headers

## Fix
Add CSP, HSTS, Referrer-Policy, Permissions-Policy to `onSend` hook.

## Files
- `server/src/index.js`
