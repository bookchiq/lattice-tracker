---
status: complete
priority: p2
issue_id: "027"
tags: [code-review, hooks, performance]
---

# common.sh sed pipeline: 10 forks for project detection

## Problem
`common.sh:96-105` — 6 sed + 2 tr + echo = 10 forks for normalizing git remote URL.

## Fix
Collapse into single sed with combined expressions + single tr (3 forks total).

## Files
- `hooks/scripts/lib/common.sh`
