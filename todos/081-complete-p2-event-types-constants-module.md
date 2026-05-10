---
status: complete
priority: p2
issue_id: "081"
tags: [code-review, architecture, pattern, drift-prevention]
dependencies: []
---

## Problem Statement

Adding `project.note` required hand-edits in four separate places that have no enforced relationship:

1. `server/src/services/event-processor.js:141` — case in the dispatch switch
2. `server/src/routes/config.js:5-17` — `EVENT_TYPES` array exposed via `/api/config`
3. `server/src/routes/events.js:5-7` — generic event schema (no specific check)
4. `server/test/routes-config.test.js:37-49` — expected list assertion
5. `server/dashboard/app.js:648` — magic string `'project.note'` in the form submit

Nothing fails if an event is handled but missing from `eventTypes`, or vice versa — they're maintained in lockstep manually. The event-types listing is documentation-as-data; the dispatcher is logic. They can drift silently.

## Findings

- **Source:** pattern-recognition-specialist (P2)
- **Evidence:** Adding `project.note` and `project.tag` (in earlier history) both required parallel edits

## Proposed Solutions

### Option A: Single constants module
- Create `server/src/constants/event-types.js` exporting:
  ```js
  export const EVENT_TYPES = [...];
  export const EVENT_TYPE_SET = new Set(EVENT_TYPES);
  ```
- Import in `routes/config.js` (manifest), `routes/events.js` (could validate type membership at ingestion), `event-processor.js` (could assert the switch is exhaustive in dev), and tests
- Pros: One source of truth; one place to add new types
- Cons: Tiny indirection
- Effort: Small

### Option B: Co-locate the constant in event-processor.js since that's the dispatcher
- Export `KNOWN_EVENT_TYPES` from event-processor; route imports it
- Pros: Closest to the source of truth (the switch)
- Cons: Mixes constant and logic in one file
- Effort: Trivial

### Option C: Leave as-is; accept manual sync overhead
- Pros: No new file
- Cons: Two-times-now pattern of parallel edits will become three-times, etc.
- Effort: None

## Acceptance Criteria

- [ ] Single source of truth for the event-type list
- [ ] `routes/config.js`, tests, and at least one validation site (events ingestion or processor) all import from it
- [ ] Adding a new event type requires editing one constant + one switch case (and the implementing test) — not four files
