---
status: wontfix
priority: p2
issue_id: "060"
tags: [code-review, security, optional-auth, auth]
dependencies: []
---

## Resolution

Subsumed by todo 062 (replace hand-rolled CIDR with ipaddr.js). The new `isTrustedIp` uses `ipaddr.parse()`, which strictly rejects non-canonical octet forms (`0x0A`, `1e2`, leading zeros, etc.). The hand-rolled `ipv4ToInt` helper was deleted in the resolution of 062, so there is no remaining surface to harden.

## Problem Statement

`ipv4ToInt` uses `Number(p)` which accepts non-canonical octet forms: `"0x0A"` → 10, `"1e2"` → 100, `"+10"`, leading whitespace, `"010"` → 10. All pass `Number.isInteger`. In practice, Node canonicalizes `request.ip` so an attacker can't inject these over the wire — but the helper is exported (`auth.js:104`) and could be reused; tests using these forms would silently agree with broken inputs.

## Findings

- **Source:** security-sentinel
- **File:** `server/src/plugins/auth.js:12-22`
- **Evidence:** `const o = Number(p); if (!Number.isInteger(o) ...)` — `Number('0x0A')` is integer.

## Proposed Solutions

### Option A: Strict regex on each octet before parsing
```js
if (!/^(0|[1-9]\d*)$/.test(p)) return null;
```
- Pros: One line, no perf impact
- Cons: None
- Effort: Small

### Option B: Adopt `ipaddr.js` (see #062) and delete this helper
- Pros: Battle-tested parser handles all edge cases
- Cons: New dependency promotion (already transitive)
- Effort: Small (covered by 062)

## Acceptance Criteria

- [ ] `ipv4ToInt('0x0A.0.0.1')` returns null
- [ ] `ipv4ToInt('1e2.0.0.1')` returns null
- [ ] `ipv4ToInt(' 10.0.0.1')` returns null
- [ ] `ipv4ToInt('010.0.0.1')` returns null
- [ ] Existing valid IPs still parse correctly
