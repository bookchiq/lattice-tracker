# Lattice Status

Show all tracked projects with their current status.

## Instructions

1. Source the Lattice config:
```bash
source ~/.config/lattice/config.env
```

2. Fetch all projects:
```bash
curl -s -H "Authorization: Bearer ${LATTICE_API_TOKEN}" "${LATTICE_API_URL}/api/projects"
```

3. Display the results in a readable table format showing:
   - Project name (display_name or canonical_name)
   - Client tag (if set)
   - Last activity (relative time)
   - Status (active/idle based on whether active sessions exist)

4. For projects with active sessions, also show the device and branch.
