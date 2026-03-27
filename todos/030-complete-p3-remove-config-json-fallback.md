---
status: pending
priority: p3
issue_id: "030"
tags: [code-review, hooks, quality]
---

# Remove config.json fallback from common.sh (YAGNI)

## Fix
Delete lines 18-24 of common.sh. config.env is the canonical format.

## Files
- `hooks/scripts/lib/common.sh`
