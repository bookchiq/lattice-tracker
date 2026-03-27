---
status: complete
priority: p2
issue_id: "044"
tags: [code-review, dashboard, ux]
---

## Problem Statement

The dashboard poller updates the "last updated" timestamp after both success and error, misleading users into thinking data was refreshed when it wasn't.

## Findings

- **Source:** JS quality reviewer
- **File:** `server/dashboard/app.js:134`
- **Evidence:** Line runs outside both try/catch blocks

## Proposed Solutions

- Move the timestamp update inside the try block after successful fetch
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] "Updated" timestamp only shows on successful fetches
