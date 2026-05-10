---
status: complete
priority: p2
issue_id: "080"
tags: [code-review, agent-native, api, discovery]
dependencies: []
---

## Problem Statement

`GET /api/config` enumerates `eventTypes` so an agent can discover what kinds of events exist, but does NOT enumerate the routes. An agent that knows `project.note` exists still has to read source to learn that `GET /api/projects/:id/notes` is the read side. The same gap applies to `/checkpoints`, `/sessions`, `/snapshots` — none of these are listed in the manifest.

This is small now (a handful of routes), but as endpoints grow, manual rediscovery via source-reading becomes the bottleneck.

## Findings

- **Source:** agent-native-reviewer (P2)
- **File:** `server/src/routes/config.js:18-27`

## Proposed Solutions

### Option A: Add an `endpoints` map to the manifest
```js
endpoints: {
  ingestion: '/api/events',
  projects: '/api/projects',
  projectDetail: '/api/projects/:id',
  projectSessions: '/api/projects/:id/sessions',
  projectCheckpoints: '/api/projects/:id/checkpoints',
  projectNotes: '/api/projects/:id/notes',
  sessions: '/api/sessions',
  sessionDetail: '/api/sessions/:id',
  snapshots: '/api/snapshots',
  health: '/api/health',
}
```
- Pros: One curl tells an agent the full surface
- Cons: Now the constant must be kept in sync with actual route registrations (similar to the event-types drift in #081)
- Effort: Small

### Option B: Generate at runtime from Fastify's route table
- `app.printRoutes()` or iterate `app.routes`
- Pros: Always accurate; no manual list to maintain
- Cons: Couples manifest to internal Fastify shape; less stable contract
- Effort: Small/Medium

### Option C: Don't add it; document existing routes in the spec only
- Pros: Zero code
- Cons: Doesn't solve discovery; agents have to read README/spec
- Effort: None

## Acceptance Criteria

- [ ] `/api/config` includes a structured way to discover at least the per-project sub-resources (`/api/projects/:id/{sessions,checkpoints,notes,snapshots}`)
- [ ] Test asserts the new field is present and has expected keys
- [ ] No accidental decorator pollution (only intentional fields exposed)
