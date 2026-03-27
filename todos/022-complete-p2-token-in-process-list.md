---
status: complete
priority: p2
issue_id: "022"
tags: [code-review, hooks, security]
---

# API token exposed in process list via curl arguments

## Problem
`common.sh:50-57` — curl `-H "Authorization: Bearer $TOKEN"` is visible via `ps aux`.

## Fix
Pass header via stdin heredoc: `curl ... -H @- <<< "Authorization: Bearer ${LATTICE_API_TOKEN}"`

## Files
- `hooks/scripts/lib/common.sh`
- `hooks/scripts/session-start.sh` (checkpoint fetch curl)
