#!/bin/bash
# Lattice Tracker — shared library for hook scripts
# Provides: config loading, logging, event emission, project detection
set -o pipefail

# Resolve paths relative to the hooks directory
LATTICE_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Config ---
# Source the config.env file (shell variables, not JSON — avoids jq fork)
LATTICE_CONFIG_DIR="${HOME}/.config/lattice"
LATTICE_CONFIG_ENV="${LATTICE_CONFIG_DIR}/config.env"

if [ -f "$LATTICE_CONFIG_ENV" ]; then
  # shellcheck source=/dev/null
  source "$LATTICE_CONFIG_ENV"
else
  # Fallback: try to read from config.json via jq (slower)
  LATTICE_CONFIG_JSON="${LATTICE_CONFIG_DIR}/config.json"
  if [ -f "$LATTICE_CONFIG_JSON" ]; then
    LATTICE_API_URL="$(jq -r '.api_url // empty' "$LATTICE_CONFIG_JSON")"
    LATTICE_API_TOKEN="$(jq -r '.api_token // empty' "$LATTICE_CONFIG_JSON")"
    LATTICE_DEVICE_LABEL="$(jq -r '.device_label // empty' "$LATTICE_CONFIG_JSON")"
  fi
fi

# Bail out silently if config is missing — don't break Claude Code
if [ -z "${LATTICE_API_URL:-}" ] || [ -z "${LATTICE_API_TOKEN:-}" ]; then
  lattice_log "ERROR: Missing LATTICE_API_URL or LATTICE_API_TOKEN in config"
  return 0 2>/dev/null || exit 0
fi

# --- Logging ---
LATTICE_LOG_FILE="${LATTICE_CONFIG_DIR}/lattice-hooks.log"

lattice_log() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "${ts} ${msg}" >> "$LATTICE_LOG_FILE" 2>/dev/null
}

# --- Event Emission ---

# Emit a single event to the Lattice API
# Usage: lattice_emit "$event_json"
lattice_emit() {
  local event_json="$1"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 3 \
    --connect-timeout 2 \
    -X POST \
    -H "Authorization: Bearer ${LATTICE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$event_json" \
    "${LATTICE_API_URL}/api/events" 2>/dev/null)

  if [ "$http_code" != "201" ]; then
    lattice_log "FAILED event (HTTP ${http_code}): ${event_json}"
    echo "${event_json}" >> "${LATTICE_CONFIG_DIR}/failed-events.log" 2>/dev/null
  fi
}

# Emit a batch of events to the Lattice API
# Usage: lattice_emit_batch "$events_json_array"
lattice_emit_batch() {
  local events_json="$1"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 3 \
    --connect-timeout 2 \
    -X POST \
    -H "Authorization: Bearer ${LATTICE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$events_json" \
    "${LATTICE_API_URL}/api/events/batch" 2>/dev/null)

  if [ "$http_code" != "201" ]; then
    lattice_log "FAILED batch (HTTP ${http_code}): ${events_json}"
    echo "${events_json}" >> "${LATTICE_CONFIG_DIR}/failed-events.log" 2>/dev/null
  fi
}

# --- Project Detection ---

# Detect the project ID from git remote or directory hash
# Sets LATTICE_PROJECT_ID and LATTICE_GIT_REMOTE_URL
lattice_detect_project() {
  local remote_url
  remote_url="$(git remote get-url origin 2>/dev/null)" || true

  if [ -n "$remote_url" ]; then
    LATTICE_GIT_REMOTE_URL="$remote_url"
    # Normalize: strip protocol/auth/port, replace : with /, strip .git, lowercase, then / -> :
    LATTICE_PROJECT_ID="$(echo "$remote_url" \
      | sed -E 's|^ssh://||' \
      | sed -E 's|^https?://||' \
      | sed -E 's|^git@||' \
      | sed -E 's|:[0-9]+/|/|' \
      | sed -E 's|:|/|' \
      | sed -E 's|\.git$||' \
      | tr '[:upper:]' '[:lower:]' \
      | sed -E 's|/+$||' \
      | tr '/' ':')"
  else
    LATTICE_GIT_REMOTE_URL=""
    # Fallback: hash of hostname:cwd
    local hash_input
    hash_input="$(hostname):$(pwd)"
    LATTICE_PROJECT_ID="local:$(echo -n "$hash_input" | shasum -a 256 | cut -c1-16)"
  fi
}

# --- Hostname ---
LATTICE_HOSTNAME="$(hostname -s 2>/dev/null || hostname)"
