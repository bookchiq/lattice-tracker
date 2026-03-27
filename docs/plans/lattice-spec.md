# Lattice Tracker — Cross-Device Agent Session & Project Tracker

**Version:** 0.1.0 (v1 spec)
**Author:** Sarah + Claude
**License:** MIT (open source from day one)
**Status:** Spec draft

---

## Problem

When working with Claude Code across multiple machines (laptop, desktop, VPS), multiple interfaces (terminal, VS Code integrated terminal), and multiple projects simultaneously, there is no unified way to answer:

- "Where was I working on that?"
- "What was I in the middle of when I stopped?"
- "Which of my running agents need my input right now?"
- "What's the git state of each project I touched today?"

Existing tools focus on syncing session data or orchestrating agents. Nothing provides a lightweight, human-readable registry of project × device × interface × status.

## Solution

**Lattice Tracker** is three things:

1. **Claude Code hooks** that emit events (session start/end, git state changes, agent-waiting-for-input) to a central API
2. **A Fastify API + SQLite store** running on a VPS that ingests events and serves data
3. **A web dashboard** (accessible from any device) that shows project status, session history, and continuity context

Data flows one direction: hooks → VPS API → SQLite. A scheduled job exports snapshots to a git repo for long-term analysis and portability.

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│  Laptop (macOS)     │     │  Desktop (macOS)     │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │ Terminal       │  │     │  │ Terminal       │  │
│  │ Claude Code    │──┼──┐  │  │ Claude Code    │──┼──┐
│  └───────────────┘  │  │  │  └───────────────┘  │  │
│  ┌───────────────┐  │  │  │  ┌───────────────┐  │  │
│  │ VS Code        │  │  │  │  │ VS Code        │  │  │
│  │ Claude Code    │──┼──┤  │  │ Claude Code    │──┼──┤
│  └───────────────┘  │  │  │  └───────────────┘  │  │
└─────────────────────┘  │  └─────────────────────┘  │
                         │                            │
                         ▼                            ▼
                  ┌──────────────────────────┐
                  │  Hostinger VPS           │
                  │  ┌────────────────────┐  │
                  │  │ Fastify API        │  │
                  │  │  POST /events      │  │
                  │  │  GET  /projects    │  │
                  │  │  GET  /sessions    │  │
                  │  │  ...               │  │
                  │  └────────┬───────────┘  │
                  │           │              │
                  │  ┌────────▼───────────┐  │
                  │  │ SQLite             │  │
                  │  └────────┬───────────┘  │
                  │           │              │
                  │  ┌────────▼───────────┐  │
                  │  │ Git export (cron)  │  │
                  │  └────────────────────┘  │
                  │                          │
                  │  ┌────────────────────┐  │
                  │  │ Web Dashboard      │  │
                  │  │ (static SPA)       │  │
                  │  └────────────────────┘  │
                  └──────────────────────────┘
```

### Component Overview

| Component | Tech | Location | Purpose |
|---|---|---|---|
| Hook scripts | Bash + Node.js | Each machine, `~/.claude/hooks/` | Emit events to VPS API |
| API server | Fastify (Node.js) | Hostinger VPS | Ingest events, serve data |
| Data store | SQLite (via better-sqlite3) | Hostinger VPS | Canonical data store |
| Dashboard | Static SPA (vanilla JS or Preact) | Hostinger VPS (served by Fastify) | Visual interface |
| Git archive | Git repo (private GitHub) | Hostinger VPS (cron push) | Long-term history, portability |

---

## Data Model

### Projects

Auto-discovered from the first event received for a given project identity. Enriched by the user after the fact.

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,              -- derived from git remote URL or directory hash
  git_remote_url TEXT,              -- e.g. git@github.com:yokoco/incose-sso.git
  canonical_name TEXT,              -- auto: repo name. user can rename.
  display_name TEXT,                -- user-assigned friendly name
  client_tag TEXT,                  -- e.g. "yokoco:incose", "personal:orbit", "personal:makyrie"
  last_activity_at TEXT,            -- ISO timestamp
  created_at TEXT,                  -- ISO timestamp
  metadata TEXT                     -- JSON blob for future extensibility
);
```

