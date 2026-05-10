# Lattice Note

Attach a free-form note to a project. Notes are append-only and visible to every device viewing the project — useful for cross-machine context like "tested the auth flow on Tailscale and it worked" or "the staging DB password rotated, see 1Password."

## Arguments

- `<project>` — Project name or ID to attach the note to (case-insensitive partial match on `display_name`, `canonical_name`, or `id`).
- `<text>` — The note text. Wrap in quotes. Capped at 4096 characters by the server (longer text is silently truncated).

## Style

Keep notes short and high-signal — 1–3 sentences is the sweet spot. The same guidelines that apply to checkpoints apply here:

- Be specific: name files, commits, branches, hostnames, or people involved.
- Mention what changed or what you learned, not just what you did.
- If something is blocking or surprising, say so plainly — these notes are how the next session (possibly on a different machine) catches up.
- This is a signpost, not documentation. Skip preamble.

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

5. Resolve the real machine hostname so the dashboard shows where the note came from. Mirror `hooks/scripts/lib/common.sh` — never send the literal string `dashboard` from a slash command:
```bash
HOSTNAME_REAL="${LATTICE_HOSTNAME:-$(hostname -s 2>/dev/null || hostname)}"
```

6. POST a `project.note` event. Use `jq` to build the JSON so the note text is escaped correctly:
```bash
EVENT_BODY="$(jq -n \
  --arg pid  "<project_id>" \
  --arg ts   "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg host "$HOSTNAME_REAL" \
  --arg text "$NOTE_TEXT" \
  '{event_type: "project.note",
    project_id: $pid,
    timestamp:  $ts,
    hostname:   $host,
    payload:    {text: $text}}')"

curl -s -X POST \
  "${AUTH_ARGS[@]}" \
  -H "Content-Type: application/json" \
  -d "$EVENT_BODY" \
  "${LATTICE_API_URL}/api/events"
```

7. Confirm by displaying the project name, the note text, the hostname, and the timestamp. If the API returned a non-2xx response, surface the error so the user knows the note didn't land.

## Examples

- `/lattice:note lattice-tracker "Tested the auth flow on Tailscale — works with token disabled."`
- `/lattice:note ams-sso "iMIS test creds rotated; new ones are in 1Password under 'INCOSE staging'."`
- `/lattice:note lattice-tracker "PR #079 merged — hostname convention now formalized in the spec."`
