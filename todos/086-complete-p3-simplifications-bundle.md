---
status: complete
priority: p3
issue_id: "086"
tags: [code-review, simplification]
dependencies: []
---

## Problem Statement

A handful of small, low-risk simplifications collected from the simplicity reviewer. Bundle into one cleanup commit.

## Items

1. **Comments that restate code** — `server/src/services/event-processor.js:141-142` (the `project.note` case header comment). Drop both lines; the condition right below is self-explanatory.

2. **Test #2 loop is overkill** — `server/test/notes.test.js:55-71` POSTs three times for `['', '   ', '\n\t']`. One iteration with `' '` is enough; `.trim().length > 0` is one branch. Drop ~15 lines.

3. **Test #5 is duplicate** — `server/test/notes.test.js:118-122` asserts `/api/config` exposes `project.note`. `server/test/routes-config.test.js:48` already asserts the exact list. Delete from notes.test.js.

4. **`fallbackName` const used once** — `server/dashboard/app.js:438` defines `fallbackName = project.canonical_name || project.id`; used once on line 451 as the placeholder. Inline.

5. **`session_id || null` duplicated at two layers** — `server/src/db/queries.js:329` already does `|| null`; the call site at `server/src/services/event-processor.js:147` does the same. Drop from the call site (closer-to-storage layer wins).

6. **`renderNote` inlinable if #078 (drop optimistic prepend) lands** — currently called at two sites; if optimistic goes away it collapses to one. Worth folding into `renderProjectDetail` if so. Conditional on #078.

7. **`empty-state-inline` cleanup branch goes away if #078 lands** — `app.js:666-667` queries for the empty-state to clear it. Refetch-based approach removes this concern.

## Findings

- **Source:** code-simplicity-reviewer (P1/P3 mix)

## Acceptance Criteria

- [ ] Items 1, 2, 3, 4, 5 applied (independent of other todos)
- [ ] Items 6, 7 applied iff #078 is taken
- [ ] All tests still pass
- [ ] No behavior change
