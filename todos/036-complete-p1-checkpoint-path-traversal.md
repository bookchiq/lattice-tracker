---
status: complete
priority: p1
issue_id: "036"
tags: [code-review, security, hooks]
---

## Problem Statement

The checkpoint cache writes to `${CACHE_DIR}/${LATTICE_PROJECT_ID}.json` and the checkpoint fetch URL interpolates `LATTICE_PROJECT_ID` directly into a curl URL. While `..` sequences are rejected, the project ID could contain `/`, `?`, or `#` characters from adversarial git remote URLs, enabling path traversal on the filesystem or URL injection in curl calls.

## Findings

- **Source:** Security sentinel (H2, M5)
- **File:** `hooks/scripts/session-start.sh:116-117` (file path), `hooks/scripts/session-start.sh:109` (URL)
- **Evidence:** `sed` pipeline in `common.sh:95-97` replaces `/` with `:` via `tr`, but adversarial URLs could produce unexpected output

## Proposed Solutions

### Option A: Validate project ID against `/`, `?`, `#`, null bytes
- After computing LATTICE_PROJECT_ID, reject IDs containing these chars (hash fallback)
- Also URL-encode the project ID before use in curl URLs
- Pros: Defense in depth
- Cons: Minimal
- Effort: Small
- Risk: None

## Acceptance Criteria

- [ ] Project IDs containing `/`, `?`, `#`, or null bytes are rejected
- [ ] Curl URL uses URL-encoded project ID
- [ ] Test for adversarial git remote URLs
