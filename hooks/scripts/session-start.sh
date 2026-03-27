#!/bin/bash
# Lattice Tracker — SessionStart hook
# Fires when a new Claude Code session begins.
# Emits session.start + git.snapshot, injects last checkpoint as context.
set -o pipefail

INPUT="$(cat)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/git-snapshot.sh"

# Extract fields from stdin JSON
SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty')"
CWD="$(echo "$INPUT" | jq -r '.cwd // empty')"

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Change to the working directory if provided
if [ -n "$CWD" ]; then
  cd "$CWD" 2>/dev/null || true
fi

# Detect project
lattice_detect_project

# Detect interface (inline — 5 lines)
if [ -n "${VSCODE_PID:-}" ] || [ -n "${VSCODE_INJECTION:-}" ]; then
  INTERFACE="vscode"
elif [ -n "${TERM_PROGRAM:-}" ]; then
  INTERFACE="$TERM_PROGRAM"
else
  INTERFACE="terminal"
fi

# Capture git snapshot
lattice_capture_git_snapshot

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Write active-session file (atomic: write to temp, then mv)
ACTIVE_SESSIONS_DIR="${LATTICE_CONFIG_DIR}/active-sessions"
mkdir -p "$ACTIVE_SESSIONS_DIR"
PPID_START_TIME="$(ps -p $PPID -o lstart= 2>/dev/null)" || PPID_START_TIME=""

TEMP_SESSION_FILE="$(mktemp "${ACTIVE_SESSIONS_DIR}/.sess.XXXXXX")"
jq -n \
  --arg project_id "$LATTICE_PROJECT_ID" \
  --arg hostname "$LATTICE_HOSTNAME" \
  --arg started_at "$TIMESTAMP" \
  --arg ppid "$PPID" \
  --arg ppid_start_time "$PPID_START_TIME" \
  '{project_id: $project_id, hostname: $hostname, started_at: $started_at, ppid: $ppid, ppid_start_time: $ppid_start_time}' \
  > "$TEMP_SESSION_FILE"
mv "$TEMP_SESSION_FILE" "${ACTIVE_SESSIONS_DIR}/${SESSION_ID}.json"

# Build and emit batch: session.start + git.snapshot
BATCH_JSON="$(jq -n \
  --arg session_id "$SESSION_ID" \
  --arg project_id "$LATTICE_PROJECT_ID" \
  --arg hostname "$LATTICE_HOSTNAME" \
  --arg timestamp "$TIMESTAMP" \
  --arg interface "$INTERFACE" \
  --arg device_label "${LATTICE_DEVICE_LABEL:-}" \
  --arg git_remote_url "$LATTICE_GIT_REMOTE_URL" \
  --argjson snapshot "$LATTICE_GIT_SNAPSHOT_JSON" \
  '[
    {
      event_type: "session.start",
      session_id: $session_id,
      project_id: $project_id,
      hostname: $hostname,
      timestamp: $timestamp,
      payload: {
        interface: $interface,
        device_label: $device_label,
        git_remote_url: $git_remote_url,
        cwd: $session_id
      }
    },
    {
      event_type: "git.snapshot",
      session_id: $session_id,
      project_id: $project_id,
      hostname: $hostname,
      timestamp: $timestamp,
      payload: ($snapshot + {trigger_type: "session_start"})
    }
  ]')"

lattice_emit_batch "$BATCH_JSON"

# --- Checkpoint injection (best-effort) ---
CHECKPOINT_JSON=""

# Try to fetch latest checkpoint from API
CHECKPOINT_RESPONSE="$(curl -s \
  --max-time 1 \
  --connect-timeout 0.5 \
  -H "Authorization: Bearer ${LATTICE_API_TOKEN}" \
  "${LATTICE_API_URL}/api/projects/${LATTICE_PROJECT_ID}/checkpoints?limit=1" 2>/dev/null)" || true

if [ -n "$CHECKPOINT_RESPONSE" ]; then
  # Parse response — expects { data: [...] } envelope
  CHECKPOINT_JSON="$(echo "$CHECKPOINT_RESPONSE" | jq -r '.data[0] // empty' 2>/dev/null)" || true

  # Cache it locally for offline fallback
  if [ -n "$CHECKPOINT_JSON" ] && [ "$CHECKPOINT_JSON" != "null" ]; then
    CACHE_DIR="${LATTICE_CONFIG_DIR}/last-checkpoint"
    mkdir -p "$CACHE_DIR"
    echo "$CHECKPOINT_JSON" > "${CACHE_DIR}/${LATTICE_PROJECT_ID}.json" 2>/dev/null
  fi
fi

# Fallback to cached checkpoint if API fetch failed
if [ -z "$CHECKPOINT_JSON" ] || [ "$CHECKPOINT_JSON" = "null" ]; then
  CACHE_FILE="${LATTICE_CONFIG_DIR}/last-checkpoint/${LATTICE_PROJECT_ID}.json"
  if [ -f "$CACHE_FILE" ]; then
    CHECKPOINT_JSON="$(cat "$CACHE_FILE" 2>/dev/null)" || true
  fi
fi

# Build additionalContext if we have a checkpoint
if [ -n "$CHECKPOINT_JSON" ] && [ "$CHECKPOINT_JSON" != "null" ]; then
  SUMMARY="$(echo "$CHECKPOINT_JSON" | jq -r '.summary // "No summary"')"
  IN_PROGRESS="$(echo "$CHECKPOINT_JSON" | jq -r '.in_progress // "None"')"
  NEXT_STEPS="$(echo "$CHECKPOINT_JSON" | jq -r '.next_steps // "None"')"
  BRANCH="$(echo "$CHECKPOINT_JSON" | jq -r '.branch // "unknown"')"
  LAST_COMMIT="$(echo "$CHECKPOINT_JSON" | jq -r '.last_commit // "unknown"')"

  CONTEXT="--- Lattice Checkpoint (last session on this project) ---
Summary: ${SUMMARY}
In progress: ${IN_PROGRESS}
Next steps: ${NEXT_STEPS}
Branch: ${BRANCH}
Last commit: ${LAST_COMMIT}

Available Lattice commands:
  /lattice:checkpoint — Save a checkpoint of current work
  /lattice:status — View all tracked projects
  /lattice:where — Show active sessions across devices
  /lattice:project <name> — View project detail
  /lattice:tag <project> <tag> — Tag a project

Lattice API: ${LATTICE_API_URL}
---"

  # Output hookSpecificOutput for Claude Code to inject
  jq -n --arg ctx "$CONTEXT" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $ctx
    }
  }'
fi

exit 0
