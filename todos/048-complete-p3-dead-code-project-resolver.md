---
status: complete
priority: p3
issue_id: "048"
tags: [code-review, quality, dead-code]
---

## Problem Statement

`server/src/services/project-resolver.js` exports `normalizeRemoteUrl` but it is never imported in production code. Only referenced by its own test file. The same normalization logic lives in the bash hook `common.sh`.

## Proposed Solutions

- Delete `project-resolver.js` and `test/project-resolver.test.js`
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] Dead file removed
- [ ] Tests still pass
