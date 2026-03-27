---
status: complete
priority: p2
issue_id: "039"
tags: [code-review, quality, refactor]
---

## Problem Statement

`clampInt` and `clampOffset` are copy-pasted identically in `routes/projects.js` and `routes/sessions.js`. Drift risk and unnecessary duplication.

## Findings

- **Source:** JS quality reviewer, code simplicity reviewer, architecture strategist
- **Files:** `server/src/routes/projects.js:1-9`, `server/src/routes/sessions.js:1-9`

## Proposed Solutions

- Extract to `server/src/utils/pagination.js`, import in both route files
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] Single source of truth for pagination utilities
- [ ] Both route files import from shared module
