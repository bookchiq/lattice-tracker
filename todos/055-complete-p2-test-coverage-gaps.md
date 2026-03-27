---
status: complete
priority: p2
issue_id: "055"
tags: [code-review, testing]
---

## Problem Statement

Roughly half the API surface is untested. Key gaps include: all GET /api/sessions routes, PATCH /api/projects, git event types (commit, branch_switch, pr_created), project.tag events, 404 responses, CORS, rate limiting, security headers, stale session cleanup, and the heartbeat hook.

## Findings

- **Source:** Test coverage reviewer
- **Key gaps:**
  - Routes: GET /api/sessions (list), GET /api/sessions/:id/events, PATCH /api/projects/:id, GET /api/projects/:id/sessions
  - Event types: git.commit, git.branch_switch, git.pr_created, project.tag, default branch (unknown type)
  - Cross-cutting: CORS, rate limiting, security headers, stale cleanup
  - Hooks: heartbeat.sh completely untested
  - Assertions: pagination clamping test doesn't verify actual clamping
  - Order-dependent tests in events.test.js

## Proposed Solutions

- Add ~20 tests covering the gaps above (see test reviewer report for prioritized list)
- Fix order-dependent tests by moving setup into `before()` hooks
- Fix config.test.js to restore all mutated env vars
- Effort: Large | Risk: Low

## Acceptance Criteria

- [ ] All API routes have at least one happy-path and one error-path test
- [ ] All event types have test coverage
- [ ] CORS and security headers verified
- [ ] Tests are order-independent
