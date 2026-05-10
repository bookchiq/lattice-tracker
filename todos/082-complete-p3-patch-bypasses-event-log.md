---
status: complete
priority: p3
issue_id: "082"
tags: [code-review, architecture, agent-native, audit-trail]
dependencies: []
---

## Problem Statement

`PATCH /api/projects/:id` (used by the new dashboard rename UI) writes `display_name` and `client_tag` directly to the projects table without emitting an event. But `docs/plans/lattice-spec.md:205` defines `project.tag` event payload as `{client_tag, display_name}` — implying renames SHOULD be auditable through the append-only event log.

So the spec promises event-sourced audit; the implementation has a non-event mutation path. Either is defensible — but they currently disagree.

## Findings

- **Source:** agent-native-reviewer (P3)
- **Files:** `server/src/routes/projects.js:81-88`, `docs/plans/lattice-spec.md:205`

## Proposed Solutions

### Option A: Have the PATCH handler emit a `project.tag` event
- Inside the PATCH handler, after the update succeeds, also call `processEvent` with a `project.tag` event capturing the new values
- Pros: Restores audit trail; matches spec
- Cons: Slight perf cost; event-processor's `project.tag` case currently calls `updateProject`, so we'd need to avoid an infinite loop (suppress the dispatch when the event was synthesized from PATCH, or have updateProject be idempotent enough that re-applying is safe)
- Effort: Small

### Option B: Update the spec to acknowledge PATCH as a non-event mutation path
- Document that some project mutations bypass the event log; rename is one
- Pros: No code change
- Cons: Erodes the event-sourced architecture promise
- Effort: Trivial

### Option C: Deprecate PATCH and require renames to come through `/api/events` with `project.tag`
- Dashboard sends a `project.tag` event instead of PATCHing
- Pros: Single ingestion path
- Cons: Breaking change; PATCH is the standard REST shape
- Effort: Medium

## Acceptance Criteria

- [ ] Pick a direction (A, B, or C)
- [ ] Either: every rename produces an `events` row OR the spec explicitly carves out PATCH as a non-event mutation
- [ ] Whichever path: documented in `docs/plans/lattice-spec.md`
