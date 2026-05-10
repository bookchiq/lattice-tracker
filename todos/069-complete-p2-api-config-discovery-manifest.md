---
status: complete
priority: p2
issue_id: "069"
tags: [code-review, agent-native, api, optional-auth]
dependencies: []
---

## Problem Statement

`GET /api/config` returns only `{authRequired}`. An agent landing cold on a Lattice instance still cannot discover: server version, supported event types, accepted event schema, rate-limit window, or trusted-CIDR posture. The endpoint should be a self-describing manifest — the agent equivalent of the dashboard's bootstrap fetch.

## Findings

- **Source:** agent-native-reviewer (P2)
- **File:** `server/src/routes/config.js:2-4`
- **Evidence:** Single-field response.

## Proposed Solutions

### Option A: Extend to a discovery manifest
```js
{
  authRequired: bool,
  version: '0.1.0',                        // from package.json
  eventTypes: [ 'session.start', ... ],    // from a constant
  rateLimit: { max: 100, windowSeconds: 60 },
  endpoints: { events: '/api/events', projects: '/api/projects', ... }
}
```
- Pros: One unauth call gives an agent everything it needs to interact safely
- Cons: Larger surface; every field is now public-readable; need to maintain
- Effort: Small

### Option B: Add only `version` for now
- Smallest useful extension
- Pros: Minimal commitment
- Cons: Punts the agent-discovery question
- Effort: Trivial

### Option C: Leave as-is, document in README
- Pros: No code change
- Cons: Doesn't solve the discovery problem
- Effort: None

## Acceptance Criteria

- [ ] `/api/config` includes at least `{authRequired, version}`
- [ ] Any field added is intentionally public (no accidental decorator pollution — verify with a test that exhaustively checks the response keys)
- [ ] Documented in README API reference
