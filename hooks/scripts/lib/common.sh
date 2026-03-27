#!/bin/bash
# Lattice Tracker — shared library for hook scripts
# Provides: config loading, logging, event emission, project detection
set -o pipefail

# Resolve paths relative to the hooks directory
LATTICE_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Config ---
LATTICE_CONFIG_DIR="${HOME}/.config/lattice"
LATTICE_CONFIG_ENV="${LATTICE_CONFIG_DIR}/config.env"

# --- Logging (defined early so config validation can use it) ---
LATTICE_LOG_FILE="${LATTICE_CONFIG_DIR}/lattice-hooks.log"

lattice_log() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "${ts} ${msg}" >> "$LATTICE_LOG_FILE" 2>/dev/null
}

# Source config.env (shell variables — avoids jq fork)
if [ -f "$LATTICE_CONFIG_ENV" ]; then
  # shellcheck source=/dev/null
  source "$LATTICE_CONFIG_ENV"
fi

# Bail out silently if config is missing — don't break Claude Code
if [ -z "${LATTICE_API_URL:-}" ] || [ -z "${LATTICE_API_TOKEN:-}" ]; then
  lattice_log "ERROR: Missing LATTICE_API_URL or LATTICE_API_TOKEN in config"
  return 0 2>/dev/null || exit 0
fi

# --- Auth header file (reusable, avoids per-invocation temp files) ---
LATTICE_AUTH_HEADER_FILE="${LATTICE_CONFIG_DIR}/.auth-header"
if [ ! -f "$LATTICE_AUTH_HEADER_FILE" ] || ! grep -q "$LATTICE_API_TOKEN" "$LATTICE_AUTH_HEADER_FILE" 2>/dev/null; then
  echo "Authorization: Bearer ${LATTICE_API_TOKEN}" > "$LATTICE_AUTH_HEADER_FILE"
  chmod 600 "$LATTICE_AUTH_HEADER_FILE"
fi

# --- Event Emission ---

# Emit a single event to the Lattice API
lattice_emit() {
  local event_json="$1"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 3 \
    --connect-timeout 2 \
    -X POST \
    -H @"$LATTICE_AUTH_HEADER_FILE" \
    -H "Content-Type: application/json" \
    -d "$event_json" \
    "${LATTICE_API_URL}/api/events" 2>/dev/null)

  if [ "$http_code" != "201" ]; then
    lattice_log "FAILED event (HTTP ${http_code})"
    echo "${event_json}" >> "${LATTICE_CONFIG_DIR}/failed-events.log"
    chmod 600 "${LATTICE_CONFIG_DIR}/failed-events.log" 2>/dev/null
  fi
}

# Emit a batch of events to the Lattice API
lattice_emit_batch() {
  local events_json="$1"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 3 \
    --connect-timeout 2 \
    -X POST \
    -H @"$LATTICE_AUTH_HEADER_FILE" \
    -H "Content-Type: application/json" \
    -d "$events_json" \
    "${LATTICE_API_URL}/api/events/batch" 2>/dev/null)

  if [ "$http_code" != "201" ]; then
    lattice_log "FAILED batch (HTTP ${http_code})"
    echo "${events_json}" >> "${LATTICE_CONFIG_DIR}/failed-events.log" 2>/dev/null
  fi
}

# --- Project Detection ---

lattice_detect_project() {
  local remote_url
  remote_url="$(git remote get-url origin 2>/dev/null)" || true

  if [ -n "$remote_url" ]; then
    LATTICE_GIT_REMOTE_URL="$remote_url"
    # Normalize: strip protocol/auth/port, replace : with /, strip .git, lowercase, then / -> :
    # Combined into single sed + single tr to minimize forks
    LATTICE_PROJECT_ID="$(echo "$remote_url" \
      | sed -E 's|^ssh://||; s|^https?://||; s|^git@||; s|:[0-9]+/|/|; s|:|/|; s|\.git$||; s|/+$||' \
      | tr '[:upper:]/' '[:lower:]:')"

    # Validate project ID: allow only safe characters
    if [[ ! "$LATTICE_PROJECT_ID" =~ ^[a-zA-Z0-9:._-]+$ ]]; then
      LATTICE_PROJECT_ID="invalid:$(echo -n "$remote_url" | shasum -a 256 | cut -c1-16)"
    fi
  else
    LATTICE_GIT_REMOTE_URL=""
    local hash_input
    hash_input="$(hostname):$(pwd)"
    LATTICE_PROJECT_ID="local:$(echo -n "$hash_input" | shasum -a 256 | cut -c1-16)"
  fi
}

# --- Validation ---

lattice_validate_session_id() {
  local sid="$1"
  if [ -z "$sid" ]; then
    return 1
  fi
  if [[ ! "$sid" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    lattice_log "ERROR: Invalid session_id: ${sid}"
    return 1
  fi
  return 0
}

# URL-encode a string for safe interpolation in curl URLs
lattice_urlencode() {
  local string="$1"
  local encoded=""
  local i c
  for (( i=0; i<${#string}; i++ )); do
    c="${string:$i:1}"
    case "$c" in
      [a-zA-Z0-9.~_:-]) encoded+="$c" ;;
      *) encoded+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  echo "$encoded"
}

# --- Hostname ---
LATTICE_HOSTNAME="$(hostname -s 2>/dev/null || hostname)"
