---
status: complete
priority: p2
issue_id: "076"
tags: [code-review, security, dashboard, xss]
dependencies: []
---

## Problem Statement

`data-time="${ts}"` template literals in `server/dashboard/app.js` interpolate the server-stored timestamp string into an HTML attribute without escaping. Server schema (`server/src/routes/events.js:12`) caps `timestamp` at `maxLength: 30` but does not validate format. A 30-char string containing a `"` would break out of the attribute.

In practice today only the dashboard (`new Date().toISOString()`) and hooks write timestamps, so this is theoretical. But it's a two-line fix and worth doing.

## Findings

- **Source:** security-sentinel (P2)
- **Files:**
  - `server/dashboard/app.js:549` — session start time in detail view
  - `server/dashboard/app.js:684` — note timestamp in `renderNote`
  - `server/src/routes/events.js:12` — schema lacks `format: 'date-time'`

## Proposed Solutions

### Option A: Escape at render + validate at ingestion
- Two-line dashboard fix: `data-time="${escapeHtml(ts)}"` at both call sites
- Add `format: 'date-time'` to the `timestamp` property in `routes/events.js:12` (Fastify uses ajv-formats; verify it's registered)
- Pros: Defense in depth — render side is safe, ingestion rejects malformed
- Cons: None
- Effort: Small

### Option B: Render-side escape only
- Only fix the two dashboard call sites
- Pros: Minimal diff
- Cons: Server still accepts malformed timestamps
- Effort: Trivial

## Acceptance Criteria

- [ ] Both `data-time="..."` interpolations use `escapeHtml`
- [ ] (Option A) Server rejects POSTs with a non-date-time `timestamp` (verify ajv-formats integration)
- [ ] Manual test: post an event with `timestamp: 'a"><script>alert(1)</script>'` (≤30 chars) — confirm it's rejected at ingestion AND would be safely rendered if it slipped through
