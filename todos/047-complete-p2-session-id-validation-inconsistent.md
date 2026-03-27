---
status: complete
priority: p2
issue_id: "047"
tags: [code-review, security, hooks]
---

## Problem Statement

`session-start.sh` and `session-end.sh` validate session IDs against `^[a-zA-Z0-9_-]+$`, but `notification.sh` and `post-tool-use.sh` do not. Inconsistency invites future bugs.

## Findings

- **Source:** Security sentinel (L1)
- **Files:** `hooks/scripts/notification.sh:21`, `hooks/scripts/post-tool-use.sh:38`

## Proposed Solutions

- Extract session ID validation into a `lattice_validate_session_id` function in `common.sh`
- Call from all scripts that use session IDs
- Effort: Small | Risk: None

## Acceptance Criteria

- [ ] All hook scripts validate session IDs consistently
- [ ] Validation logic is in one place (common.sh)
