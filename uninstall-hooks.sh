#!/bin/bash
# Lattice Tracker — Uninstall Script
# Removes hooks, heartbeat plist, and optionally config.
set -o pipefail

echo "=== Lattice Tracker Uninstaller ==="
echo ""

# --- Unload and remove heartbeat plist ---
PLIST_NAME="com.lattice.heartbeat"
PLIST_FILE="${HOME}/Library/LaunchAgents/${PLIST_NAME}.plist"

launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null
rm -f "$PLIST_FILE"
echo "  Heartbeat plist removed"

# --- Remove hook scripts ---
HOOKS_DIR="${HOME}/.claude/hooks/lattice"
if [ -d "$HOOKS_DIR" ]; then
  rm -rf "$HOOKS_DIR"
  echo "  Hook scripts removed from ${HOOKS_DIR}"
fi

# --- Remove Lattice entries from settings.json ---
SETTINGS_FILE="${HOME}/.claude/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  BACKUP="${SETTINGS_FILE}.bak.$(date +%s)"
  cp "$SETTINGS_FILE" "$BACKUP"

  TEMP_SETTINGS="$(mktemp "${SETTINGS_FILE}.tmp.XXXXXX")"
  # Remove any hook entries containing "lattice" in the command path
  jq '
    .hooks |= (
      if . then
        to_entries | map(
          .value |= map(
            .hooks |= map(select(.command | tostring | test("lattice") | not))
          ) |
          .value |= map(select(.hooks | length > 0))
        ) | map(select(.value | length > 0)) | from_entries
      else . end
    )
  ' "$SETTINGS_FILE" > "$TEMP_SETTINGS"

  if jq empty "$TEMP_SETTINGS" 2>/dev/null; then
    mv "$TEMP_SETTINGS" "$SETTINGS_FILE"
    echo "  Lattice entries removed from ${SETTINGS_FILE}"
    echo "  Backup at ${BACKUP}"
  else
    rm -f "$TEMP_SETTINGS"
    echo "  WARNING: Could not clean settings.json. Restore from ${BACKUP} manually."
  fi
fi

# --- Optionally remove config ---
CONFIG_DIR="${HOME}/.config/lattice"
if [ -d "$CONFIG_DIR" ]; then
  echo ""
  read -rp "  Remove config directory (${CONFIG_DIR})? [y/N] " REMOVE_CONFIG
  if [[ "$REMOVE_CONFIG" =~ ^[Yy]$ ]]; then
    rm -rf "$CONFIG_DIR"
    echo "  Config directory removed"
  else
    echo "  Config directory kept"
  fi
fi

echo ""
echo "=== Uninstall complete ==="