**Project identity resolution:**
1. If the working directory is a git repo → use the normalized remote URL as `id` (strip `.git`, normalize SSH/HTTPS variants)
2. If no git remote → use a hash of the absolute path + hostname (less stable, but functional)
3. If a `.lattice-project` file exists in the directory → use its contents as the canonical ID (escape hatch for non-git projects or when you want to link directories across machines)

### Sessions

One row per Claude Code session (identified by `session_id` from hook payload).

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,              -- Claude Code session_id
  project_id TEXT REFERENCES projects(id),
  hostname TEXT,                    -- machine hostname
  interface TEXT,                   -- "terminal" | "vscode" | "vscode-terminal" | "ssh" | "remote-control"
  device_label TEXT,                -- user-friendly: "laptop", "desktop", "vps" (derived from hostname map in config)
  status TEXT DEFAULT 'active',     -- "active" | "waiting_for_input" | "paused" | "completed" | "abandoned"
  started_at TEXT,
  last_heartbeat_at TEXT,
  ended_at TEXT,
  last_prompt TEXT,                 -- last user prompt (for quick context)
  metadata TEXT                     -- JSON blob
);
```

### Events

Append-only log of everything that happens. This is the raw material.

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  project_id TEXT REFERENCES projects(id),
  event_type TEXT,                  -- see Event Types below
  timestamp TEXT,
  hostname TEXT,
  payload TEXT,                     -- JSON: event-specific data
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Git Snapshots

Captured at meaningful state transitions, not just session end.

```sql
CREATE TABLE git_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  project_id TEXT REFERENCES projects(id),
  timestamp TEXT,
  branch TEXT,
  commit_hash TEXT,
  commit_message TEXT,
  has_uncommitted_changes INTEGER,  -- boolean
  uncommitted_summary TEXT,         -- output of `git status --porcelain`
  trigger TEXT,                     -- what caused this snapshot: "session_start" | "session_end" | "commit" | "branch_switch" | "pr_created" | "heartbeat"
  metadata TEXT                     -- JSON: PR URL if applicable, etc.
);
```

### Checkpoints

Continuity handoff summaries written by Claude Code itself (not an external API call). Generated automatically at meaningful moments (PR created, merge) and manually via `/lattice-tracker:checkpoint`.

```sql
CREATE TABLE checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  project_id TEXT REFERENCES projects(id),
  timestamp TEXT,
  summary TEXT,                     -- 2-3 sentence human-readable summary
  in_progress TEXT,                 -- what's actively being worked on
  blocked_on TEXT,                  -- what's blocking, if anything
  next_steps TEXT,                  -- what comes next
  trigger TEXT,                     -- "manual" | "pr_created" | "merge" | etc.
  branch TEXT,
  last_commit TEXT,                 -- short hash + message
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Event Types

Events emitted by hooks → received by the API.

| Event Type | Hook Source | Trigger | Key Payload Fields |
|---|---|---|---|
| `session.start` | SessionStart | Session begins | `session_id`, `cwd`, `hostname`, `interface` |
| `session.end` | SessionEnd | Session ends | `session_id`, `reason`, `summary` (if generated) |
| `session.heartbeat` | Cron or Notification | Periodic (every 2–5 min while active) | `session_id`, `status` |
| `session.waiting` | Notification | Agent needs input | `session_id`, `message` |
| `git.snapshot` | PostToolUse (Bash) | Git state change detected | `branch`, `commit_hash`, `uncommitted_summary`, `trigger` |
| `git.commit` | PostToolUse (Bash) | `git commit` detected | `commit_hash`, `commit_message`, `branch` |
| `git.branch_switch` | PostToolUse (Bash) | `git checkout`/`git switch` detected | `old_branch`, `new_branch` |
| `git.pr_created` | PostToolUse (Bash) | `gh pr create` detected | `pr_url`, `pr_title`, `branch` |
| `session.checkpoint` | Stop hook (auto) or slash command (manual) | Meaningful moment or user-initiated | `session_id`, `summary`, `trigger_reason` |
| `project.tag` | Manual (CLI/dashboard) | User tags a project | `client_tag`, `display_name` |

