# Lattice Checkpoint

Write a checkpoint summary for the current session. This helps future sessions
(possibly on a different machine) pick up where you left off.

## Steps

1. Write a checkpoint JSON file to `.lattice/last-checkpoint.json`:

```json
{
  "timestamp": "<ISO 8601>",
  "summary": "<2-3 sentences: what you were working on and current state>",
  "in_progress": "<what's actively being worked on, if anything>",
  "blocked_on": "<what's blocking progress, if anything — null if nothing>",
  "next_steps": "<what would logically come next>",
  "trigger": "manual",
  "branch": "<current git branch>",
  "last_commit": "<short hash + message of HEAD>"
}
```

2. POST the checkpoint to the Lattice API. First, source the config:

```bash
source ~/.config/lattice/config.env
```

Then POST:

```bash
curl -s -X POST "${LATTICE_API_URL}/api/events" \
  -H "Authorization: Bearer ${LATTICE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg sid "${CLAUDE_SESSION_ID}" \
    --slurpfile cp .lattice/last-checkpoint.json \
    '{event_type: "session.checkpoint", session_id: $sid, timestamp: (now | todate), project_id: "", payload: $cp[0]}')"
```

## Guidelines

- Be specific: "Implementing SSO token refresh for INCOSE iMIS integration"
  not "Working on SSO stuff"
- Include names: plugin names, function names, file paths that would help
  someone (or a future Claude session) orient quickly
- If there are uncommitted changes, mention what they contain
- Keep it concise — this is a signpost, not documentation
