---
status: complete
priority: p3
issue_id: "013"
tags: [code-review, security]
---

# Default bind to 0.0.0.0 exposes to network

## Fix
Default to `127.0.0.1`, make configurable via `LATTICE_HOST` env var.

## Files
- `server/src/plugins/config.js`
- `server/src/index.js`
