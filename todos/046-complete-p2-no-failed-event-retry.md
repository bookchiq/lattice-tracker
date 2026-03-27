---
status: complete
priority: p2
issue_id: "046"
tags: [code-review, reliability, hooks]
---

## Problem Statement

Hook events that fail due to network issues are logged to `failed-events.log` but never retried. Network blips cause permanent data loss in the event stream.

## Findings

- **Source:** Architecture strategist
- **File:** `hooks/scripts/lib/common.sh:62`

## Proposed Solutions

- Add a drain loop to `heartbeat.sh`: check `failed-events.log`, re-POST events, clear on success
- Effort: Medium | Risk: Low

## Acceptance Criteria

- [ ] Failed events are retried on next heartbeat cycle
- [ ] Successfully retried events are removed from the log
- [ ] Retry has a max count to avoid infinite loops on permanently bad events
