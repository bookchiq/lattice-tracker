---
status: complete
priority: p2
issue_id: "077"
tags: [code-review, dashboard, ux, performance]
dependencies: []
---

## Problem Statement

After a successful rename (PATCH /api/projects/:id), the dashboard rebuilds the entire detail view via `innerHTML` assignment in `renderProjectDetail`. This wipes ALL DOM state inside the detail view, including:

- A note draft the user was typing in the note textarea
- Scroll position
- Focus
- Any selected text

If the user is mid-thought (e.g., started typing a note while reaching to click "Save" on the rename form), their text is lost without warning. Real footgun even at single-user scale.

## Findings

- **Source:** performance-oracle, architecture-strategist, code-simplicity-reviewer
- **File:** `server/dashboard/app.js:610-622` (rename submit handler triggers full re-render)
- **Mechanism:** `renderProjectDetail` wholesale `innerHTML = html` at line ~560

## Proposed Solutions

### Option A: Surgical update — only patch what changed
- After rename success, update only `.detail-title` text content + the tag badge (or remove it if cleared)
- Don't re-fetch sessions/notes; they didn't change
- Pros: Preserves all DOM state; saves 2 round-trips
- Cons: A bit more imperative DOM code
- Effort: Small (~15 min)

### Option B: Stash + restore note textarea content
- Before re-render: read `noteText.value`; after re-render: write it back
- Pros: Minimal diff; preserves the user's draft
- Cons: Doesn't solve scroll/focus loss, and adds a coupling between rename and notes code
- Effort: Trivial

### Option C: Just call `showProjectDetail(project.id)` instead of duplicating the Promise.all
- Removes 6 lines of duplication (also flagged by simplicity reviewer)
- Doesn't fix the state-loss problem on its own
- Pros: Simplification win even if state loss isn't the priority
- Cons: Same state-loss issue persists

## Acceptance Criteria

- [ ] Type "draft note" in the note textarea, then click Edit → Save (with no changes). Verify the draft is still there afterwards.
- [ ] Same test with: scroll down to the session list → click Edit → Save → still scrolled to where you were.
- [ ] (Option A or B) — both approaches need explicit test coverage of the textarea-preservation case.
