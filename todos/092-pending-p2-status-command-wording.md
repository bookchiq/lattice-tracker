---
status: pending
priority: p2
issue_id: "092"
tags: [code-review, agent-native, documentation, slash-commands]
dependencies: []
---

## Problem Statement

The `/lattice:status` slash command (`commands/status.md:25`) describes its `last_activity_at` column as "Last activity (relative time)." After PR #13, that field now means "last real work" — not "last anything." An open Claude session breathing for 6 hours with no commits will now render as "6h ago" instead of "just now," which is correct but may surprise users still reading the column header as "last anything."

Flagged by **agent-native-reviewer (P1)**.

## Findings

- The behavior is intentional and correct.
- The wording in the slash command is stale.
- The dashboard column may have similar wording — confirm in `server/dashboard/app.js` / `server/dashboard/index.html`.

## Proposed Solutions

**Option A: Rename to "Last work" or "Last real activity" (recommended)**
- Pros: Honest; matches the new semantics.
- Cons: Trivial wording bikeshed.
- Effort: Small.

**Option B: Leave as "Last activity" but add a footnote / hover tooltip**
- Pros: No copy churn.
- Cons: Doesn't fix the surprise; tooltips are easy to miss.

## Recommended Action

Option A.

## Technical Details

- **Affected files:**
  - `commands/status.md` — line ~25 ("Last activity")
  - Possibly `commands/project.md`, `commands/where.md` — grep for the same phrasing
  - Dashboard column label (if any): `server/dashboard/app.js` and/or `server/dashboard/index.html`
- **No code change** — pure documentation/UX.

## Acceptance Criteria

- [ ] `commands/status.md` column header reworded
- [ ] Other slash commands using the same phrasing updated
- [ ] Dashboard column label updated if necessary
- [ ] PR #13 description optionally updated to note the wording change

## Resources

- PR #13: https://github.com/bookchiq/lattice-tracker/pull/13
- Reviewer: agent-native-reviewer
