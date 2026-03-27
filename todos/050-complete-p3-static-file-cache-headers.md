---
status: complete
priority: p3
issue_id: "050"
tags: [code-review, performance, dashboard]
---

## Problem Statement

Static dashboard files (JS, CSS, HTML) are served without `Cache-Control` headers, forcing the browser to revalidate on every request.

## Proposed Solutions

- Add `maxAge: '1h'` to the `@fastify/static` registration
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] Static assets include Cache-Control headers
