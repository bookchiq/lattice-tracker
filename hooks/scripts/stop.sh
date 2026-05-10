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

REASON="A checkpoint-worthy event occurred (${TRIGGER_REASON}). Please write a checkpoint summary for this session.

Run /lattice:checkpoint to create the checkpoint, or write one manually:
1. Summarize what you were working on (2-3 sentences, be specific)
2. Note what's in progress, what's blocked, and next steps
3. Write to .lattice/last-checkpoint.json
4. POST it to the Lattice API (conditional auth — server may run with auth disabled):
   source ~/.config/lattice/config.env
   [ -n \"\$LATTICE_API_TOKEN\" ] && AUTH_ARGS=(-H \"Authorization: Bearer \$LATTICE_API_TOKEN\") || AUTH_ARGS=()
   curl -s -X POST \"\${AUTH_ARGS[@]}\" \\
     -H \"Content-Type: application/json\" \\
     \"\${LATTICE_API_URL}/api/events\" \\
     -d \$(jq -n --arg sid \"\${CLAUDE_SESSION_ID}\" --arg ts \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --slurpfile cp .lattice/last-checkpoint.json \\
       '{event_type: \"session.checkpoint\", session_id: \$sid, timestamp: \$ts, payload: \$cp[0]}')"

# Output JSON that blocks Claude's stop and injects checkpoint instructions
jq -n --arg reason "$REASON" '{
  decision: "block",
  reason: $reason
}'
