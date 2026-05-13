# Lattice Status

Show all tracked projects with their current status.

## Instructions

1. Source the Lattice config:
```bash
source ~/.config/lattice/config.env
```

2. Build the auth args (omit the header when no token is set, mirroring `hooks/scripts/lib/common.sh`):
```bash
[ -n "$LATTICE_API_TOKEN" ] && AUTH_ARGS=(-H "Authorization: Bearer $LATTICE_API_TOKEN") || AUTH_ARGS=()
```

3. Fetch all projects:
```bash
curl -s "${AUTH_ARGS[@]}" "${LATTICE_API_URL}/api/projects"
```

4. Display the results in a readable table format showing:
   - Project name (display_name or canonical_name)
   - Client tag (if set)
   - Last work (relative time of the most recent real-work event — not heartbeats)
   - Status (active/idle based on whether active sessions exist)

5. For projects with active sessions, also show the device and branch.
