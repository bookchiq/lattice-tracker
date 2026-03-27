---
status: complete
priority: p3
issue_id: "053"
tags: [code-review, performance, hooks]
---

## Problem Statement

`heartbeat.sh` calls jq 3 times per session file to extract fields, then calls jq again to append to the events array. For N sessions, this is 4N jq forks. A single jq call could process all files.

## Proposed Solutions

- Extract all fields in one `jq -r '[.ppid, .ppid_start_time, .project_id] | @tsv'` call per file
- Or use `jq -s` to read all session files at once
- Effort: Small | Risk: Low

## Acceptance Criteria

- [ ] Reduced fork count in heartbeat loop
