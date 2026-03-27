---
status: pending
priority: p1
issue_id: "019"
tags: [code-review, hooks, data-integrity]
---

# session-start.sh payload.cwd contains session_id instead of actual cwd

## Problem
`session-start.sh:80` has `cwd: $session_id` — should be `cwd: $cwd` with `--arg cwd "$CWD"` added to the jq call.

## Files
- `hooks/scripts/session-start.sh`
