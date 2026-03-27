# Lattice Tag

Tag a project with a client tag or display name for easier identification.

## Arguments

- `<project>` — Project name or ID to tag
- `<tag>` — Client tag to set (e.g., "client:project-name")

## Instructions

1. Source the Lattice config:
```bash
source ~/.config/lattice/config.env
```

2. Fetch all projects to find the matching one:
```bash
curl -s -H "Authorization: Bearer ${LATTICE_API_TOKEN}" "${LATTICE_API_URL}/api/projects"
```

3. Find the project matching the `<project>` argument (case-insensitive partial match).

4. PATCH the project with the new tag:
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer ${LATTICE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"client_tag": "<tag>"}' \
  "${LATTICE_API_URL}/api/projects/<project_id>"
```

5. Confirm the tag was set by displaying the updated project info.

If the `<tag>` argument contains a space, treat the first word as the project and the rest as the tag value.
