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

  # Extract all fields in one jq call (avoids 3N forks)
  IFS=$'\t' read -r local_ppid local_ppid_start_time local_project_id <<< "$(jq -r '[.ppid // "", .ppid_start_time // "", .project_id // ""] | @tsv' "$session_file")"

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

# --- Drain failed events (retry on heartbeat) ---
FAILED_LOG="${LATTICE_CONFIG_DIR}/failed-events.log"
if [ -f "$FAILED_LOG" ] && [ -s "$FAILED_LOG" ]; then
  LOCK_FILE="${LATTICE_CONFIG_DIR}/.drain.lock"
  if mkdir "$LOCK_FILE" 2>/dev/null; then
    TEMP_FAILED="$(mktemp "${FAILED_LOG}.tmp.XXXXXX")"
    mv "$FAILED_LOG" "$TEMP_FAILED" 2>/dev/null

    MAX_RETRIES=20
    RETRY_COUNT=0
    while IFS= read -r line; do
      if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
        echo "$line" >> "$FAILED_LOG"
        continue
      fi

      http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 3 \
        --connect-timeout 2 \
        -X POST \
        -H @"$LATTICE_AUTH_HEADER_FILE" \
        -H "Content-Type: application/json" \
        -d "$line" \
        "${LATTICE_API_URL}/api/events" 2>/dev/null)

      if [ "$http_code" != "201" ] && [ "$http_code" != "409" ]; then
        echo "$line" >> "$FAILED_LOG"
      fi
      RETRY_COUNT=$((RETRY_COUNT + 1))
    done < "$TEMP_FAILED"

    rm -f "$TEMP_FAILED" 2>/dev/null
    rmdir "$LOCK_FILE" 2>/dev/null
  fi
fi

exit 0
