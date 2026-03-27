# Lattice Project

Show detailed information about a specific project, including git state, latest checkpoint, and session history.

## Arguments

- `<name>` — Project name or ID to look up. Searches display_name, canonical_name, and ID.

## Instructions

1. Source the Lattice config:
```bash
source ~/.config/lattice/config.env
```

2. Fetch all projects to find the matching one:
```bash
curl -s -H "Authorization: Bearer ${LATTICE_API_TOKEN}" "${LATTICE_API_URL}/api/projects"
```

3. Find the project matching the `<name>` argument (case-insensitive partial match on display_name, canonical_name, or id).

4. Fetch the project detail:
```bash
curl -s -H "Authorization: Bearer ${LATTICE_API_TOKEN}" "${LATTICE_API_URL}/api/projects/<project_id>"
```

5. Fetch recent sessions:
```bash
curl -s -H "Authorization: Bearer ${LATTICE_API_TOKEN}" "${LATTICE_API_URL}/api/projects/<project_id>/sessions?limit=5"
```

6. Display:
   - Project name, ID, client tag
   - Git state: branch, last commit, uncommitted changes
   - Latest checkpoint: summary, in progress, next steps
   - Recent session history: device, status, duration
