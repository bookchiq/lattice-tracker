---
status: complete
priority: p2
issue_id: "067"
tags: [code-review, architecture, optional-auth]
dependencies: []
---

## Problem Statement

`auth.js:62-64` hardcodes the skip list as URL-prefix matches:
```js
if ((request.url === '/api/health' || request.url.startsWith('/api/health?')) ...) return;
if ((request.url === '/api/config' || request.url.startsWith('/api/config?')) ...) return;
```

Each new public endpoint requires editing `auth.js`. The query-string-tolerant matching also re-implements URL parsing. The list will eventually rot when someone adds a new public route and forgets to update auth.

## Findings

- **Source:** pattern-recognition-specialist, code-simplicity-reviewer (P1.4)
- **File:** `server/src/plugins/auth.js:62-64`
- **Evidence:** Skip-list grew from 1 → 2 entries in this PR; will grow more.

## Proposed Solutions

### Option A: Move public routes outside the protected `/api` register
- In `app.js`, register healthRoutes and configRoutes *before* (or outside of) the inner register that loads authPlugin
- Pros: Auth plugin no longer cares about specific paths; structure encodes the policy
- Cons: Two registers; rate-limit scoping changes (verify it still applies)
- Effort: Small/Medium

### Option B: Use Fastify route options to mark routes as public
- `fastify.get('/config', { config: { auth: false } }, handler)`; auth plugin reads `request.routeOptions.config.auth`
- Pros: Per-route declaration; no central list
- Cons: Adds a layer of indirection
- Effort: Small

### Option C: Drop query-string tolerance, use exact path equality on `request.routerPath`
- `if (request.routerPath === '/api/health') return;`
- Pros: Fastify normalizes query strings out of routerPath; one comparison per skip
- Cons: Still a central list (but smaller)
- Effort: Trivial

## Acceptance Criteria

- [ ] Adding a new public route doesn't require editing `auth.js`
- [ ] OR (cheaper): the central list uses Fastify's normalized router path (no string `startsWith` for query strings)
- [ ] Existing tests pass; new test for a new public route added without auth.js changes
