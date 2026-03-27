#!/bin/bash
# Lattice Tracker — Stop hook
# Fires after every Claude Code response.
# CRITICAL: Zero-cost fast path — no jq, no source on the common path.
# Only does work when a checkpoint flag file exists (rare: after PR creation).

INPUT="$(cat)"

# Fast path 1: prevent infinite loop — check stop_hook_active with pure bash
[[ "$INPUT" =~ \"stop_hook_active\":true ]] && exit 0

# Fast path 2: no checkpoint flag → nothing to do
[ -f ".lattice/checkpoint-suggested" ] || exit 0

# --- Slow path: checkpoint flag exists, do real work ---

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Read the trigger reason and atomically remove the flag
TRIGGER_REASON="$(cat ".lattice/checkpoint-suggested" 2>/dev/null)" || TRIGGER_REASON="unknown"
rm -f ".lattice/checkpoint-suggested" 2>/dev/null

REASON="A checkpoint-worthy event occurred (${TRIGGER_REASON}). Please write a checkpoint summary for this session.

Run /lattice:checkpoint to create the checkpoint, or write one manually:
1. Summarize what you were working on (2-3 sentences, be specific)
2. Note what's in progress, what's blocked, and next steps
3. Write to .lattice/last-checkpoint.json
4. POST it to the Lattice API:
   curl -s -X POST \"${LATTICE_API_URL}/api/events\" \\
     -H \"Authorization: Bearer \${LATTICE_API_TOKEN}\" \\
     -H \"Content-Type: application/json\" \\
     -d \$(jq -n --arg sid \"\${CLAUDE_SESSION_ID}\" --slurpfile cp .lattice/last-checkpoint.json \\
       '{event_type: \"session.checkpoint\", session_id: \$sid, payload: \$cp[0]}')

Source config from: ~/.config/lattice/config.env"

# Output JSON that blocks Claude's stop and injects checkpoint instructions
jq -n --arg reason "$REASON" '{
  decision: "block",
  reason: $reason
}'
