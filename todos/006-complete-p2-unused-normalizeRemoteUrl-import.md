---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, quality]
---

# Unused normalizeRemoteUrl import

## Problem
`event-processor.js:1` imports `normalizeRemoteUrl` from `project-resolver.js` but never calls it. Dead code that misleads readers.

## Fix
Remove the import. The client sends pre-normalized project IDs; server re-normalization can be added later if needed.

## Files
- `server/src/services/event-processor.js`
