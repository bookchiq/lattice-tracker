---
status: complete
priority: p3
issue_id: "084"
tags: [code-review, ux, validation]
dependencies: []
---

## Problem Statement

`server/src/services/event-processor.js:144` silently no-ops when `payload.text` is empty/whitespace, but the route returns 201. From the API caller's perspective, "I posted a note and got success but it didn't appear" — misleading.

The dashboard guards against this client-side (`if (!text) return;` in the submit handler), so the dashboard never sees the issue. Agents using the API directly can hit it.

## Findings

- **Source:** security-sentinel (UX, not security)
- **Files:** `server/src/services/event-processor.js:144-153`, `server/src/routes/events.js`

## Proposed Solutions

### Option A: Reject at the route layer for project.note specifically
- Add a check in `routes/events.js` (or a small per-event-type validator) that returns 400 when `event_type === 'project.note' && !payload.text?.trim()`
- Pros: Clear contract; agents get a meaningful error
- Cons: Tiny per-event-type branching
- Effort: Small

### Option B: Use JSON schema discriminator
- Extend the event schema to require `payload.text` (non-empty) when `event_type` is `project.note`
- Pros: Validation at framework level
- Cons: AJV discriminated unions are verbose; project may not have established this pattern
- Effort: Medium

### Option C: Document and leave as-is
- Comment in `event-processor.js` that empty notes are silently dropped
- Pros: Zero change
- Cons: Surprising for callers
- Effort: Trivial

## Acceptance Criteria

- [ ] Posting a `project.note` with empty/whitespace text returns 400 with a useful message
- [ ] Test asserts the 400 response
- [ ] Dashboard behavior unchanged (form already blocks empty submit)
