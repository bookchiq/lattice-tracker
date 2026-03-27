---
status: pending
priority: p3
issue_id: "029"
tags: [code-review, hooks, performance]
---

# session-start.sh: 5 separate jq calls for checkpoint parsing

## Fix
Consolidate to single jq call with @tsv output.

## Files
- `hooks/scripts/session-start.sh`
