#!/bin/bash
# Lattice Tracker — PostToolUse hook
# Fires after Bash tool executions (filtered by matcher in hooks.json).
# Detects git commands and emits appropriate events.
# Marked async: true — does not block Claude Code.
set -o pipefail

# Read stdin without forking (bash builtin, not $(cat))
INPUT=""
while IFS= read -r line; do INPUT+="$line"; done

# Fast path: reject if input doesn't contain any git/gh command keyword
if [[ "$INPUT" != *'"git '* ]] && [[ "$INPUT" != *'"gh pr'* ]]; then
  exit 0
fi

# Extract the command via jq (acceptable latency since async: true)
COMMAND="$(echo "$INPUT" | jq -r '.tool_input.command // empty')"

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Determine event type and trigger from the command
EVENT_TYPE=""
TRIGGER=""
case "$COMMAND" in
  git\ commit*)                EVENT_TYPE="git.commit";        TRIGGER="commit" ;;
  git\ checkout*|git\ switch*) EVENT_TYPE="git.branch_switch"; TRIGGER="branch_switch" ;;
  gh\ pr\ create*)             EVENT_TYPE="git.pr_created";    TRIGGER="pr_created" ;;
  git\ push*)                  EVENT_TYPE="git.snapshot";      TRIGGER="push" ;;
  *)                           exit 0 ;;
esac

# Slow path: source libraries for git command processing
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/git-snapshot.sh"

read -r SESSION_ID CWD <<< "$(echo "$INPUT" | jq -r '[.session_id // "", .cwd // ""] | @tsv')"

if ! lattice_validate_session_id "$SESSION_ID"; then
  exit 0
fi

if [ -n "$CWD" ] && [ -d "$CWD" ]; then
  cd "$CWD" 2>/dev/null || true
fi

lattice_detect_project
lattice_capture_git_snapshot

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ "$EVENT_TYPE" = "git.snapshot" ]; then
  # Push: single snapshot event
  EVENT_JSON="$(jq -n \
    --arg session_id "$SESSION_ID" \
    --arg project_id "$LATTICE_PROJECT_ID" \
    --arg hostname "$LATTICE_HOSTNAME" \
    --arg timestamp "$TIMESTAMP" \
    --arg trigger "$TRIGGER" \
    --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
    '{
      event_type: "git.snapshot",
      session_id: $session_id,
      project_id: $project_id,
      hostname: $hostname,
      timestamp: $timestamp,
      payload: ($snapshot + {trigger_type: $trigger})
    }')"
  lattice_emit "$EVENT_JSON"
else
  # Commit/branch_switch/pr_created: specific event + snapshot
  BATCH_JSON="$(jq -n \
    --arg event_type "$EVENT_TYPE" \
    --arg session_id "$SESSION_ID" \
    --arg project_id "$LATTICE_PROJECT_ID" \
    --arg hostname "$LATTICE_HOSTNAME" \
    --arg timestamp "$TIMESTAMP" \
    --arg trigger "$TRIGGER" \
    --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
    '[
      {
        event_type: $event_type,
        session_id: $session_id,
        project_id: $project_id,
        hostname: $hostname,
        timestamp: $timestamp,
        payload: $snapshot
      },
      {
        event_type: "git.snapshot",
        session_id: $session_id,
        project_id: $project_id,
        hostname: $hostname,
        timestamp: $timestamp,
        payload: ($snapshot + {trigger_type: $trigger})
      }
    ]')"
  lattice_emit_batch "$BATCH_JSON"
fi

# Write checkpoint-suggested flag for stop.sh on PR creation
if [ "$TRIGGER" = "pr_created" ]; then
  mkdir -p ".lattice"
  echo "pr_created" > ".lattice/checkpoint-suggested"
fi

exit 0
