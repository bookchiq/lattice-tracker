---
status: complete
priority: p3
issue_id: "054"
tags: [code-review, performance, dashboard]
---

## Problem Statement

`escapeHtml()` creates and discards a DOM element on every call. Called 15+ times in `renderProjectDetail`.

## Proposed Solutions

- Replace with string replacement: `str.replace(/[&<>"']/g, c => ({'&':'&amp;',...})[c])`
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] No DOM element creation for HTML escaping
