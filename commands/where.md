# Lattice Where

Show all currently active and waiting-for-input sessions across all devices.

## Instructions

1. Source the Lattice config:
```bash
source ~/.config/lattice/config.env
```

2. Build the auth args (omit the header when no token is set, mirroring `hooks/scripts/lib/common.sh`):
```bash
[ -n "$LATTICE_API_TOKEN" ] && AUTH_ARGS=(-H "Authorization: Bearer $LATTICE_API_TOKEN") || AUTH_ARGS=()
```

3. Fetch active sessions:
```bash
curl -s "${AUTH_ARGS[@]}" "${LATTICE_API_URL}/api/sessions?status=active,waiting_for_input"
```

4. Display the results showing:
   - Project name
   - Device/hostname
   - Interface (terminal, vscode, etc.)
   - Status (active or waiting for input)
   - How long the session has been running

5. Highlight any sessions that are waiting for input — these need attention.