---

## Hook Implementation

### Global hooks (`~/.claude/settings.json`)

All hooks live in `~/.claude/hooks/lattice/` and share a common event-emitting function.

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "~/.claude/hooks/lattice/session-start.sh"
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "~/.claude/hooks/lattice/session-end.sh"
      }]
    }],
    "Notification": [{
      "hooks": [{
        "type": "command",
        "command": "~/.claude/hooks/lattice/notification.sh"
      }]
    }],
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/hooks/lattice/post-tool-use.sh"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "~/.claude/hooks/lattice/stop.sh"
      }]
    }]
  }
}
```

### Hook script behavior

**`session-start.sh`:**
1. Read JSON from stdin (contains `session_id`, `cwd`)
2. Detect project identity (git remote URL or fallback)
3. Detect interface (check `$TERM_PROGRAM`, `$VSCODE_PID`, etc.)
4. Capture initial git snapshot
5. POST `session.start` + `git.snapshot` to VPS API

**`session-end.sh`:**
1. Read JSON from stdin
2. Capture final git snapshot
3. POST `session.end` + `git.snapshot` to VPS API
4. No summary generation here — summaries come from checkpoints (see below)

**`notification.sh`:**
1. Read JSON from stdin (contains `message`)
2. If message indicates waiting for input → POST `session.waiting` event
3. Continue to also trigger existing terminal-notifier setup (don't replace, augment)

**`post-tool-use.sh`:**
1. Read JSON from stdin (contains `tool_input.command`)
2. Pattern match against git-meaningful commands:
   - `git commit` → capture snapshot, POST `git.commit`
   - `git checkout`/`git switch` → POST `git.branch_switch` + snapshot
   - `gh pr create` → POST `git.pr_created` + snapshot + set `checkpoint_suggested` flag (see Stop hook)
   - `git push` → capture snapshot (informational)
3. For non-git commands: exit 0 immediately (fast path — this fires on every Bash call)
4. When a checkpoint-worthy event is detected (PR created, merge, etc.), write a flag file to `.lattice-tracker/checkpoint-suggested` with the trigger reason

**`stop.sh` (auto-checkpoint evaluation):**
The Stop hook fires after every Claude Code response. It checks whether an automatic checkpoint should be requested.

1. Read JSON from stdin
2. Check if `.lattice-tracker/checkpoint-suggested` flag file exists (set by post-tool-use when a PR was created, a merge happened, etc.)
3. If flag exists:
   - Read the trigger reason from the flag file
   - Return `additionalContext` asking Claude Code to write a checkpoint summary (see Checkpoint Skill below)
   - Remove the flag file
4. If no flag: exit 0 immediately (fast path — this fires after every response, must be near-zero cost)

The flow: PostToolUse detects a meaningful event → writes flag → Stop hook reads flag → injects context asking Claude to write checkpoint → Claude writes summary to `.lattice-tracker/last-checkpoint.json` → next PostToolUse or a background watcher picks up the file and POSTs it to the API.

### Checkpoint System

Checkpoints are the continuity handoff mechanism. They capture "what was I doing and where did I leave off" at meaningful moments. They come from two sources:

**Automatic checkpoints (Stop hook):**
Triggered when the Stop hook detects a flag set by PostToolUse. Current auto-checkpoint triggers:
- PR created (`gh pr create`)
- Branch merge completed
- More triggers can be added over time without changing the architecture

When triggered, the Stop hook injects `additionalContext` that asks Claude Code to write a checkpoint. Claude Code has the full session context in its window, so the summary is high-quality and free (no additional API call). The injected context references the Lattice checkpoint skill for formatting instructions.

**Manual checkpoints (`/lattice-tracker:checkpoint` slash command):**
The user runs `/lattice-tracker:checkpoint` (or `/lc` as an alias) when they're about to step away, switch contexts, or just want to mark a moment. The slash command invokes the checkpoint skill, which tells Claude Code to:

1. Write a 2–3 sentence summary of the current session state
2. Note what's in progress, what's blocked, and what the likely next step is
3. Capture current git state
4. Write everything to `.lattice-tracker/last-checkpoint.json`
5. POST the checkpoint to the Lattice API

**Checkpoint skill (`~/.claude/skills/lattice-tracker:checkpoint/SKILL.md`):**

```markdown
# Lattice Checkpoint

