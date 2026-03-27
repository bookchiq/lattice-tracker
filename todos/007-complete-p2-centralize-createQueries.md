---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, architecture]
---

# createQueries called 3 times in route files

## Problem
Each route file (events.js, projects.js, sessions.js) independently calls `createQueries(fastify.db)`, creating 3 sets of prepared statements. Violates DRY.

## Fix
Create queries once in `db.js` plugin: `fastify.decorate('queries', createQueries(db))`. Routes use `fastify.queries`.

## Files
- `server/src/plugins/db.js`
- `server/src/routes/events.js`
- `server/src/routes/projects.js`
- `server/src/routes/sessions.js`
