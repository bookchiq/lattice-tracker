---
status: complete
priority: p3
issue_id: "094"
tags: [code-review, style, comments]
dependencies: ["090"]
---

## Problem Statement

The block comment above `PASSIVE_EVENT_TYPES` in `server/src/services/event-processor.js:1-9` is denser than anything else in the file. The repo's CLAUDE.md style preference is terse comments. The Set name and the constants-file home (per todo #090) tell most of the story; the comment is largely restating it.

Flagged by **pattern-recognition-specialist (P3)** and **code-simplicity-reviewer (P2)**.

## Findings

Current comment (4 lines):
```js
// Passive lifecycle events: they keep a session alive but don't represent
// new work on the project, so they must not bump projects.last_activity_at.
// Heartbeats in particular fire every 3 minutes for every open session,
// which would otherwise make every open project look "just updated."
```

The non-obvious *why* is "heartbeats fire every 3 minutes." The rest is restating the variable name.

## Proposed Solutions

**Option A: Trim to one line (recommended)**

```js
// Heartbeats fire every 3 minutes per session — don't let that bump last_activity_at.
const PASSIVE_EVENT_TYPES = new Set([...]);
```

- Pros: Matches the file's existing comment density (see lines 35-37 for comparison).
- Cons: Loses a smidgen of context that a careful reader might still want.

**Option B: Keep as-is**

- Pros: Maximum context.
- Cons: Inconsistent with surrounding code.

## Recommended Action

Option A. Cheap to apply alongside todo #090 (which moves the constant out of this file entirely — at which point the comment also moves and should be trimmed there).

## Technical Details

- **Affected files:**
  - `server/src/services/event-processor.js:1-9` (or `server/src/constants/event-types.js` after #090 lands)

## Acceptance Criteria

- [ ] Block comment trimmed to one line
- [ ] Tests still pass

## Resources

- PR #13: https://github.com/bookchiq/lattice-tracker/pull/13
- Reviewers: pattern-recognition-specialist, code-simplicity-reviewer
- Depends on #090 (move to constants file)
