---
status: complete
priority: p3
issue_id: "072"
tags: [code-review, tests, optional-auth]
dependencies: []
---

## Problem Statement

`server/test/helpers.js:18` passes `apiToken: opts.apiToken !== undefined ? opts.apiToken : TEST_TOKEN` through to `buildApp`. When a test calls `buildTestApp({ apiToken: null })` (as `auth.test.js:63` does), the override reaches `config.js:21`: `null ?? process.env.LATTICE_API_TOKEN`. Since `??` only triggers on null/undefined, the developer's real `LATTICE_API_TOKEN` from their shell env can leak into the test app.

Today this is harmless because `authDisabled: true` is also set, so the throw at `config.js:22` is skipped. But the test isn't actually verifying what it appears to verify.

## Findings

- **Source:** pattern-recognition-specialist
- **Files:** `server/test/helpers.js:18`, `server/src/plugins/config.js:21`, `server/test/auth.test.js:63`
- **Evidence:** `??` chains across the test→config boundary.

## Proposed Solutions

### Option A: Use `'in' overrides` checks instead of `??` chains
```js
// helpers.js
if ('apiToken' in opts) configOverrides.apiToken = opts.apiToken;

// config.js
const token = 'apiToken' in overrides ? overrides.apiToken : process.env.LATTICE_API_TOKEN;
```
- Pros: Explicit; an explicit `null` means null
- Cons: Slightly more verbose
- Effort: Small

### Option B: Test isolation — clear `process.env.LATTICE_API_TOKEN` in test setup
- Pros: Belt-and-suspenders for all tests
- Cons: Doesn't fix the underlying boundary fragility
- Effort: Trivial

## Acceptance Criteria

- [ ] `buildTestApp({ apiToken: null })` produces a config with `apiToken === null` regardless of shell env
- [ ] Test verifies this explicitly
