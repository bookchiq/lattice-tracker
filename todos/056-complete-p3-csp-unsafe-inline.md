---
status: complete
priority: p3
issue_id: "056"
tags: [code-review, security, dashboard]
---

## Problem Statement

CSP includes `'unsafe-inline'` in `style-src` because `renderProjectDetail` uses inline style attributes. This weakens CSS injection protection.

## Proposed Solutions

- Move inline styles to the stylesheet, remove `'unsafe-inline'` from style-src
- Effort: Small | Risk: None

## Acceptance Criteria

- [ ] No inline styles in dashboard JS
- [ ] CSP style-src uses only 'self'
