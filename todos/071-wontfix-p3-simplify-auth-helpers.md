---
status: wontfix
priority: p3
issue_id: "071"
tags: [code-review, simplification, optional-auth]
dependencies: [062]
---

## Resolution

Most items here referenced helpers (`normalizeIp`, `ipInCidr`, `isTrustedIp` named exports, the test-only `describe('CIDR helpers')` block) that were entirely deleted by the 062 resolution. The remaining items (inline `parseBool`, drop two restate-the-code comments) are pure style with no behavior impact and don't justify a separate change.

## Problem Statement

Several small simplifications collected from the simplicity reviewer. None individually critical; bundle for a single sweep. **Only relevant if #062 (replace with ipaddr.js) is NOT taken** — that change moots most of these.

## Findings

- **Source:** code-simplicity-reviewer
- **Files:** `server/src/plugins/{auth,config}.js`, `server/dashboard/app.js`

## Items

1. **`parseBool` is single-use; inline it.** `config.js:12-14` is called exactly once at line 19. Replace with `process.env.LATTICE_AUTH_DISABLED === 'true'`. Three accepted spellings (`true|1|yes`) is gold-plating an internal env var.

2. **`normalizeIp` is tiny and used twice in one file; inline it.** `auth.js:25-29`. The IPv4-mapped strip is two lines at the call site of `isTrustedIp`. The "early return on null" branch only ever fires for `null`/`undefined` — which `request.ip` won't produce.

3. **Drop test-only named exports.** `auth.js:104` exports `isTrustedIp, ipInCidr` solely for the "CIDR helpers" describe block. The integration tests at `auth.test.js:76-94` already exercise both functions through the real request path. Delete the unit-test block and the named exports.

4. **Comment at `auth.js:36`** ("we already normalize ::ffff:127.* to IPv4") restates what the previous function does. Drop.

5. **Comment at `auth.js:70`** ("Untrusted IP — log loud warning once per IP") restates the next 8 lines. Drop (especially if #064 also lands).

## Proposed Solutions

Apply the relevant items in a single small commit. Skip 1, 2, 3 if #062 is taken (it deletes the affected code).

## Acceptance Criteria

- [ ] LOC reduction visible in diff (~15-25 lines)
- [ ] All tests still pass
- [ ] No behavior change
