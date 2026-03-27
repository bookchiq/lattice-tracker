---
status: complete
priority: p2
issue_id: "025"
tags: [code-review, hooks, data-integrity]
---

# session-end.sh missing CWD handling

## Problem
session-end.sh does not extract or cd to cwd from stdin JSON. Git snapshot and project detection may run from wrong directory.

## Fix
Add CWD extraction and cd, matching session-start.sh pattern.

## Files
- `hooks/scripts/session-end.sh`
