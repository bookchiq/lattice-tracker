---
status: complete
priority: p2
issue_id: "042"
tags: [code-review, performance, hooks, security]
---

## Problem Statement

`common.sh` creates a temp file for the auth header on every source (mktemp + write + chmod = 3 syscalls + 1 fork). Also, `failed-events.log` is created without explicit permissions, potentially world-readable.

## Findings

- **Source:** Performance oracle, security sentinel (L6)
- **File:** `hooks/scripts/lib/common.sh:36-38` (temp file), `common.sh:62` (failed-events.log)

## Proposed Solutions

- Use a fixed path `${LATTICE_CONFIG_DIR}/.auth-header` written once with chmod 600, reused by all hooks
- Set permissions on `failed-events.log` when appending
- Effort: Small | Risk: Low

## Acceptance Criteria

- [ ] Auth header file created once, reused across hook invocations
- [ ] failed-events.log has 600 permissions
