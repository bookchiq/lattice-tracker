---
status: complete
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

- [x] `commands/status.md` column header reworded
- [x] Other slash commands using the same phrasing updated (none needed — see Work Log)
- [x] Dashboard column label updated if necessary (none needed — see Work Log)
- [ ] PR #13 description optionally updated to note the wording change

## Resources

- PR #13: https://github.com/bookchiq/lattice-tracker/pull/13
- Reviewer: agent-native-reviewer

## Work Log

**2026-05-13 — resolved on branch `fix/project-activity-skip-heartbeats` (PR #13)**

Audited every slash command in `commands/` and the dashboard for user-facing copy
that referred to the old `last_activity_at` semantics (i.e. "any event arrived").

### Changed

- `commands/status.md:25` — column description for the project list:
  - Before: `- Last activity (relative time)`
  - After:  `- Last work (relative time of the most recent real-work event — not heartbeats)`
  - Rationale: "Last work" matches the new field semantics from PR #13. The
    parenthetical makes the new contract explicit so a model rendering the
    table won't surprise users with a "6h ago" reading for an open session
    that's been idly heartbeating.

### Considered but not changed

- `commands/project.md` — does not mention activity/last seen anywhere in
  user-facing copy. Output items are project name/tag, git state, latest
  checkpoint, and recent session history (with their own session-level status).
  Nothing to reword.
- `commands/where.md` — talks only about sessions ("currently active and
  waiting-for-input sessions", "How long the session has been running").
  These reference session-level status and `started_at`, not project
  `last_activity_at`. Out of scope per the instructions ("DO NOT change
  anything related to session-level 'active' / 'idle'").
- `commands/note.md`, `commands/tag.md` — no activity-related phrasing.
- `commands/checkpoint.md` — file does not exist in this repo.
- `server/dashboard/index.html` — the only relevant reference is
  `<span data-field="activity"></span>` (line 103), which is a template
  selector, not user-facing text. No visible "Last activity" label exists
  next to the value in the project card; the rendered cell is just the
  relative-time string (e.g. "2h ago"). Renaming the selector would be a
  non-user-facing refactor and is out of scope for a wording fix.
- `server/dashboard/app.js` (lines 308-310) — same: `data-field="activity"`
  is an internal selector. The cell content (`timeAgo(...)`) and its
  semantics are unchanged. No user-visible label needs updating.
- All session-level "Active" / "Idle" / "Waiting" status badge copy
  (`statusLabel`, `badgeClass`, `getProjectStatus`) — explicitly out of
  scope: these describe live session status, which is unaffected by the
  `last_activity_at` semantic change in PR #13.

### Files touched

- `commands/status.md`
- `todos/092-pending-p2-status-command-wording.md` → renamed to
  `todos/092-complete-p2-status-command-wording.md`; frontmatter
  `status: pending` → `status: complete`; Work Log added.

Caller is batching commits — no commit created here.
