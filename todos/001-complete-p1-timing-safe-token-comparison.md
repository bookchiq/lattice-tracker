---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security]
---

# Timing-attack vulnerable token comparison

## Problem
`auth.js:15` uses `token !== fastify.config.apiToken` which short-circuits on first character mismatch. An attacker can perform a timing side-channel attack to discover the token character-by-character.

## Fix
Use `crypto.timingSafeEqual()` with Buffer comparison. Handle length mismatch separately.

## Files
- `server/src/plugins/auth.js`
