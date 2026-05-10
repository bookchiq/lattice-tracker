---
status: complete
priority: p2
issue_id: "064"
tags: [code-review, performance, security, optional-auth, simplification]
dependencies: []
---

## Problem Statement

`auth.js:59` defines `const warnedIps = new Set()` to dedupe untrusted-IP warning logs. The Set grows unboundedly: a public-IP scanner against an accidentally-exposed instance (precisely the misconfiguration this code exists to surface) inserts one entry per source IP, never evicts, and can OOM a small VPS over days. Once warned, repeated abuse from the same IP is silent — partially defeating the purpose.

Three reviewers flagged this independently (architecture, performance, simplicity).

## Findings

- **Source:** architecture-strategist, performance-oracle, code-simplicity-reviewer
- **File:** `server/src/plugins/auth.js:59, 71-78`
- **Evidence:** `Set` with no eviction; no upper bound.

## Proposed Solutions

### Option A: Drop the dedup; let Fastify's logger and rate-limiter handle volume
- Just `fastify.log.warn(...)` unconditionally on every untrusted request
- Rate-limit (100/min/IP, `app.js:96-97`) bounds log volume
- Pros: -10 lines; no state; simpler
- Cons: Slightly more log volume (bounded by rate-limit)
- Effort: Small

### Option B: Bound the Set
```js
const WARNED_IPS_MAX = 1024;
if (warnedIps.size >= WARNED_IPS_MAX) warnedIps.clear();
warnedIps.add(ip);
```
- Pros: Keeps dedup semantics
- Cons: Adds 5 lines, magic number
- Effort: Small

### Option C: Time-bucketed Map (LRU)
- Pros: Most "correct"
- Cons: Complexity not justified for a warning log
- Effort: Small/Medium

## Acceptance Criteria

- [ ] Memory does not grow unboundedly under sustained scan from many distinct IPs
- [ ] Operator still sees a warning per untrusted IP class (not necessarily per IP)
- [ ] Test simulates 10k distinct rejected IPs without leaking memory (or just verifies the cap/clear behavior)
