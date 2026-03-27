---
status: pending
priority: p3
issue_id: "028"
tags: [code-review, hooks, quality]
---

# post-tool-use.sh: 4 near-identical jq templates in case statement

## Fix
Collapse to parameterized single call (~80 lines saved).

## Files
- `hooks/scripts/post-tool-use.sh`
