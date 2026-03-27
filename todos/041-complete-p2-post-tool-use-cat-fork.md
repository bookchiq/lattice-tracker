---
status: complete
priority: p2
issue_id: "041"
tags: [code-review, performance, hooks]
---

## Problem Statement

`post-tool-use.sh` uses `$(cat)` to read stdin, forking a subprocess on every Bash tool use (~5-10ms). The `stop.sh` script already uses the correct builtin `while IFS= read` pattern.

## Findings

- **Source:** Performance oracle
- **File:** `hooks/scripts/post-tool-use.sh:8`

## Proposed Solutions

- Replace `INPUT="$(cat)"` with `INPUT=""; while IFS= read -r line; do INPUT+="$line"; done`
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] No subprocess fork for reading stdin in post-tool-use.sh
- [ ] Fast path still works correctly
