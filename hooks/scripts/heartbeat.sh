#!/bin/bash
# Lattice Tracker — Heartbeat script
# Run by launchd every 3 minutes.
# Scans active sessions, verifies PIDs, emits heartbeat or session.end events.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

ACTIVE_SESSIONS_DIR="${LATTICE_CONFIG_DIR}/active-sessions"

if [ ! -d "$ACTIVE_SESSIONS_DIR" ]; then
  exit 0
fi

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EVENTS="[]"
HAS_EVENTS=0

for session_file in "${ACTIVE_SESSIONS_DIR}"/*.json; do
  # Skip if no files match the glob
  [ -f "$session_file" ] || continue

  local_session_id="$(basename "$session_file" .json)"
  local_ppid="$(jq -r '.ppid // empty' "$session_file")"
  local_ppid_start_time="$(jq -r '.ppid_start_time // empty' "$session_file")"
  local_project_id="$(jq -r '.project_id // empty' "$session_file")"

  if [ -z "$local_ppid" ]; then
    # No PID stored — can't verify, skip
    continue
  fi

  IS_ALIVE=false

  # Check if PID is still running
  if kill -0 "$local_ppid" 2>/dev/null; then
    # PID exists — verify it's the same process (not a reused PID)
    if [ -n "$local_ppid_start_time" ]; then
      current_start="$(ps -p "$local_ppid" -o lstart= 2>/dev/null)" || current_start=""
      if [ "$current_start" = "$local_ppid_start_time" ]; then
        IS_ALIVE=true
      fi
    else
      # No start time to compare — trust the PID check
      IS_ALIVE=true
    fi
  fi

  if [ "$IS_ALIVE" = true ]; then
    # Session is alive — add heartbeat event
    EVENTS="$(echo "$EVENTS" | jq \
      --arg session_id "$local_session_id" \
      --arg project_id "$local_project_id" \
      --arg hostname "$LATTICE_HOSTNAME" \
      --arg timestamp "$TIMESTAMP" \
      '. + [{
        event_type: "session.heartbeat",
        session_id: $session_id,
        project_id: $project_id,
        hostname: $hostname,
        timestamp: $timestamp,
        payload: { status: "active" }
      }]')"
    HAS_EVENTS=1
  else
    # Session is dead or PID was reused — add session.end event
    EVENTS="$(echo "$EVENTS" | jq \
      --arg session_id "$local_session_id" \
      --arg project_id "$local_project_id" \
      --arg hostname "$LATTICE_HOSTNAME" \
      --arg timestamp "$TIMESTAMP" \
      '. + [{
        event_type: "session.end",
        session_id: $session_id,
        project_id: $project_id,
        hostname: $hostname,
        timestamp: $timestamp,
        payload: { reason: "process_disappeared" }
      }]')"
    HAS_EVENTS=1

    # Remove the stale session file
    rm -f "$session_file" 2>/dev/null
    lattice_log "Session ${local_session_id} marked abandoned (process gone)"
  fi
done

# Send all events in a single batch
if [ "$HAS_EVENTS" = 1 ]; then
  lattice_emit_batch "$EVENTS"
fi

exit 0
