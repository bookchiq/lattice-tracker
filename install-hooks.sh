#!/bin/bash
# Lattice Tracker — Install Script
# Sets up hooks, config, and heartbeat. Supports macOS (launchd), Linux (systemd/cron).
set -o pipefail

echo "=== Lattice Tracker Installer ==="
echo ""

# --- Check prerequisites ---
MISSING=""

command -v jq >/dev/null 2>&1 || MISSING="${MISSING} jq"
command -v curl >/dev/null 2>&1 || MISSING="${MISSING} curl"
command -v git >/dev/null 2>&1 || MISSING="${MISSING} git"

if [ -n "$MISSING" ]; then
  echo "ERROR: Missing required tools:${MISSING}"
  echo "Install with: brew install${MISSING}"
  exit 1
fi

NODE_VERSION="$(node --version 2>/dev/null)" || NODE_VERSION=""
if [ -z "$NODE_VERSION" ]; then
  echo "ERROR: Node.js is not installed. Install Node.js 20+."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Prompt for config ---
echo "Configuration:"
echo ""

read -rp "  Lattice API URL (e.g., https://lattice.yourdomain.com): " API_URL
if [[ "$API_URL" != https://* ]]; then
  echo "ERROR: API URL must start with https://"
  exit 1
fi
# Strip trailing slash
API_URL="${API_URL%/}"

read -rp "  API Token: " API_TOKEN
if [ -z "$API_TOKEN" ]; then
  echo "ERROR: API token is required."
  exit 1
fi

read -rp "  Device label (e.g., laptop, desktop, vps): " DEVICE_LABEL
if [ -z "$DEVICE_LABEL" ]; then
  DEVICE_LABEL="$(hostname -s)"
fi

echo ""

# --- Create config directory ---
CONFIG_DIR="${HOME}/.config/lattice"
mkdir -p "${CONFIG_DIR}/active-sessions"
chmod 700 "$CONFIG_DIR"
chmod 700 "${CONFIG_DIR}/active-sessions"
mkdir -p "${CONFIG_DIR}/last-checkpoint"

# Generate config.env (sourceable shell vars)
CONFIG_ENV="${CONFIG_DIR}/config.env"
cat > "$CONFIG_ENV" << ENVEOF
LATTICE_API_URL="${API_URL}"
LATTICE_API_TOKEN="${API_TOKEN}"
LATTICE_DEVICE_LABEL="${DEVICE_LABEL}"
ENVEOF
chmod 600 "$CONFIG_ENV"

echo "  Config written to ${CONFIG_DIR}/"

# --- Copy hook scripts ---
HOOKS_DEST="${HOME}/.claude/hooks/lattice"
mkdir -p "${HOOKS_DEST}/lib"

cp "${SCRIPT_DIR}/hooks/scripts/session-start.sh" "${HOOKS_DEST}/"
cp "${SCRIPT_DIR}/hooks/scripts/session-end.sh" "${HOOKS_DEST}/"
cp "${SCRIPT_DIR}/hooks/scripts/notification.sh" "${HOOKS_DEST}/"
cp "${SCRIPT_DIR}/hooks/scripts/post-tool-use.sh" "${HOOKS_DEST}/"
cp "${SCRIPT_DIR}/hooks/scripts/stop.sh" "${HOOKS_DEST}/"
cp "${SCRIPT_DIR}/hooks/scripts/heartbeat.sh" "${HOOKS_DEST}/"
cp "${SCRIPT_DIR}/hooks/scripts/lib/common.sh" "${HOOKS_DEST}/lib/"
cp "${SCRIPT_DIR}/hooks/scripts/lib/git-snapshot.sh" "${HOOKS_DEST}/lib/"

chmod +x "${HOOKS_DEST}"/*.sh
chmod +x "${HOOKS_DEST}/lib"/*.sh

echo "  Hook scripts installed to ${HOOKS_DEST}/"

# --- Merge hooks into settings.json ---
SETTINGS_FILE="${HOME}/.claude/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"

# Back up existing settings
if [ -f "$SETTINGS_FILE" ]; then
  BACKUP="${SETTINGS_FILE}.bak.$(date +%s)"
  cp "$SETTINGS_FILE" "$BACKUP"
  echo "  Backed up settings to ${BACKUP}"

  # Validate existing JSON
  if ! jq empty "$SETTINGS_FILE" 2>/dev/null; then
    echo "ERROR: ${SETTINGS_FILE} is not valid JSON."
    echo "  Backup saved to ${BACKUP}. Fix manually and re-run."
    exit 1
  fi
else
  echo '{}' > "$SETTINGS_FILE"
fi

# Read the hook configuration to merge
HOOKS_JSON="${SCRIPT_DIR}/hooks/hooks.json"

# Merge hooks using jq (array concatenation, not replacement)
TEMP_SETTINGS="$(mktemp "${SETTINGS_FILE}.tmp.XXXXXX")"
jq -s '
  .[0] as $current |
  .[1].hooks as $new_hooks |
  $current | .hooks = (
    ($current.hooks // {}) as $existing |
    reduce ($new_hooks | to_entries[]) as $entry ($existing;
      .[$entry.key] = ((.[$entry.key] // []) + $entry.value)
    )
  )
' "$SETTINGS_FILE" "$HOOKS_JSON" > "$TEMP_SETTINGS"

if jq empty "$TEMP_SETTINGS" 2>/dev/null; then
  mv "$TEMP_SETTINGS" "$SETTINGS_FILE"
  echo "  Hook configuration merged into ${SETTINGS_FILE}"
else
  rm -f "$TEMP_SETTINGS"
  echo "ERROR: Failed to merge hooks. Settings file unchanged."
  exit 1
fi

# --- Install heartbeat scheduler ---
install_heartbeat_macos() {
  local PLIST_NAME="com.lattice.heartbeat"
  local PLIST_DIR="${HOME}/Library/LaunchAgents"
  local PLIST_FILE="${PLIST_DIR}/${PLIST_NAME}.plist"

  mkdir -p "$PLIST_DIR"

  cat > "$PLIST_FILE" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${HOOKS_DEST}/heartbeat.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>180</integer>
    <key>StandardOutPath</key>
    <string>${CONFIG_DIR}/heartbeat-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${CONFIG_DIR}/heartbeat-stderr.log</string>
    <key>RunAtLoad</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
</dict>
</plist>
PLISTEOF

  launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null
  launchctl bootstrap "gui/$(id -u)" "$PLIST_FILE"
  echo "  Heartbeat installed via launchd (every 3 minutes)"
}

install_heartbeat_systemd() {
  local TIMER_DIR="${HOME}/.config/systemd/user"
  mkdir -p "$TIMER_DIR"

  cat > "${TIMER_DIR}/lattice-heartbeat.service" << SVCEOF
[Unit]
Description=Lattice Tracker heartbeat

[Service]
Type=oneshot
ExecStart=/bin/bash ${HOOKS_DEST}/heartbeat.sh
Environment=HOME=${HOME}
SVCEOF

  cat > "${TIMER_DIR}/lattice-heartbeat.timer" << TMREOF
[Unit]
Description=Lattice Tracker heartbeat timer

[Timer]
OnBootSec=60
OnUnitActiveSec=180

[Install]
WantedBy=timers.target
TMREOF

  systemctl --user daemon-reload
  systemctl --user enable --now lattice-heartbeat.timer
  echo "  Heartbeat installed via systemd timer (every 3 minutes)"
}

install_heartbeat_crontab() {
  local CRON_LINE="*/3 * * * * /bin/bash ${HOOKS_DEST}/heartbeat.sh >> ${CONFIG_DIR}/heartbeat-stdout.log 2>> ${CONFIG_DIR}/heartbeat-stderr.log"
  (crontab -l 2>/dev/null | grep -v "lattice/heartbeat.sh"; echo "$CRON_LINE") | crontab -
  echo "  Heartbeat installed via crontab (every 3 minutes)"
}

if [[ "$(uname)" == "Darwin" ]]; then
  install_heartbeat_macos
elif command -v systemctl >/dev/null 2>&1 && systemctl --user status >/dev/null 2>&1; then
  install_heartbeat_systemd
else
  install_heartbeat_crontab
fi

echo ""
echo "=== Installation complete ==="
echo ""
echo "Lattice will now track your Claude Code sessions."
echo "Open the dashboard at: ${API_URL}"
echo ""
echo "To uninstall: ./uninstall-hooks.sh"
