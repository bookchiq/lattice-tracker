---
status: complete
priority: p3
issue_id: "051"
tags: [code-review, performance, dashboard]
---

## Problem Statement

`renderSessionList` rebuilds all DOM nodes from scratch every 15-second poll, unlike `renderProjectList` which reconciles existing elements by ID.

## Proposed Solutions

- Apply the same reconciliation pattern: maintain a Map of existing elements by session ID, update in place
- Effort: Small | Risk: Low

## Acceptance Criteria

- [ ] Session list DOM is reconciled, not rebuilt
