---
status: complete
priority: p2
issue_id: "023"
tags: [code-review, hooks, security]
---

# Path traversal via crafted session_id

## Problem
`session-start.sh:57` — session_id from stdin JSON used directly in file path. `../` would write outside active-sessions dir.

## Fix
Validate: `[[ ! "$SESSION_ID" =~ ^[a-zA-Z0-9_-]+$ ]] && exit 0`

## Files
- `hooks/scripts/session-start.sh`
- `hooks/scripts/session-end.sh`
