#!/bin/bash
# Lattice Tracker — Stop hook
# Fires after every Claude Code response.
# CRITICAL: Zero-cost fast path — no jq, no source, no forks on the common path.

# Read stdin without forking (bash builtin, not $(cat))
INPUT=""
while IFS= read -r line; do INPUT+="$line"; done

# Fast path 1: prevent infinite loop — permissive regex for whitespace variations
[[ "$INPUT" =~ \"stop_hook_active\"[[:space:]]*:[[:space:]]*true ]] && exit 0

# Fast path 2: no checkpoint flag → nothing to do
[ -f ".lattice/checkpoint-suggested" ] || exit 0

# --- Slow path: checkpoint flag exists, do real work ---

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Atomically claim the flag file (mv then read — prevents double-trigger)
TEMP_FLAG="$(mktemp ".lattice/.cp-flag.XXXXXX" 2>/dev/null)"
if ! mv ".lattice/checkpoint-suggested" "$TEMP_FLAG" 2>/dev/null; then
  # Another invocation already claimed it
  rm -f "$TEMP_FLAG" 2>/dev/null
  exit 0
fi

TRIGGER_REASON="$(cat "$TEMP_FLAG" 2>/dev/null)" || TRIGGER_REASON="unknown"
rm -f "$TEMP_FLAG" 2>/dev/null

REASON="Lattice checkpoint needed (trigger: ${TRIGGER_REASON}). Use the lattice:checkpoint skill — see skills/checkpoint/SKILL.md for the format."

# Output JSON that blocks Claude's stop and injects checkpoint instructions
jq -n --arg reason "$REASON" '{
  decision: "block",
  reason: $reason
}'
