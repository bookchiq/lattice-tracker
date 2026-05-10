---
status: complete
priority: p2
issue_id: "063"
tags: [code-review, security, optional-auth, hardening]
dependencies: []
---

## Problem Statement

The startup banner warns operators when `LATTICE_AUTH_DISABLED=true`, but does not enforce a safe bind. If an operator combines `LATTICE_AUTH_DISABLED=true` with `LATTICE_HOST=0.0.0.0` on a host with a public NIC, the warning is a single buried JSON log line and easily missed. The CIDR check still rejects untrusted IPs at request time, but the surface is unnecessarily exposed.

The security reviewer flagged this as the single most impactful hardening in this PR.

## Findings

- **Source:** security-sentinel (P2-6)
- **Files:** `server/src/app.js:59-66`, `server/src/plugins/config.js:44`
- **Evidence:** No coupling between `authDisabled` and bind-host validation.

## Proposed Solutions

### Option A: Refuse to start when authDisabled && host is 0.0.0.0
- In `config.js`, after computing both: `if (authDisabled && (host === '0.0.0.0' || host === '::')) throw new Error('LATTICE_AUTH_DISABLED=true with LATTICE_HOST=0.0.0.0 — set LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND=true to override');`
- Pros: Safe by default; operators who genuinely want this must opt in explicitly
- Cons: Breaks any current setup that combines them (none documented)
- Effort: Small

### Option B: Print a stderr warning + delay startup by 5s
- Pros: Hard to miss; doesn't refuse to start
- Cons: Still misses operators who only check stdout/journal
- Effort: Small

### Option C: Document only; do nothing
- Pros: Zero change
- Cons: Banner already does this; clearly insufficient for the most-impactful hardening
- Effort: None

## Acceptance Criteria

- [ ] Server refuses to start when `authDisabled && host in ('0.0.0.0', '::')` unless explicit override env is set
- [ ] Error message names the override
- [ ] Test covers both the rejection and the override-allows-start cases
- [ ] README documents the override and warns against using it