Write a checkpoint summary for the current session. This helps future sessions
(possibly on a different machine) pick up where we left off.

## Output

Write to `.lattice-tracker/last-checkpoint.json`:

{
  "timestamp": "<ISO 8601>",
  "summary": "<2-3 sentences: what we were working on and current state>",
  "in_progress": "<what's actively being worked on, if anything>",
  "blocked_on": "<what's blocking progress, if anything — null if nothing>",
  "next_steps": "<what would logically come next>",
  "trigger": "<'manual' or the auto-trigger reason like 'pr_created'>",
  "branch": "<current git branch>",
  "last_commit": "<short hash + message of HEAD>"
}

## Guidelines

- Be specific: "Implementing SSO token refresh for INCOSE iMIS integration"
  not "Working on SSO stuff"
- Include names: plugin names, function names, file paths that would help
  someone (or a future Claude session) orient quickly
- If there are uncommitted changes, mention what they contain
- Keep it concise — this is a signpost, not documentation

After writing the file, POST it to the Lattice API:

curl -s -X POST "$LATTICE_API_URL/api/events" \
  -H "Authorization: Bearer $LATTICE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg sid "$CLAUDE_SESSION_ID" \
    --slurpfile cp .lattice-tracker/last-checkpoint.json \
    '{event_type: "session.checkpoint", session_id: $sid, payload: $cp[0]}')"
```

**Checkpoint display in dashboard:**
The most recent checkpoint for each project is shown prominently — it's the primary "where did I leave off" context. The "Continue in Claude Code" block on the project detail view pulls from the latest checkpoint.

**Checkpoint display at session start:**
The SessionStart hook checks the API for the most recent checkpoint for the current project and injects it as `additionalContext`, so Claude Code begins the session already knowing what happened last time.

### Heartbeat

A lightweight cron job (or launchd plist on macOS) that runs every 3 minutes on each machine:

1. Check for active Claude Code processes
2. For each active session, POST `session.heartbeat` with status
3. If a previously-active session's process is gone and no `session.end` was received → POST `session.end` with `reason: "process_disappeared"` and `status: "abandoned"`

This catches the case where a session dies without triggering SessionEnd (crash, force quit, machine restart).

---

## API Endpoints

### Event Ingestion

```
POST /api/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "event_type": "session.start",
  "session_id": "abc123",
  "project_id": "github.com/yokoco/incose-sso",
  "hostname": "sarahs-macbook",
  "timestamp": "2026-03-26T10:30:00Z",
  "payload": { ... }
}
```

The API handles upserts: if a `session.start` arrives for a project_id that doesn't exist yet, the project is auto-created with the git remote URL as the canonical name.

### Query Endpoints

```
GET /api/projects
  ?status=active|idle|all         -- filter by whether project has active sessions
  ?client_tag=yokoco:incose       -- filter by client tag
  ?q=incose                       -- fuzzy search on name/display_name

GET /api/projects/:id
  -- full project detail including recent sessions and latest git snapshot

GET /api/projects/:id/sessions
  ?limit=20&offset=0

GET /api/sessions
  ?status=active|waiting_for_input|all
  ?hostname=sarahs-macbook
  ?device_label=laptop

GET /api/sessions/:id
  -- full session detail including all events and git snapshots

GET /api/sessions/:id/events

GET /api/snapshots
  ?project_id=...
  ?trigger=pr_created

