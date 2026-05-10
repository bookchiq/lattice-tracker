---
status: complete
priority: p2
issue_id: "059"
tags: [code-review, security, optional-auth, auth]
dependencies: []
---

## Problem Statement

`ipInCidr` parses the prefix length without validating bounds. A typo in `LATTICE_TRUSTED_CIDRS` like `192.168.0.0/200` silently widens the trust ring instead of failing. JS `<<` operates mod 32, so `0xFFFFFFFF << (32-200)` becomes `<< 24` — yielding a `/8` mask. `/-1` becomes `/31`. Operators get no signal.

## Findings

- **Source:** security-sentinel
- **File:** `server/src/plugins/auth.js:34, 43-46`
- **Evidence:** `parseInt(cidr.slice(slashIdx + 1), 10)` returns NaN/negative/large values without check; subsequent shift wraps silently.

## Proposed Solutions

### Option A: Validate bounds at request time and return false on bad input
```js
if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
```
- Pros: Defensive; minimal change
- Cons: Bad CIDRs in env silently never match — operator finds out only when their requests get 401'd
- Effort: Small

### Option B: Validate at config load and throw if any CIDR is malformed
- In `config.js`, parse and validate all `trustedCidrs` once at startup; throw with clear error message
- Pros: Fail loud at boot, not at request time
- Cons: Hard restart requirement on bad config
- Effort: Small

### Option C: Both
- Throw at boot, also defend at request time
- Pros: Belt + suspenders
- Effort: Small

## Acceptance Criteria

- [ ] `LATTICE_TRUSTED_CIDRS=10.0.0.0/200` causes a startup error or never matches at request time (not silently widens)
- [ ] Test covers malformed prefix: out-of-range, negative, non-integer
- [ ] Documented behavior in README
