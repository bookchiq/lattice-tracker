---
status: pending
priority: p3
issue_id: "017"
tags: [code-review, performance]
---

# Missing compound indexes for common query patterns

## Fix
Add to schema.sql:
- `idx_events_session_timestamp ON events(session_id, timestamp DESC)`
- `idx_git_snapshots_project_timestamp ON git_snapshots(project_id, timestamp DESC)`
- `idx_projects_client_tag ON projects(client_tag)`

## Files
- `server/src/db/schema.sql`
