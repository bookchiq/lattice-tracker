---
status: complete
priority: p3
issue_id: "052"
tags: [code-review, quality]
---

## Problem Statement

Health endpoint hardcodes `version: '0.1.0'` instead of reading from `package.json`. Will drift.

## Proposed Solutions

- Read version from `package.json` via `createRequire` or config plugin
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] Version in health response matches package.json
