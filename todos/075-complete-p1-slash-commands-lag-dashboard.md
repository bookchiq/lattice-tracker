---
status: complete
priority: p1
issue_id: "075"
tags: [code-review, agent-native, slash-commands, notes]
dependencies: []
---

## Problem Statement

The dashboard now has two capabilities (rename project, add note) without matching slash commands. Per `CLAUDE.md`: "Agent-native parity: Everything in the dashboard must be queryable via API. Slash commands are just curl + jq compositions."

**Gaps:**
1. `commands/tag.md` only PATCHes `client_tag`. There's no command for `display_name` — the only way to rename from a Claude Code session is hand-crafted curl.
2. There's no command for posting a `project.note` event. The endpoint and `/api/config` manifest entry exist; the convenience wrapper does not.

Both capabilities are fully API-accessible, so the architectural promise is kept — but the slash-command surface is now strictly behind the UI.

## Findings

- **Source:** agent-native-reviewer (both P1)
- **Files:** `commands/tag.md:34` (sends only client_tag), `commands/` (missing rename + note files)

## Proposed Solutions

### Option A: Two new files — `commands/rename.md` + `commands/note.md`
- Mirror the existing `commands/*.md` patterns (source config, build AUTH_ARGS, curl, jq)
- Pros: Discoverable per-action; matches the per-command convention
- Cons: Two files to maintain
- Effort: Small (~30 min)

### Option B: Extend `commands/tag.md` to take `--name` and add `commands/note.md`
- One existing command grows; one new one added
- Pros: Slightly fewer files
- Cons: Bash flag parsing in a slash command is awkward; mixes two concerns
- Effort: Small

## Acceptance Criteria

- [ ] `/lattice:rename <project> <name>` (or equivalent) sets display_name from a Claude Code session
- [ ] `/lattice:note <project> <text>` (or equivalent) posts a `project.note` event
- [ ] Both commands use the conditional `AUTH_ARGS` pattern (work with or without `LATTICE_API_TOKEN`)
- [ ] Both commands send a real `hostname` (not `'dashboard'`) — see #079
