#!/bin/bash
# Lattice Tracker — SessionEnd hook
# Fires when a Claude Code session ends.
# Emits session.end + git.snapshot, removes active-session file.
set -o pipefail

INPUT="$(cat)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/git-snapshot.sh"

# Extract fields (single jq call)
read -r SESSION_ID CWD <<< "$(echo "$INPUT" | jq -r '[.session_id // "", .cwd // ""] | @tsv')"

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

if ! lattice_validate_session_id "$SESSION_ID"; then
  exit 0
fi

# Change to project directory if provided
if [ -n "$CWD" ] && [ -d "$CWD" ]; then
  cd "$CWD" 2>/dev/null || true
fi

# Detect project and capture git state
lattice_detect_project
lattice_capture_git_snapshot

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Build and emit batch: session.end + git.snapshot
BATCH_JSON="$(jq -n \
  --arg session_id "$SESSION_ID" \
  --arg project_id "$LATTICE_PROJECT_ID" \
  --arg hostname "$LATTICE_HOSTNAME" \
  --arg timestamp "$TIMESTAMP" \
  --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
  '[
    {
      event_type: "session.end",
      session_id: $session_id,
      project_id: $project_id,
      hostname: $hostname,
      timestamp: $timestamp,
      payload: {}
    },
    {
      event_type: "git.snapshot",
      session_id: $session_id,
      project_id: $project_id,
      hostname: $hostname,
      timestamp: $timestamp,
      payload: ($snapshot + {trigger_type: "session_end"})
    }
  ]')"

lattice_emit_batch "$BATCH_JSON"

# Remove active-session file
rm -f "${LATTICE_CONFIG_DIR}/active-sessions/${SESSION_ID}.json" 2>/dev/null

exit 0
