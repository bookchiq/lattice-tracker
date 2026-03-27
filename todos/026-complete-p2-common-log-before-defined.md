---
status: complete
priority: p2
issue_id: "026"
tags: [code-review, hooks, quality]
---

# common.sh calls lattice_log before it's defined

## Problem
`common.sh:29` calls `lattice_log` but function is defined at line 36. Produces "command not found" on stderr.

## Fix
Move lattice_log definition above the config validation block.

## Files
- `hooks/scripts/lib/common.sh`
