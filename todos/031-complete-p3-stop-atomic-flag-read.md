---
status: complete
priority: p3
issue_id: "031"
tags: [code-review, hooks, reliability]
---

# stop.sh: race condition in flag file read/delete

## Fix
Use atomic mv-then-read: `mv` flag to temp, read temp, delete temp.

## Files
- `hooks/scripts/stop.sh`
