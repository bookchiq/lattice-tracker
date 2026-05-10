---
status: wontfix
priority: p3
issue_id: "088"
tags: [code-review, performance, abuse, future-proofing]
dependencies: []
---

## Resolution

Documented (Option B from todo) — see `docs/plans/lattice-spec.md` Security → Rate limiting subsection. Implementing per-route limits with a custom keyGenerator is over-engineering for a single-user instance; the spec note flags the trade-off so it can be addressed if/when multi-user lands.

## Problem Statement

`server/src/app.js:96-110` applies one 100/min rate-limit bucket across all `/api/*` requests. Hooks emit heartbeats every 3 minutes per active session; a busy dashboard polls projects + sessions + notes simultaneously. In theory hook traffic could starve a user typing notes (or vice versa) at scale.

For the current single-user deployment, the global cap of 100/min is generous and unlikely to be hit. Filing as P3 — relevant only if usage grows or multi-user lands.

## Findings

- **Source:** architecture-strategist (P2 → P3 for single-user reality)
- **File:** `server/src/app.js:96-110`

## Proposed Solutions

### Option A: Per-route rate-limit override on POST /api/events
- Fastify rate-limit supports per-route `max` and `keyGenerator`
- Cap notes (or any content-mutation endpoint) at e.g. 30/min/IP, leave heartbeats at 1000/min
- Pros: Isolates user actions from background telemetry
- Cons: More config; bucket-per-event-type is non-trivial to implement at the rate-limit layer (needs custom keyGenerator)
- Effort: Medium

### Option B: Leave as-is; document the shared bucket
- Pros: No change
- Cons: Theoretical starvation scenario
- Effort: None

## Acceptance Criteria

- [ ] Either implement per-route limits OR document the shared-bucket trade-off in the spec
