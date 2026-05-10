# Lattice Tag

Set a project's `client_tag` and/or `display_name` for easier identification across devices.

## Arguments

- `<project>` — Project name or ID to update (case-insensitive partial match on `display_name`, `canonical_name`, or `id`).
- `<tag>` — (optional) New `client_tag` value (slug-style, e.g. `client:project-name`). Pass `-` to leave it unchanged.
- `<display_name>` — (optional) New human-readable name shown in the dashboard and slash commands. Wrap in quotes if it contains spaces. Pass `-` to leave it unchanged.

At least one of `<tag>` or `<display_name>` must be a real value (not `-`). If only one positional argument is given after `<project>`, treat it as the tag (preserving the original single-arg shape so existing usage keeps working).

## Instructions

1. Source the Lattice config:
```bash
source ~/.config/lattice/config.env
```

2. Build the auth args (omit the header when no token is set, mirroring `hooks/scripts/lib/common.sh`):
```bash
[ -n "$LATTICE_API_TOKEN" ] && AUTH_ARGS=(-H "Authorization: Bearer $LATTICE_API_TOKEN") || AUTH_ARGS=()
```

3. Fetch all projects to find the matching one:
```bash
curl -s "${AUTH_ARGS[@]}" "${LATTICE_API_URL}/api/projects"
```

4. Find the project whose `display_name`, `canonical_name`, or `id` matches `<project>` (case-insensitive partial match). Resolve to its `id`.

5. Build the PATCH body from whichever fields the user supplied. Use `jq` so quoting and JSON escaping are handled for you — only include keys for fields the user passed (a `-` placeholder means "leave alone"; omit those keys entirely so the server doesn't overwrite them):
```bash
PATCH_BODY="$(jq -n \
  --arg tag  "$TAG" \
  --arg name "$DISPLAY_NAME" \
  '({} 
    + (if $tag  != "-" and $tag  != "" then {client_tag:   $tag}  else {} end)
    + (if $name != "-" and $name != "" then {display_name: $name} else {} end))')"
```

6. PATCH the project:
```bash
curl -s -X PATCH \
  "${AUTH_ARGS[@]}" \
  -H "Content-Type: application/json" \
  -d "$PATCH_BODY" \
  "${LATTICE_API_URL}/api/projects/<project_id>"
```

7. Confirm the update by echoing back the updated `display_name`, `client_tag`, and `canonical_name` from the PATCH response.

## Examples

- `/lattice:tag lattice-tracker client:lattice` — set only the client tag (single-arg form, backward-compatible).
- `/lattice:tag lattice-tracker - "Lattice Tracker"` — set only the display name; leave the tag untouched.
- `/lattice:tag lattice-tracker client:lattice "Lattice Tracker"` — set both in one call.
