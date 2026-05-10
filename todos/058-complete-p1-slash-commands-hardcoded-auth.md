---
status: complete
priority: p1
issue_id: "058"
tags: [code-review, agent-native, slash-commands, optional-auth]
dependencies: []
---

## Problem Statement

The four slash commands hardcode `Authorization: Bearer ${LATTICE_API_TOKEN}` unconditionally. With the new optional-auth mode, an agent that installs hooks without a token (the supported state per `install-hooks.sh:43`) will have these commands send `Authorization: Bearer ` (empty) — the request currently *works* because the server skips token validation in disabled mode, but the slash commands give an agent no signal that the header is unnecessary, and the same commands fail loudly against any token-protected server when the token var is unset.

`hooks/scripts/lib/common.sh:39-54` already encodes the correct conditional — slash commands diverge from that pattern.

## Findings

- **Source:** agent-native-reviewer
- **Files:**
  - `commands/status.md:14`
  - `commands/where.md:14`
  - `commands/project.md:18,25,30`
  - `commands/tag.md:19,27`
- **Evidence:** every curl invocation hardcodes `-H "Authorization: Bearer ${LATTICE_API_TOKEN}"` without checking whether the token is set.

## Proposed Solutions

### Option A: Mirror common.sh's conditional pattern in each command
- `[ -n "$LATTICE_API_TOKEN" ] && AUTH=(-H "Authorization: Bearer $LATTICE_API_TOKEN") || AUTH=()`, then `curl "${AUTH[@]}" ...`
- Pros: Trivial, matches existing hook pattern
- Cons: Duplicated across four files
- Effort: Small
- Risk: None

### Option B: Source `common.sh` and reuse `LATTICE_CURL_AUTH_ARGS`
- Each command sources `~/.claude/hooks/lattice/lib/common.sh` and uses the shared array
- Pros: Single source of truth; commands automatically inherit future auth changes
- Cons: Couples slash commands to hook file layout
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] All four commands work when `LATTICE_API_TOKEN` is unset against an auth-disabled server
- [ ] All four commands work when `LATTICE_API_TOKEN` is set against a token-protected server
- [ ] No `Bearer ` (trailing-space) header sent when token is empty
