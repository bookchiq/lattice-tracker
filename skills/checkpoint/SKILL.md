# Lattice Checkpoint

Write a checkpoint summary for the current session. This helps future sessions
(possibly on a different machine) pick up where you left off.

## How

POST a `session.checkpoint` event to the Lattice API in a single bash command —
no intermediate file write. Source the config, build a conditional auth args
array (server may run with auth disabled — token may be empty), and pass each
field as a `--arg` so the JSON is constructed once by jq:

```bash
source ~/.config/lattice/config.env
[ -n "$LATTICE_API_TOKEN" ] && AUTH_ARGS=(-H "Authorization: Bearer $LATTICE_API_TOKEN") || AUTH_ARGS=()

curl -s -X POST "${AUTH_ARGS[@]}" \
  -H "Content-Type: application/json" \
  "${LATTICE_API_URL}/api/events" \
  -d "$(jq -n \
    --arg sid "${CLAUDE_SESSION_ID}" \
    --arg ts  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg summary     "<2-3 sentences: what you were working on and current state>" \
    --arg in_progress "<what's actively being worked on, if anything>" \
    --arg blocked_on  "<what's blocking, or empty string if nothing>" \
    --arg next_steps  "<what would logically come next>" \
    --arg branch      "<current git branch>" \
    --arg last_commit "<short hash + message of HEAD>" \
    --arg trigger     "manual" \
    '{event_type:"session.checkpoint", session_id:$sid, timestamp:$ts,
      payload:{summary:$summary, in_progress:$in_progress, blocked_on:$blocked_on,
               next_steps:$next_steps, trigger_type:$trigger,
               branch:$branch, last_commit:$last_commit}}')"
```

Expected response: `{"ok":true,"event_id":<n>}`. Confirm with a one-line note
mentioning the event id, then continue.

## Guidelines

- Be specific: "Implementing SSO token refresh for INCOSE iMIS integration",
  not "Working on SSO stuff"
- Include names: plugin names, function names, file paths that help someone
  (or a future Claude session) orient quickly
- If there are uncommitted changes, mention what they contain
- Keep each field concise — this is a signpost, not documentation
- Don't write `.lattice/last-checkpoint.json` first. The session-start hook
  reads checkpoints from the API (with a per-machine cache fallback at
  `~/.config/lattice/last-checkpoint/<project>.json`), never from a project
  file. Skipping the file write removes a noisy diff from the terminal.
