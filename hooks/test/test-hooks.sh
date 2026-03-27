#!/bin/bash
# Lattice Hook Tests
# Tests hooks by setting up a local config and verifying script behavior.
# Requires: jq, the lattice server running locally, or runs in dry-run mode.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="${SCRIPT_DIR}/../scripts"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() {
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}✔${NC} $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}✘${NC} $1: $2"
}

# Set up temp config directory
TEST_DIR="$(mktemp -d)"
export HOME="$TEST_DIR"
CONFIG_DIR="${TEST_DIR}/.config/lattice"
mkdir -p "${CONFIG_DIR}/active-sessions"
mkdir -p "${CONFIG_DIR}/last-checkpoint"

# Write test config.env (points to a non-existent server — hooks will fire-and-forget)
cat > "${CONFIG_DIR}/config.env" << 'ENVEOF'
LATTICE_API_URL="http://localhost:19999"
LATTICE_API_TOKEN="test-token-hooks"
LATTICE_DEVICE_LABEL="test-machine"
ENVEOF

echo "▶ stop.sh fast path"

# Test 1: stop.sh exits quickly when no flag file exists
OUTPUT=$(echo '{"stop_hook_active":false}' | bash "${HOOKS_DIR}/stop.sh" 2>&1)
if [ -z "$OUTPUT" ]; then
  pass "exits silently when no checkpoint flag"
else
  fail "should produce no output" "$OUTPUT"
fi

# Test 2: stop.sh exits when stop_hook_active is true
OUTPUT=$(echo '{"stop_hook_active":true}' | bash "${HOOKS_DIR}/stop.sh" 2>&1)
if [ -z "$OUTPUT" ]; then
  pass "exits silently when stop_hook_active is true"
else
  fail "should exit on stop_hook_active" "$OUTPUT"
fi

# Test 3: stop.sh produces checkpoint output when flag exists
mkdir -p ".lattice"
echo "pr_created" > ".lattice/checkpoint-suggested"
OUTPUT=$(echo '{"stop_hook_active":false}' | bash "${HOOKS_DIR}/stop.sh" 2>&1)
if echo "$OUTPUT" | jq -e '.decision == "block"' > /dev/null 2>&1; then
  pass "outputs block decision when checkpoint flag exists"
else
  fail "should output block decision" "$OUTPUT"
fi
# Verify flag was cleaned up
if [ ! -f ".lattice/checkpoint-suggested" ]; then
  pass "removes checkpoint flag after reading"
else
  fail "should remove flag file" "file still exists"
fi
rm -rf ".lattice"

echo ""
echo "▶ post-tool-use.sh fast path"

# Test 4: post-tool-use.sh exits immediately for non-git commands
OUTPUT=$(echo '{"tool_input":{"command":"npm install"},"session_id":"test","cwd":"/tmp"}' | bash "${HOOKS_DIR}/post-tool-use.sh" 2>&1)
if [ -z "$OUTPUT" ]; then
  pass "exits silently for non-git commands"
else
  fail "should produce no output for npm" "$OUTPUT"
fi

# Test 5: post-tool-use.sh exits for empty command
OUTPUT=$(echo '{"tool_input":{},"session_id":"test"}' | bash "${HOOKS_DIR}/post-tool-use.sh" 2>&1)
if [ -z "$OUTPUT" ]; then
  pass "exits silently for empty command"
else
  fail "should exit for empty command" "$OUTPUT"
fi

echo ""
echo "▶ notification.sh fast path"

# Test 6: notification.sh exits for non-waiting notifications
OUTPUT=$(echo '{"notification_type":"auth_success","message":"Logged in","session_id":"test"}' | bash "${HOOKS_DIR}/notification.sh" 2>&1)
if [ -z "$OUTPUT" ]; then
  pass "exits silently for auth_success notification"
else
  fail "should exit for non-waiting notification" "$OUTPUT"
fi

echo ""
echo "▶ session-start.sh active-session file"

# Test 7: session-start.sh creates active-session file (even if API is down)
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
echo '{"session_id":"test-sess-001","cwd":"'"$(pwd)"'"}' | bash "${HOOKS_DIR}/session-start.sh" > /dev/null 2>&1
if [ -f "${CONFIG_DIR}/active-sessions/test-sess-001.json" ]; then
  pass "creates active-session file"
  # Verify it contains ppid
  if jq -e '.ppid' "${CONFIG_DIR}/active-sessions/test-sess-001.json" > /dev/null 2>&1; then
    pass "active-session file contains ppid"
  else
    fail "should contain ppid" "$(cat "${CONFIG_DIR}/active-sessions/test-sess-001.json")"
  fi
else
  fail "should create active-session file" "file not found"
fi

echo ""
echo "▶ session-end.sh cleanup"

# Test 8: session-end.sh removes active-session file
echo '{"session_id":"test-sess-001"}' | bash "${HOOKS_DIR}/session-end.sh" > /dev/null 2>&1
if [ ! -f "${CONFIG_DIR}/active-sessions/test-sess-001.json" ]; then
  pass "removes active-session file"
else
  fail "should remove active-session file" "file still exists"
fi

echo ""
echo "▶ lib/git-snapshot.sh"

# Test 9: git-snapshot captures valid JSON
source "${HOOKS_DIR}/lib/git-snapshot.sh"
lattice_capture_git_snapshot
if echo "$LATTICE_GIT_SNAPSHOT_JSON" | jq -e '.branch' > /dev/null 2>&1; then
  pass "captures git snapshot as valid JSON"
else
  fail "should produce valid JSON" "$LATTICE_GIT_SNAPSHOT_JSON"
fi

echo ""
echo "▶ lib/common.sh project detection"

# Test 10: project detection in a git repo
source "${HOOKS_DIR}/lib/common.sh"
lattice_detect_project
if [ -n "$LATTICE_PROJECT_ID" ]; then
  pass "detects project ID: ${LATTICE_PROJECT_ID}"
else
  fail "should detect project ID" "empty"
fi

# Test 11: project ID uses colons not slashes
if [[ "$LATTICE_PROJECT_ID" != *"/"* ]] || [[ "$LATTICE_PROJECT_ID" == local:* ]]; then
  pass "project ID is URL-safe (no slashes or is local hash)"
else
  fail "project ID should not contain slashes" "$LATTICE_PROJECT_ID"
fi

echo ""
echo "▶ hooks.json structure"

# Test 12: hooks.json is valid JSON with expected events
if jq -e '.hooks.SessionStart' "${SCRIPT_DIR}/../hooks.json" > /dev/null 2>&1; then
  pass "hooks.json has SessionStart configuration"
else
  fail "hooks.json should have SessionStart" ""
fi

if jq -e '.hooks.PostToolUse[0].matcher == "Bash"' "${SCRIPT_DIR}/../hooks.json" > /dev/null 2>&1; then
  pass "PostToolUse has Bash matcher"
else
  fail "PostToolUse should match Bash" ""
fi

if jq -e '.hooks.PostToolUse[0].hooks[0].async == true' "${SCRIPT_DIR}/../hooks.json" > /dev/null 2>&1; then
  pass "PostToolUse is async"
else
  fail "PostToolUse should be async" ""
fi

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
