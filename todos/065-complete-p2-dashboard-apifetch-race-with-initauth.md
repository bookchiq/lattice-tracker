---
status: complete
priority: p2
issue_id: "065"
tags: [code-review, dashboard, race-condition, optional-auth]
dependencies: []
---

## Problem Statement

`server/dashboard/app.js:6` declares `let authRequired = true` (default fail-closed). It is mutated only after the async `fetch('/api/config')` in `initAuth` resolves. While `initAuth` is in flight, any concurrent `apiFetch` would read `authRequired === true`, fail to find a token, and bounce to the login screen — even on a no-auth deployment.

Today this is safe by accident: nothing fetches before `initAuth` calls `showApp()`. But the contract is implicit and a future poller, `setInterval`, or refactor will trip it.

## Findings

- **Source:** architecture-strategist (P1-1)
- **File:** `server/dashboard/app.js:6, 19-48, 52-77`
- **Evidence:** Module global mutated by async function with no synchronization.

## Proposed Solutions

### Option A: Store the initAuth promise and await it in apiFetch
```js
let authReady = initAuth();  // start immediately
async function apiFetch(path) {
  await authReady;
  // ... existing logic
}
```
- Pros: Eliminates race; minimal change
- Cons: Every apiFetch awaits the same resolved promise (cheap but verbose)
- Effort: Small

### Option B: Inline `authRequired` into `index.html` via a server-rendered `<script>` tag
- Server renders `<script>window.__LATTICE_AUTH_REQUIRED__ = false;</script>` based on config
- Pros: Eliminates round-trip and race; faster first paint
- Cons: Requires touching the static-file serving (templating); harder when dashboard is purely static
- Effort: Medium

### Option C: Make showApp itself the gate
- Move the `apiFetch` call sites behind a `getAuthMode()` accessor that returns the resolved value
- Pros: Explicit
- Cons: Touches more sites
- Effort: Small/Medium

## Acceptance Criteria

- [ ] Concurrent apiFetch calls during initAuth do not bounce to login on auth-disabled deployments
- [ ] Test or manual repro of the race (mock slow /api/config, fire apiFetch immediately)
