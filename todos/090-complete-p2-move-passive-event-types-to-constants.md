---
status: complete
priority: p2
issue_id: "090"
tags: [code-review, architecture, constants]
dependencies: []
---

## Problem Statement

PR #13 declares `PASSIVE_EVENT_TYPES = new Set([...])` as a module-local constant in `server/src/services/event-processor.js:5-9`. However, `server/src/constants/event-types.js` already exists as the documented single source of truth for the event-type vocabulary — its header comment says "Adding a new event type? Update this list, then add a matching case in `services/event-processor.js`." Defining a parallel categorization in a different file undermines that contract.

This was flagged by **architecture-strategist (P1)** and **code-simplicity-reviewer (P1)**.

## Findings

`server/src/constants/event-types.js` already exports `EVENT_TYPES` (array) and `EVENT_TYPE_SET` (Set), consumed by `routes/config.js` (the `/api/config` discovery manifest) and the test suite. The "passive vs. real-work" distinction is metadata about event types — it belongs with the type declaration, not buried in the processor.

A future contributor adding `session.idle` (or similar) currently has to:
1. Update `constants/event-types.js`
2. Update the switch in `event-processor.js` (already documented)
3. Remember to also update `PASSIVE_EVENT_TYPES` in `event-processor.js` if applicable (not documented)

Step 3 is the trap.

## Proposed Solutions

**Option A: Move PASSIVE_EVENT_TYPES into constants/event-types.js (recommended)**

```js
// server/src/constants/event-types.js
export const PASSIVE_EVENT_TYPES = new Set([
  'session.heartbeat',
  'session.waiting',
  'session.end',
]);
```

Import in `event-processor.js`:

```js
import { PASSIVE_EVENT_TYPES } from '../constants/event-types.js';
```

- Pros: Single file for event-type taxonomy; the categorization is discoverable next to the type list.
- Cons: One extra import line.
- Effort: Small.

**Option B: Keep PASSIVE_EVENT_TYPES in event-processor.js but add a cross-reference comment in constants/event-types.js**
- Pros: Avoids cross-file lookups.
- Cons: Doesn't actually solve the discoverability problem.

## Recommended Action

Option A.

## Technical Details

- **Affected files:**
  - `server/src/constants/event-types.js` — add `PASSIVE_EVENT_TYPES` export
  - `server/src/services/event-processor.js` — replace module-local Set with import

## Acceptance Criteria

- [ ] `PASSIVE_EVENT_TYPES` exported from `server/src/constants/event-types.js`
- [ ] `server/src/services/event-processor.js` imports the constant
- [ ] All existing tests pass
- [ ] Consider also exporting `ACTIVITY_BUMPING_EVENT_TYPES` (the complement) for symmetry — only if a use case appears

## Resources

- PR #13: https://github.com/bookchiq/lattice-tracker/pull/13
- Existing constants module: `server/src/constants/event-types.js`
- Related todo (closed): #081 (event-types-constants-module establishing this pattern)