PATCH /api/projects/:id
  -- update display_name, client_tag
```

### Agent-Native: CLI Query Interface

Claude Code instances should be able to query Lattice. A simple shell function or slash command:

```bash
# "What was I working on?"
curl -s "$LATTICE_URL/api/projects?status=active" | jq '.[] | {name: .display_name, device: .last_session.device_label, branch: .last_snapshot.branch}'

# "What's the status of INCOSE?"
curl -s "$LATTICE_URL/api/projects?q=incose" | jq '.'
```

This could also be wrapped as a Claude Code slash command (`/lattice status`, `/lattice projects`) or an MCP server for richer integration later.

---

## Dashboard

### Views

**Main view: Project list (default)**
- Card or row per project
- Shows: display name (or canonical name), client tag (color-coded), last activity timestamp, current status indicator, device/interface of last session, current branch, link to git remote
- Status indicators: 🟢 active session, 🟡 waiting for input, ⚪ idle, 🔴 abandoned (has uncommitted work)
- Sort by: last activity (default), name, client tag
- Filter by: client tag, status, device

**Project detail view:**
- Project info header (name, git remote link, client tag — editable)
- Current git state (branch, last commit, uncommitted changes)
- Session history (reverse chronological)
  - Each session shows: device, interface, start/end time, duration, status, summary (if available), last prompt
  - Expandable to show git snapshots within the session
- "Continue in Claude Code" context block: pulls from the latest checkpoint — shows summary, in-progress work, blockers, next steps, branch, and last commit. Designed to paste into a new Claude Code session as context (though the SessionStart hook does this automatically).

**Active sessions view:**
- All currently-active and waiting-for-input sessions across all machines
- This is the "mission control" view when bouncing between multiple agents
- Shows: project name, device, how long active, last prompt, status
- Waiting-for-input sessions visually prominent (pulsing border, top of list, etc.)

### Design notes
- Mobile-friendly (you'll check this from your phone)
- Dark mode default
- Auto-refresh active sessions view (polling every 10–15 seconds, or SSE/WebSocket if we want real-time)
- Lightweight — no heavy framework. Vanilla JS + a tiny reactive layer (Preact or Alpine.js), or even a static HTML page with fetch + DOM manipulation.

---

## Security

- API protected by a bearer token (stored in 1Password, shared across machines via environment variable)
- HTTPS via Let's Encrypt on the VPS (or Hostinger's built-in SSL)
- No sensitive data in events (no code content, no full prompts — just the last prompt text and git metadata)
- Token rotation: manual for now, can automate later
- The git archive repo is private on GitHub

---

## Git Archive Export

A cron job on the VPS (daily or hourly):

1. Export SQLite tables to JSONL files: `projects.jsonl`, `sessions.jsonl`, `events.jsonl`, `git_snapshots.jsonl`
2. Commit to the private GitHub repo
3. Push

This gives you:
- Full history in a portable format
- Ability to do offline analysis (grep, jq, load into a notebook)
- Backup independent of the VPS
- The repo is also the open-source artifact — the schema and export scripts are part of the Lattice repo itself

---

## Configuration

### Per-machine config (`~/.config/lattice/config.json`)

```json
{
  "api_url": "https://lattice-tracker.yourdomain.com",
  "api_token": "...",
  "device_label": "laptop",
  "hostname_override": null
}
```

### On the VPS (`/etc/lattice-tracker/config.json` or environment variables)

```json
{
  "port": 3377,
  "db_path": "/var/lib/lattice-tracker/lattice.db",
  "git_archive_repo": "git@github.com:sarahdev/lattice-tracker-data.git",
  "git_archive_schedule": "0 * * * *",
  "hostname_labels": {
    "sarahs-macbook": "laptop",
    "sarahs-desktop": "desktop",
    "vps-hostname": "vps"
  }
}
```

---

## Installation & Setup

### On each machine:

1. Clone the Lattice repo
2. Run `./install-hooks.sh` which:
   - Copies hook scripts to `~/.claude/hooks/lattice/`
   - Merges hook configuration into `~/.claude/settings.json` (non-destructively — preserves existing hooks)
   - Creates `~/.config/lattice/config.json` with prompts for API URL, token, device label
   - Sets up the heartbeat cron job / launchd plist
3. Start a Claude Code session — the first `session.start` event auto-creates the project

### On the VPS:

1. Clone the Lattice repo
2. `npm install`
3. Configure environment / config file
4. Run with pm2 or systemd
5. Set up the git archive cron job

---

## Open Source Structure

```
lattice-tracker/
├── README.md
├── LICENSE                            -- MIT
├── .claude-plugin/
│   └── plugin.json                    -- plugin manifest (name: lattice-tracker)
├── skills/
│   └── checkpoint/
│       └── SKILL.md                   -- checkpoint summary skill
├── commands/
│   ├── status.md                      -- /lattice-tracker:status slash command
│   └── where.md                       -- /lattice-tracker:where slash command
├── hooks/
│   ├── hooks.json                     -- hook event configuration
│   └── scripts/
│       ├── session-start.sh
│       ├── session-end.sh
│       ├── notification.sh
│       ├── post-tool-use.sh
│       ├── stop.sh                    -- auto-checkpoint evaluation
│       ├── heartbeat.sh
│       └── lib/
│           ├── emit-event.sh          -- shared: POST to API
│           ├── detect-project.sh      -- shared: git remote → project ID
│           └── detect-interface.sh    -- shared: terminal vs vscode detection
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js                   -- Fastify server entry
│   │   ├── routes/
│   │   │   ├── events.js              -- POST /api/events
│   │   │   ├── projects.js            -- GET/PATCH /api/projects
│   │   │   └── sessions.js            -- GET /api/sessions
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── queries.js             -- query helpers
│   │   └── services/
│   │       ├── project-resolver.js    -- git remote → project ID logic
│   │       └── git-archive.js         -- export + push
│   └── dashboard/
│       ├── index.html
│       ├── style.css
│       └── app.js
└── docs/
    ├── setup.md
    ├── api.md
    └── event-schema.md                -- documented for agent-agnostic adapters
