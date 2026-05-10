---
status: complete
priority: p2
issue_id: "078"
tags: [code-review, dashboard, architecture, simplification]
dependencies: []
---

## Problem Statement

The 4096-char note cap is duplicated in 4 places:
- `server/src/services/event-processor.js:150` — server truncates to 4096
- `server/dashboard/app.js:523` — textarea `maxlength="4096"`
- `server/dashboard/app.js:631` — counter `0 / 4096`
- `server/dashboard/app.js:657` — optimistic `text.slice(0, 4096)`

The optimistic prepend at `app.js:660-668` synthesizes a fake note row to render immediately, mirroring the server cap. If the cap ever changes server-side without updating the client (or vice versa), the optimistic UI will disagree with what's actually stored.

## Findings

- **Source:** architecture-strategist, code-simplicity-reviewer
- **Files:** see above

## Proposed Solutions

### Option A: Drop the optimistic prepend; just refetch (simpler)
- Replace the synthesized newNote + insertAdjacentHTML with a refetch of `/api/projects/:id/notes` and a re-render of the notes list
- Pros: Single source of truth (server). One fewer place to keep in sync. Removes ~10 lines.
- Cons: One extra round-trip per note submit (~50ms on Tailscale; imperceptible).
- Effort: Trivial

### Option B: Expose `noteMaxChars` via /api/config; client reads it once at boot
- Manifest gains `noteMaxChars: 4096`; dashboard templates the textarea/counter/slice from it
- Pros: Single source of truth (server config); future bumps are server-only
- Cons: Extra plumbing for a value that rarely changes
- Effort: Small

### Option C: Keep both, accept duplication; add a comment
- Pros: No code change
- Cons: Drift waiting to happen
- Effort: None

## Recommended

**Option A is best**. It also resolves the `hostname: 'dashboard'` lie that gets duplicated when the refetch eventually runs (since the optimistic row asserts a hostname the server may or may not have stored).

## Acceptance Criteria

- [ ] (Option A) Note submit refetches and re-renders the notes list; no client-side synthesis of note rows
- [ ] If kept (Options B or C): the 4 places stay numerically in sync, with a one-line comment in each pointing to a single owner
