---
status: complete
priority: p1
issue_id: "021"
tags: [code-review, hooks, reliability]
---

# stop.sh regex may miss whitespace-formatted JSON

## Problem
`stop.sh:10` — `[[ "$INPUT" =~ \"stop_hook_active\":true ]]` requires no space between `:` and `true`. JSON serializers commonly produce spaces. If missed, infinite checkpoint loop.

## Fix
Use permissive regex: `[[ "$INPUT" =~ \"stop_hook_active\"[[:space:]]*:[[:space:]]*true ]]`

## Files
- `hooks/scripts/stop.sh`