```

---

## Agent-Native Design Notes

Lattice itself follows agent-native principles:

**Parity:** Everything visible in the dashboard is queryable via API. Claude Code can ask "what was I working on?" and get the same data a human sees.

**Granularity:** Events are atomic. The API doesn't bundle "start session + create project + snapshot git" into one call — each is a separate event that the hook scripts compose.

**Composability:** A Claude Code slash command like `/lattice-tracker:where incose` is just a curl + jq composition of the API. New queries don't require new API endpoints.

**Emergent capability:** Because the event log is append-only and comprehensive, future analysis (time tracking, productivity patterns, cost attribution) can be built without changing the event-emitting hooks.

**Improvement over time:** The `client_tag` and `display_name` fields are user-enrichment on auto-discovered data. The system gets more useful as the user invests in naming and tagging, but works from minute one without any setup.

---

## Future Considerations (Not v1)

- **MCP server** wrapping the API for richer Claude Code integration
- **Push notifications** via ntfy or Telegram when a session has been waiting for input >5 minutes
- **Cost tracking** by pairing with ccusage data
- **Time tracking export** using client_tag + session durations → CSV for billing
- **Claude.ai conversation links** — a lightweight "link this to a project" mechanism from the dashboard
- **Multi-user support** (if Yoko Co colleagues want to use it)
- **Session replay** — store enough context to reconstruct what happened (beyond just the summary)

---

## Naming

**Lattice** — a structure of interconnected points. Projects, sessions, devices, all connected through the event mesh. Also: lightweight, open, visible through.

- Display name: **Lattice**
- GitHub repo: `lattice-tracker`
- npm package: `lattice-tracker`
- Plugin name in plugin.json: `lattice-tracker`
- Slash commands: `/lattice:checkpoint`, `/lattice:status`, `/lattice:where`
- Config directory: `~/.config/lattice/`
- Project-local directory: `.lattice/`
