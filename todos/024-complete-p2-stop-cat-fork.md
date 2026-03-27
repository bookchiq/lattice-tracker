---
status: complete
priority: p2
issue_id: "024"
tags: [code-review, hooks, performance]
---

# stop.sh fast path forks subprocess via $(cat)

## Problem
`stop.sh:7` — `INPUT="$(cat)"` forks a subprocess on every Claude response. Should be 0 forks on fast path.

## Fix
Replace with bash builtin: `INPUT=""; while IFS= read -r line; do INPUT+="$line"; done` or `read -r -d '' INPUT`

## Files
- `hooks/scripts/stop.sh`
- `hooks/scripts/notification.sh` (same issue)
