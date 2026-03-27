#!/bin/bash
# Lattice Tracker — Notification hook
# Fires when Claude Code sends a notification.
# Detects "waiting for input" notifications and emits session.waiting event.
# Fast path: no jq, no sourcing unless needed.
set -o pipefail

INPUT="$(cat)"

# Fast path: check if this is a waiting-for-input notification using bash string matching
# The notification_type field indicates what kind of notification this is
if [[ "$INPUT" != *'"idle_prompt"'* ]] && [[ "$INPUT" != *'"permission_prompt"'* ]]; then
  exit 0
fi

# Slow path: this looks like a waiting notification, do the full processing
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty')"
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

lattice_detect_project

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MESSAGE="$(echo "$INPUT" | jq -r '.message // empty')"

EVENT_JSON="$(jq -n \
  --arg session_id "$SESSION_ID" \
  --arg project_id "$LATTICE_PROJECT_ID" \
  --arg hostname "$LATTICE_HOSTNAME" \
  --arg timestamp "$TIMESTAMP" \
  --arg message "$MESSAGE" \
  '{
    event_type: "session.waiting",
    session_id: $session_id,
    project_id: $project_id,
    hostname: $hostname,
    timestamp: $timestamp,
    payload: { message: $message }
  }')"

lattice_emit "$EVENT_JSON"

exit 0
