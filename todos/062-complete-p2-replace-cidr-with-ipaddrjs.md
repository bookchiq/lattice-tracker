---
status: complete
priority: p2
issue_id: "062"
tags: [code-review, security, optional-auth, simplification]
dependencies: [060]
---

## Problem Statement

`server/src/plugins/auth.js:12-56` hand-rolls IPv4-to-int, IPv4 CIDR matching, and IPv4-mapped IPv6 normalization (~45 LOC). The repo already pulls in `ipaddr.js` transitively via `@fastify/proxy-addr` (which Fastify 5 depends on). It ships `parseCIDR`, `IPv4.match`, IPv6 CIDR support, IPv4-mapped IPv6 normalization, and strict octet parsing.

Two real consequences of the hand-roll:
1. **No IPv6 CIDR support beyond `::1`** — `auth.js:36-37` hardcodes `::1` and silently rejects every other IPv6 CIDR an operator might put in `LATTICE_TRUSTED_CIDRS` (e.g., Tailscale's `fd7a:115c:a1e0::/48`).
2. **Non-canonical octet parsing** — see #060.

## Findings

- **Source:** pattern-recognition-specialist, security-sentinel (P2-5)
- **Files:** `server/src/plugins/auth.js:12-56`, `server/package.json:14-20`
- **Evidence:** `node_modules/ipaddr.js` already present.

## Proposed Solutions

### Option A: Promote `ipaddr.js` to direct dependency, replace hand-rolled code
```js
import ipaddr from 'ipaddr.js';

function isTrustedIp(ip, cidrs) {
  if (!ip) return false;
  let addr;
  try { addr = ipaddr.parse(ip); } catch { return false; }
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
  for (const cidr of cidrs) {
    try {
      const parsed = ipaddr.parseCIDR(cidr);
      if (addr.kind() === parsed[0].kind() && addr.match(parsed)) return true;
    } catch { /* skip malformed */ }
  }
  return false;
}
```
- Pros: -45 LOC; full IPv6 CIDR support; strict parsing handles #060; well-tested
- Cons: One direct dep; `parseCIDR` throws on bad input — needs try/catch (matches #059's "skip" semantics)
- Effort: Small

### Option B: Keep hand-roll, add IPv6 CIDR support manually
- Pros: No new dep
- Cons: Reinventing what's already installed; complexity grows
- Effort: Medium

## Acceptance Criteria

- [ ] `ipaddr.js` in `package.json` direct deps
- [ ] All existing `ipInCidr` / `isTrustedIp` tests pass
- [ ] New test: `LATTICE_TRUSTED_CIDRS=fd7a:115c:a1e0::/48` actually matches a Tailscale ULA address
- [ ] Hand-rolled `ipv4ToInt` / `normalizeIp` / `ipInCidr` removed
- [ ] If kept: `isTrustedIp` exported only if still used by tests (else delete)
