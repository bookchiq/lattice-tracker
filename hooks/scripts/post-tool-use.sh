#!/bin/bash
# Lattice Tracker — PostToolUse hook
# Fires after Bash tool executions (filtered by matcher in hooks.json).
# Detects git commands and emits appropriate events.
# Marked async: true — does not block Claude Code.
set -o pipefail

INPUT="$(cat)"

# Extract the command — jq is acceptable here since async: true
COMMAND="$(echo "$INPUT" | jq -r '.tool_input.command // empty')"

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Fast path: only care about git/gh commands
case "$COMMAND" in
  git\ commit*|git\ checkout*|git\ switch*|gh\ pr\ create*|git\ push*)
    ;; # fall through to processing
  *)
    exit 0
    ;;
esac

# Slow path: source libraries for git command processing
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/git-snapshot.sh"

SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty')"
CWD="$(echo "$INPUT" | jq -r '.cwd // empty')"

if [ -n "$CWD" ]; then
  cd "$CWD" 2>/dev/null || true
fi

lattice_detect_project
lattice_capture_git_snapshot

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

case "$COMMAND" in
  git\ commit*)
    BATCH_JSON="$(jq -n \
      --arg session_id "$SESSION_ID" \
      --arg project_id "$LATTICE_PROJECT_ID" \
      --arg hostname "$LATTICE_HOSTNAME" \
      --arg timestamp "$TIMESTAMP" \
      --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
      '[
        {
          event_type: "git.commit",
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
          payload: ($snapshot + {trigger_type: "commit"})
        }
      ]')"
    lattice_emit_batch "$BATCH_JSON"
    ;;

  git\ checkout*|git\ switch*)
    BATCH_JSON="$(jq -n \
      --arg session_id "$SESSION_ID" \
      --arg project_id "$LATTICE_PROJECT_ID" \
      --arg hostname "$LATTICE_HOSTNAME" \
      --arg timestamp "$TIMESTAMP" \
      --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
      '[
        {
          event_type: "git.branch_switch",
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
          payload: ($snapshot + {trigger_type: "branch_switch"})
        }
      ]')"
    lattice_emit_batch "$BATCH_JSON"

    ;;

  gh\ pr\ create*)
    BATCH_JSON="$(jq -n \
      --arg session_id "$SESSION_ID" \
      --arg project_id "$LATTICE_PROJECT_ID" \
      --arg hostname "$LATTICE_HOSTNAME" \
      --arg timestamp "$TIMESTAMP" \
      --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
      '[
        {
          event_type: "git.pr_created",
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
          payload: ($snapshot + {trigger_type: "pr_created"})
        }
      ]')"
    lattice_emit_batch "$BATCH_JSON"

    # Write checkpoint-suggested flag for the stop hook
    mkdir -p ".lattice"
    echo "pr_created" > ".lattice/checkpoint-suggested"
    ;;

  git\ push*)
    EVENT_JSON="$(jq -n \
      --arg session_id "$SESSION_ID" \
      --arg project_id "$LATTICE_PROJECT_ID" \
      --arg hostname "$LATTICE_HOSTNAME" \
      --arg timestamp "$TIMESTAMP" \
      --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
      '{
        event_type: "git.snapshot",
        session_id: $session_id,
        project_id: $project_id,
        hostname: $hostname,
        timestamp: $timestamp,
        payload: ($snapshot + {trigger_type: "push"})
      }')"
    lattice_emit "$EVENT_JSON"
    ;;
esac

exit 0
