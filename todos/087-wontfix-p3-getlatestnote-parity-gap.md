---
status: wontfix
priority: p3
issue_id: "087"
tags: [code-review, pattern, future-proofing]
dependencies: []
---

## Resolution

Deferred — no concrete UI need yet. Adding `getLatestNote` would be dead code until "latest note preview on project list cards" becomes a real requirement. Revisit when that UX is concrete; the symmetric query is a 4-line addition then.

## Problem Statement

`server/src/db/queries.js` exposes `getLatestCheckpoint` and `getLatestSnapshot`, both consumed by `routes/projects.js`'s `?include=latest` to surface a one-line preview on the project list cards. Notes have no `getLatestNote` equivalent.

If you ever want a "latest note" preview on the project list (very plausible given the feature's framing — "fresh in mind" notes are exactly the kind of thing you'd want at-a-glance from the dashboard home), the symmetry is missing.

## Findings

- **Source:** pattern-recognition-specialist (P3)
- **File:** `server/src/db/queries.js:307-344`

## Proposed Solutions

### Option A: Add `getLatestNote` now; surface on project cards
- New query: `SELECT * FROM notes WHERE project_id = ? ORDER BY timestamp DESC LIMIT 1`
- Add to the `?include=latest` projection in `routes/projects.js:14-21`
- Render a truncated preview on each project card
- Pros: Closes the asymmetry; nice UX for the new feature
- Cons: Scope creep beyond the original two PRs
- Effort: Medium

### Option B: Add the query only; defer the UI
- Just `getLatestNote` exists in queries.js; not yet consumed
- Pros: Symmetric API surface; no UI churn
- Cons: Dead code until consumed
- Effort: Trivial

### Option C: Leave as-is; revisit when the UX need is concrete
- Pros: Smallest change
- Cons: Inconsistency in the queries module
- Effort: None

## Acceptance Criteria

- [ ] Decision recorded; if A or B, query function added with the same signature pattern as `getLatestCheckpoint`
