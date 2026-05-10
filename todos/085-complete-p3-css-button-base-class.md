---
status: complete
priority: p3
issue_id: "085"
tags: [code-review, css, dashboard, simplification]
dependencies: []
---

## Problem Statement

`server/dashboard/style.css` has at least five button styles with overlapping rules:
- `.btn-back` (lines 520-538)
- `.btn-logout` (lines ~194-212)
- `.btn-edit-project` (new, ~lines 565-580)
- `.edit-project-actions button` + `.edit-project-actions .btn-primary` (new)
- `.note-form .btn-primary` (new)

All share: `font-family: var(--font-body)`, `font-size: var(--text-xs)`, `font-weight: 500`, `text-transform: uppercase`, `letter-spacing: 0.08em`, `min-height: 44px`, `border-radius: var(--radius)`, `cursor: pointer`. The next button added will copy the third instance, and the smell hardens.

## Findings

- **Source:** pattern-recognition-specialist (P3), code-simplicity-reviewer (P2)
- **File:** `server/dashboard/style.css` (multiple sections)

## Proposed Solutions

### Option A: Extract a `.btn` base + `.btn--primary` modifier (BEM-ish)
- `.btn` carries shared typography/sizing/cursor
- `.btn--primary` adds accent fill
- Existing buttons get the `.btn` class added in JS/HTML
- Pros: ~40 lines of CSS removed; future buttons are one class
- Cons: Audit existing buttons across the project list, project detail, auth screen — touch-once, not zero touch
- Effort: Small (~30 min)

### Option B: Use a CSS custom property bundle and reference it
- `:root { --btn-base: ... }` then `button { all: ... }`
- Pros: No HTML changes
- Cons: Less idiomatic; CSS lacks @apply natively
- Effort: Medium

### Option C: Leave as-is
- Pros: No change
- Cons: Drift compounds with each new button
- Effort: None

## Acceptance Criteria

- [ ] Single declaration of the shared button typography/sizing rules
- [ ] All existing buttons render visually unchanged
- [ ] Manual: light + dark modes; hover states; focus-visible
