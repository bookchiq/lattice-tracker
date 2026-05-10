---
status: complete
priority: p2
issue_id: "061"
tags: [code-review, security, optional-auth, configuration]
dependencies: []
---

## Problem Statement

The default `DEFAULT_TRUSTED_CIDRS` includes all of RFC1918 (`10/8`, `172.16/12`, `192.168/16`) plus loopback and Tailscale CGNAT. The PR description and README say "Tailscale, LAN" — but on a Tailscale-only deployment, RFC1918 is unreachable so it's harmless, and on a host with a second NIC (corporate VLAN, Docker bridge, hotel WiFi) operators get bypass for free without realizing it.

## Findings

- **Source:** security-sentinel, code-simplicity-reviewer
- **File:** `server/src/plugins/config.js:3-10`
- **Evidence:** Default list is broader than the documented use case requires.

## Proposed Solutions

### Option A: Narrow defaults to loopback + Tailscale only
```js
const DEFAULT_TRUSTED_CIDRS = [
  '127.0.0.0/8',     // IPv4 loopback
  '::1/128',         // IPv6 loopback
  '100.64.0.0/10',   // Tailscale CGNAT
];
```
- Operators who want LAN access set `LATTICE_TRUSTED_CIDRS=127.0.0.0/8,10.0.0.0/8,...` explicitly
- Pros: Smallest blast radius by default; matches documented use case
- Cons: One-line config change for LAN users (worth it)
- Effort: Small

### Option B: Keep defaults, expand README warning
- Pros: No behavior change for current users
- Cons: Documentation alone rarely catches operators
- Effort: Trivial

## Acceptance Criteria

- [ ] Default trust list is loopback + Tailscale only
- [ ] README documents the change and shows how to opt into RFC1918
- [ ] Startup banner already enumerates the actual trusted CIDRs (verify)
