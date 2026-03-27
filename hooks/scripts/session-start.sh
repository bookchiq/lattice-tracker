#!/bin/bash
# Lattice Tracker — SessionStart hook
# Fires when a new Claude Code session begins.
# Emits session.start + git.snapshot, injects last checkpoint as context.
set -o pipefail

INPUT="$(cat)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/git-snapshot.sh"

# Extract fields from stdin JSON (single jq call)
read -r SESSION_ID CWD <<< "$(echo "$INPUT" | jq -r '[.session_id // "", .cwd // ""] | @tsv')"

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

if ! lattice_validate_session_id "$SESSION_ID"; then
  exit 0
fi

# Change to the working directory if provided
if [ -n "$CWD" ] && [ -d "$CWD" ]; then
  cd "$CWD" 2>/dev/null || true
fi

# Detect project
lattice_detect_project

# Detect interface (inline)
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
  --arg cwd "$CWD" \
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
        cwd: $cwd
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

# Try to fetch latest checkpoint from API (token via header file)
ENCODED_PROJECT_ID="$(lattice_urlencode "$LATTICE_PROJECT_ID")"
CHECKPOINT_RESPONSE="$(curl -s \
  --max-time 1 \
  --connect-timeout 0.5 \
  -H @"$LATTICE_AUTH_HEADER_FILE" \
  "${LATTICE_API_URL}/api/projects/${ENCODED_PROJECT_ID}/checkpoints?limit=1" 2>/dev/null)" || true

if [ -n "$CHECKPOINT_RESPONSE" ]; then
  CHECKPOINT_JSON="$(echo "$CHECKPOINT_RESPONSE" | jq -r '.data[0] // empty' 2>/dev/null)" || true

  if [ -n "$CHECKPOINT_JSON" ] && [ "$CHECKPOINT_JSON" != "null" ]; then
    CACHE_DIR="${LATTICE_CONFIG_DIR}/last-checkpoint"
    mkdir -p "$CACHE_DIR"
    echo "$CHECKPOINT_JSON" > "${CACHE_DIR}/${ENCODED_PROJECT_ID}.json" 2>/dev/null
  fi
fi

# Fallback to cached checkpoint if API fetch failed
if [ -z "$CHECKPOINT_JSON" ] || [ "$CHECKPOINT_JSON" = "null" ]; then
  CACHE_FILE="${LATTICE_CONFIG_DIR}/last-checkpoint/${ENCODED_PROJECT_ID}.json"
  if [ -f "$CACHE_FILE" ]; then
    CHECKPOINT_JSON="$(cat "$CACHE_FILE" 2>/dev/null)" || true
  fi
fi

# Build additionalContext if we have a checkpoint (single jq call for all fields)
if [ -n "$CHECKPOINT_JSON" ] && [ "$CHECKPOINT_JSON" != "null" ]; then
  read -r SUMMARY IN_PROGRESS NEXT_STEPS BRANCH LAST_COMMIT <<< "$(echo "$CHECKPOINT_JSON" | jq -r '[
    .summary // "No summary",
    .in_progress // "None",
    .next_steps // "None",
    .branch // "unknown",
    .last_commit // "unknown"
  ] | @tsv')"

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

  jq -n --arg ctx "$CONTEXT" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $ctx
    }
  }'
fi

exit 0
