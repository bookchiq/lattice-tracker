---
title: "feat: Lattice Tracker v1 Implementation"
type: feat
status: active
date: 2026-03-26
---

# feat: Lattice Tracker v1 Implementation

## Enhancement Summary

**Deepened on:** 2026-03-26
**Research agents used:** architecture-strategist, security-sentinel, performance-oracle, agent-native-reviewer, data-integrity-guardian, deployment-verification-agent, code-simplicity-reviewer, call-chain-verifier, pattern-recognition-specialist, bash-hooks-researcher, vanilla-js-spa-researcher

### Critical Bugs Found (Would Not Work As Designed)

1. **PID storage in active-session files** — Hook script PID (`$$`) dies immediately; heartbeat would mark every session as abandoned. Must store Claude Code's PID via `$PPID`.
2. **Project ID contains slashes** — `github.com/owner/repo` breaks URL path segments (`/api/projects/github.com/owner/repo/checkpoints` → 404). Must URL-encode or change ID format.
3. **Checkpoint never reaches API** — Plan describes "background watcher picks up file" but no watcher exists. The skill's embedded curl command is the actual delivery mechanism.
4. **Foreign key ordering** — `INSERT INTO events` with `session_id` FK before `INSERT INTO sessions` row → constraint violation. Must upsert session first.
5. **`session.heartbeat` not wired** — Event handler never calls `updateSessionHeartbeat()`, so `last_heartbeat_at` is never updated and stale-session cleanup breaks.
6. **`stop.sh` sources config + invokes jq on every response** — Fork costs 5-10ms per invocation, blowing the 10ms budget. Must use pure bash on the fast path.

### Key Simplifications Applied

- Removed git archive export service (Phase 5) — replaced with one-line `sqlite3 .backup` cron
- Removed `metadata TEXT` columns from all tables — YAGNI; use `ALTER TABLE ADD COLUMN` when needed
- Removed server-side `?q=` fuzzy search — 10-15 projects, filter client-side
- Removed dedicated `snapshots.js` route — access through project/session endpoints
- Removed `.lattice-project` override file — only git-remote and path-hash for v1
- Consolidated hook libraries from 5 to 2 (`common.sh` + `git-snapshot.sh`)
- Inlined interface detection into `session-start.sh` (5 lines, called once)

---

## Overview

Build the complete Lattice Tracker system from the existing spec (`docs/plans/lattice-spec.md`): a cross-device Claude Code session and project tracker consisting of Claude Code hooks, a Fastify API with SQLite storage, and a web dashboard. This plan addresses spec gaps discovered during analysis and organizes work into four phases.

## Problem Statement

When working with Claude Code across multiple machines and interfaces, there's no unified way to answer "where was I?", "what's waiting for input?", or "what's the git state of each project?" Lattice solves this with event-driven tracking and a continuity checkpoint system.

## Proposed Solution

Implement the full system as specified, with the following clarifications for gaps found during spec analysis and deepening research:

### Spec Gap Resolutions

**Hook failure strategy:** Fire-and-forget with `--max-time 3 --connect-timeout 2` on all curl calls. Failed events are logged to `~/.config/lattice/failed-events.log` (append-only, one JSON line per failure). No local queue or retry for v1 — keep hooks simple.

**Heartbeat session discovery:** `session-start.sh` writes `~/.config/lattice/active-sessions/<session_id>.json` containing `{project_id, hostname, started_at, ppid}` (note: `ppid` = Claude Code process PID via `$PPID`, NOT the hook script's own PID). `session-end.sh` removes it. The heartbeat cron scans this directory. The active-session file also stores `ppid_start_time` (from `ps -p $PPID -o lstart=`) to detect PID reuse.

**Naming:** Use `.lattice/` everywhere (project-local directory). Plugin name in `plugin.json`: `lattice` (not `lattice-tracker`) so slash commands are `/lattice:checkpoint`, `/lattice:status`, `/lattice:where`. Config: `~/.config/lattice/`. Add `.lattice/` to `.gitignore` recommendations.

**Session state machine:**
```
            session.start
                │
                ▼
  ┌──────── active ◄─────────┐
  │            │              │
  │   notification(waiting)   │  any non-waiting event for this session
  │            │              │
  │            ▼              │
  │   waiting_for_input ──────┘
  │            │
  │     session.end          heartbeat timeout (>10min)
  │            │                    │
  │            ▼                    ▼
  │       completed            abandoned
  │
  │     session.end
  └──────► completed
```
`paused` is removed from v1 — no trigger exists for it. `waiting_for_input → active` transitions implicitly when the server receives any event (except `session.waiting`) for that session. Session state transitions are validated server-side — invalid transitions (e.g., `completed → active`) are rejected.

**Project ID format:** Normalize git remote URLs but replace `/` with `:` to produce URL-safe IDs. Output format: `github.com:owner:repo`. Algorithm: normalize, then `replace(/\//g, ':')`. This avoids URL-encoding issues when project IDs appear in API path segments.

### Research Insights: Project ID

> The original plan used `github.com/owner/repo` which contains forward slashes, breaking every URL path that uses project_id as a segment (`/api/projects/github.com/owner/repo/checkpoints` → 404). The colon delimiter is URL-safe and unambiguous. Test cases: `git@github.com:owner/repo.git` → `github.com:owner:repo`, `https://github.com/owner/repo` → `github.com:owner:repo`, `ssh://git@github.com:2222/owner/repo.git` → `github.com:owner:repo`.

**Missing endpoints added:**
- `GET /api/health` — returns `{ ok: true, version: "0.1.0" }` (no uptime — avoid leaking server metadata)
- `GET /api/projects/:id/checkpoints?limit=1` — latest checkpoint for continuity injection
- `POST /api/events/batch` — accepts array of events; **hooks MUST use this as default for multi-event submissions** (session-start, session-end, post-tool-use git events, heartbeat)

**Dashboard auth:** Bearer token passed via URL hash fragment (`#token=...`) on first visit, stored in `sessionStorage` (not `localStorage` — cleared on tab close). After reading, immediately clear hash with `history.replaceState()`. Add a "Logout" button that clears the token.

### Research Insights: Dashboard Security

> `sessionStorage` is preferred over `localStorage` for auth tokens — tokens are automatically cleared when the tab closes, limiting the window of exposure. A strict Content-Security-Policy (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`) is the primary XSS defense. The `history.replaceState()` call after reading the hash prevents the token from persisting in the address bar or browser history.

**SQLite indexes:** Added to schema for all foreign keys and common query patterns.

**JSON parsing in hooks:** Use `jq` for JSON construction and multi-field extraction. For hot-path hooks (`stop.sh`), use pure Bash string matching to avoid `jq` fork overhead.

**Environment variable loading:** Use Node.js 20+ `--env-file` flag for server. Hooks read from `~/.config/lattice/config.env` (sourceable shell file generated alongside `config.json` by install script).

### Research Insights: Hook Performance

> Each `jq` invocation costs ~5-10ms (fork + exec + parse) on macOS. `stop.sh` fires after every Claude Code response — it MUST NOT invoke `jq` or source config files on its fast path. Instead, check the flag file existence first (stat syscall, ~0.1ms), and only source/parse if work is needed. Generate a sourceable `config.env` file alongside `config.json` during installation so hooks can `source` shell vars (~1ms) instead of calling `jq` (~5-10ms).

## Technical Approach

### Architecture

Three-component system with unidirectional data flow:
```
Claude Code hooks (each machine) → POST /api/events → Fastify API (VPS) → SQLite → Dashboard (SPA)
```

**Architectural constraints:**
- **Single Fastify process only** — no pm2 cluster mode. SQLite with better-sqlite3 uses synchronous writes; multiple processes cause `SQLITE_BUSY` errors.
- **Server is the canonical normalizer** for project IDs. The hook's normalization is best-effort; the server re-normalizes on ingestion.
- **`session-start.sh` is the only hook that reads from the API** (checkpoint fetch). All other hooks are pure producers. If the API is down, session-start still emits its events (fire-and-forget) but skips checkpoint injection.

**Tech stack:**
- Server: Fastify 5.8.x, better-sqlite3 12.x, @fastify/rate-limit, Node.js 20+, ESM modules
- Hooks: Bash scripts with `jq` for JSON parsing, `curl` for HTTP
- Dashboard: Vanilla JS + minimal CSS, dark mode, no framework
- Auth: Bearer token (single token for v1, shared read/write)

### Implementation Phases

#### Phase 1: Server Foundation

Server entry point, database, schema, event processing service, and all API endpoints.

**Tasks:**

- [x] Initialize `server/package.json` with Fastify 5.8.x, better-sqlite3 12.x, @fastify/static, @fastify/cors, @fastify/rate-limit, fastify-plugin
  - `"type": "module"` for ESM
  - `"scripts": { "start": "node --env-file=.env src/index.js", "dev": "node --env-file=.env --watch src/index.js" }`
  - `"engines": { "node": ">=20.0.0" }`

- [x] Create `server/src/plugins/db.js` — Fastify plugin wrapping better-sqlite3
  - WAL mode, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `cache_size = -20000`
  - Migration system using `PRAGMA user_version`: check version on startup, run unapplied migrations in order, each wrapped in a transaction
  - Initial migration (version 1): execute `schema.sql`
  - `fastify.decorate('db', db)` via `fastify-plugin` (breaks encapsulation)
  - Close DB in `onClose` hook
  - On startup: mark sessions with `status = 'active'` and `last_heartbeat_at` older than 10 minutes as `abandoned` (single SQL statement, replaces the need for a separate cron)

### Research Insights: SQLite Migration

> Using `PRAGMA user_version` for migration tracking avoids needing a separate `_migrations` table. On startup, check the version and run any unapplied migrations in sequence. Each migration is wrapped in `db.transaction()` for atomicity. This is essential because `CREATE TABLE IF NOT EXISTS` alone does not handle column additions, index changes, or schema evolution.

- [x] Create `server/src/db/schema.sql` — all five tables (without `metadata` columns) plus indexes
  ```sql
  -- Tables: projects, sessions, events, git_snapshots, checkpoints
  -- Remove 'metadata TEXT' columns from all tables (YAGNI)
  -- Remove 'paused' from sessions status comment
  -- Remove 'last_prompt' from sessions (no hook populates it)
  -- Add client_event_id TEXT to events table (nullable, UNIQUE when present — for future idempotency)

  CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
  CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events(event_type, timestamp);
  CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_project_status ON sessions(project_id, status);
  CREATE INDEX IF NOT EXISTS idx_git_snapshots_project_id ON git_snapshots(project_id);
  CREATE INDEX IF NOT EXISTS idx_git_snapshots_session_id ON git_snapshots(session_id);
  CREATE INDEX IF NOT EXISTS idx_checkpoints_project_id_timestamp ON checkpoints(project_id, timestamp DESC);
  ```

### Research Insights: Schema Changes

> - Removed `metadata TEXT` columns from all tables — premature "future extensibility" that clutters the schema. When a concrete need arises, use `ALTER TABLE ADD COLUMN`.
> - Removed `last_prompt` from sessions — no hook captures prompt text and no mechanism exists to populate it. Ghost schema.
> - Added `client_event_id` (nullable, unique when present) to events table — enables idempotent event processing when retry logic is added in v2. Hooks don't populate it yet, but the column is ready.
> - Added composite index `idx_sessions_project_status` for the common "active sessions for this project" query.
> - All foreign keys should use explicit `ON DELETE RESTRICT` to make the no-cascade intent clear.

- [x] Create `server/src/db/queries.js` — prepared statement helpers
  - **CRITICAL:** Prepare all statements once at module load via `db.prepare()`, cache as module-level variables, and reuse. Never call `db.prepare()` per-request.
  - Separate "statement" functions (designed to run inside a caller's transaction) from "standalone" functions (wrap their own transaction)
  - All `LIKE` queries must escape `%` and `_` wildcards in user input
  - All list queries must accept `limit`/`offset` parameters with sensible defaults
  - Checkpoint ordering: `ORDER BY timestamp DESC, id DESC` (tiebreaker for simultaneous checkpoints)
  - Statement helpers:
    - `insertEvent(event)` — returns `lastInsertRowid`
    - `upsertProject({id, git_remote_url, canonical_name, last_activity_at})` — INSERT ON CONFLICT UPDATE, **always update `last_activity_at`**
    - `upsertSession({id, project_id, hostname, interface, device_label, status, started_at})`
    - `updateSessionStatus(id, status, ended_at?)` — **validates state transition** before updating
    - `updateSessionHeartbeat(id, last_heartbeat_at, status?)`
    - `insertGitSnapshot({...})`
    - `insertCheckpoint({...})`
    - `getProjects(filters)`, `getProjectById(id)`, `updateProject(id, fields)`
    - `getSessions(filters)` — support `?status=active,waiting_for_input` (comma-separated multi-value)
    - `getSessionById(id)`
    - `getEventsBySessionId(session_id, {limit, offset})`
    - `getLatestCheckpoint(project_id)`

- [x] Create `server/src/plugins/auth.js` — bearer token validation
  - Wrap with `fastify-plugin` (same as db.js — needs to be visible across all route scopes)
  - `onRequest` hook, skip for non-`/api/` paths and `GET /api/health`
  - Compare against `process.env.LATTICE_API_TOKEN`
  - Fail fast on startup if `LATTICE_API_TOKEN` is not set

- [x] Create `server/src/plugins/config.js` — centralize environment variable validation
  - Validate required env vars on startup: `LATTICE_API_TOKEN`
  - Default `PORT` to 3377, `DB_PATH` to `./lattice.db`
  - Decorate `fastify.config` with validated values

- [x] Create `server/src/services/event-processor.js` — event processing logic extracted from route
  - Single `processEvent(db, event)` function wrapping a `db.transaction()`
  - Transaction order for `session.start`: upsert project → **upsert session** → insert event (FK-safe order)
  - Transaction order for all other events: upsert project (update `last_activity_at`) → insert event → type-specific side effects
  - Side-effect dispatch map:
    - `session.start` → upsert session
    - `session.end` → update session status to `completed`, set `ended_at`
    - `session.heartbeat` → update `last_heartbeat_at`, transition `waiting_for_input → active` if payload status is `active`
    - `session.waiting` → update session status to `waiting_for_input`
    - `session.checkpoint` → insert into checkpoints table
    - `git.snapshot` → insert into git_snapshots table
    - `git.commit` → insert into git_snapshots with trigger `commit`
    - `git.branch_switch` → insert into git_snapshots with trigger `branch_switch`
    - `git.pr_created` → insert into git_snapshots with trigger `pr_created`
    - `project.tag` → update project display_name/client_tag
  - **Implicit `waiting_for_input → active` transition:** When any non-waiting event arrives for a session currently in `waiting_for_input`, transition to `active`
  - `session.end` is idempotent: if session is already `completed` or `abandoned`, ignore silently

### Research Insights: Transaction Ordering

> The original plan had event insertion before session creation, which violates the `events.session_id REFERENCES sessions(id)` foreign key constraint. The corrected order: upsert project → upsert session → insert event → side effects. This ensures FK references exist before the event row is created. All side effects run in the same `db.transaction()` for atomicity.

- [x] Create `server/src/services/project-resolver.js` — git remote URL → project ID
  - Normalize: strip protocol/auth/port, replace `:` with `/`, strip `.git`, lowercase, then replace `/` with `:`
  - Output: `github.com:owner:repo` (URL-safe, no slashes)
  - Test cases: SSH, HTTPS, HTTPS+.git, SSH+port, GitLab/Bitbucket URLs

- [x] Create `server/src/routes/events.js` — `POST /api/events` and `POST /api/events/batch`
  - JSON Schema validation with `bodyLimit: 1048576` (1MB for single, 5MB for batch)
  - Batch: `maxItems: 50` in JSON Schema
  - String field `maxLength` constraints: `payload` (65536), `uncommitted_summary` (32768)
  - Delegate to `event-processor.js` for all processing logic
  - Return `{ ok: true, event_id }` (or array for batch)

- [x] Create `server/src/routes/projects.js`
  - `GET /api/projects` — filterable by `status` (active sessions exist?), `client_tag`. Return all projects, let dashboard filter/search client-side.
  - `GET /api/projects/:id` — full detail with latest session, latest snapshot, latest checkpoint
  - `GET /api/projects/:id/sessions` — paginated (default limit 20)
  - `GET /api/projects/:id/checkpoints` — paginated (default limit 1)
  - `PATCH /api/projects/:id` — update `display_name`, `client_tag`

- [x] Create `server/src/routes/sessions.js`
  - `GET /api/sessions` — filterable by `status` (comma-separated: `active,waiting_for_input`), `hostname`, `device_label`
  - `GET /api/sessions/:id` — full detail with events (paginated) and snapshots
  - `GET /api/sessions/:id/events` — paginated (default limit 100)

- [x] Create `server/src/routes/health.js`
  - `GET /api/health` — `{ ok: true, version: "0.1.0" }` (no uptime — avoid information disclosure)

- [x] Create `server/src/index.js` — server entry point
  - Register plugins in order: cors → config → db → auth → rate-limit → static → routes
  - CORS: explicit origin from `process.env.LATTICE_DASHBOARD_ORIGIN` (not wildcard)
  - Rate limit: 100 req/min for authenticated endpoints, 5 failures/min per IP for failed auth
  - Security headers via `onSend` hook: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
  - Handle SIGTERM/SIGINT → call `fastify.close()` for clean SQLite WAL checkpointing
  - Listen on `fastify.config.port`, host `0.0.0.0`
  - Fastify logger enabled

- [x] Add `server/.gitignore` — `node_modules/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env`

**Acceptance criteria:**
- [x] `npm install` in `server/` succeeds
- [x] `npm run dev` starts the server on port 3377
- [x] `POST /api/events` accepts and stores an event, auto-creates project
- [x] `POST /api/events/batch` processes multiple events atomically
- [x] `GET /api/projects` returns the auto-created project with `last_activity_at` set
- [x] `GET /api/health` returns 200 without auth
- [x] Requests without valid bearer token get 401
- [x] Dashboard static files are served at `/`
- [x] SIGTERM triggers clean shutdown
- [x] Server refuses to start without `LATTICE_API_TOKEN`

#### Phase 2: Hook Scripts

Bash hook scripts that emit events to the Lattice API, plus the checkpoint system.

**Tasks:**

- [x] Create `hooks/scripts/lib/common.sh` — consolidated shared library (config + emit + detect-project)
  - Source `~/.config/lattice/config.env` (shell vars, not JSON — avoids jq fork)
  - Provide `lattice_log()` function that appends to `~/.config/lattice/lattice-hooks.log`
  - Provide `lattice_emit()` function: accepts event JSON, POSTs via curl with `--max-time 3 --connect-timeout 2`
    - Construct curl payloads exclusively via `jq` (never string interpolation — prevents shell injection)
    - On curl failure: append to `~/.config/lattice/failed-events.log`
    - All exported variables must be double-quoted in all contexts
  - Provide `lattice_emit_batch()` function: accepts JSON array, POSTs to `/api/events/batch`
  - Provide `lattice_detect_project()` function:
    - Try `git remote get-url origin`, normalize to colon-delimited format
    - Fallback: sha256 hash of `$(hostname):$(pwd)`
  - Define `LATTICE_HOOKS_DIR` as `$(dirname "$0")/..` for relative library sourcing
  - Use `set -o pipefail` only (not `set -euo pipefail` — `set -e` conflicts with fire-and-forget curl, `set -u` conflicts with optional JSON fields)

### Research Insights: Hook Script Standards

> - `set -euo pipefail` conflicts with fire-and-forget hooks: `set -e` causes the script to exit on curl failure before reaching the error logging. Use `set -o pipefail` only.
> - All `jq`-extracted values must be assigned via `var=$(jq -r '.field' <<< "$input")` and always double-quoted: `"$var"`. Never use string interpolation to build curl `-d` payloads — this is a shell injection vector.
> - Extract multiple fields in one `jq` call (one fork) instead of N separate calls: `read -r TOOL CMD <<< "$(echo "$INPUT" | jq -r '[.tool_name, .tool_input.command // ""] | @tsv')"`.
> - For `sessionStorage` over `localStorage`, `pipefail` over `set -e`, and other choices: these come from security and Bash best-practices research during plan deepening.

- [x] Create `hooks/scripts/lib/git-snapshot.sh` — capture current git state
  - Output JSON: `{ branch, commit_hash, commit_message, has_uncommitted_changes, uncommitted_summary }`
  - Batch all four git commands' output construction into a single `jq -n` call where possible

- [x] Create `hooks/scripts/session-start.sh`
  - Read JSON from stdin (`session_id`, `cwd`, `source`)
  - Source `common.sh`, detect project
  - Detect interface inline (5 lines: check `$VSCODE_PID` → `"vscode"`, check `$TERM_PROGRAM` → value, default → `"terminal"`)
  - Capture git snapshot
  - Write `~/.config/lattice/active-sessions/<session_id>.json` with `{project_id, hostname, started_at, ppid: $PPID, ppid_start_time}` using atomic write (write to temp file, then `mv`)
  - **Use batch endpoint:** Emit `session.start` + `git.snapshot` as a single `POST /api/events/batch`
  - Fetch latest checkpoint with **reduced timeout**: `--max-time 1 --connect-timeout 0.5`
    - URL-encode project_id or use query param: `GET /api/projects/:id/checkpoints?limit=1`
    - On failure: skip silently (checkpoint injection is best-effort)
    - Cache response to `~/.config/lattice/last-checkpoint/<project_id>.json` for offline fallback
  - If checkpoint exists, output JSON with `hookSpecificOutput.hookEventName: "SessionStart"` and `additionalContext` containing:
    - The checkpoint summary
    - Available slash commands: `/lattice:checkpoint`, `/lattice:status`, `/lattice:where`, `/lattice:project <name>`, `/lattice:tag <project> <tag>`
    - The `LATTICE_API_URL` for ad-hoc agent queries
    - Count of active/waiting sessions across other projects (if fetch succeeds)

### Research Insights: Session Start Performance

> Session-start makes up to 2 HTTP calls (one batch POST + one checkpoint GET). With `--max-time 3` each, worst case is 6 seconds blocking. The checkpoint GET is reduced to `--max-time 1` since it's best-effort and the user is waiting. Caching the last checkpoint locally in `~/.config/lattice/last-checkpoint/` means offline sessions still get continuity context from the last-known checkpoint.

### Research Insights: Agent-Native Context Injection

> The session-start hook is the primary mechanism for informing Claude Code about Lattice capabilities. Injecting available slash commands and the API URL in `additionalContext` closes the discoverability gap between dashboard users (who see a UI) and agent sessions (which only know what they're told). Without this, agents can't compose ad-hoc API queries even though the API supports it.

- [x] Create `hooks/scripts/session-end.sh`
  - Read JSON from stdin
  - Capture final git snapshot
  - **Use batch endpoint:** Emit `session.end` + `git.snapshot` in a single request
  - Remove `~/.config/lattice/active-sessions/<session_id>.json`

- [x] Create `hooks/scripts/notification.sh`
  - Read stdin with `read`, check for waiting indicator with bash string matching (no `jq` on fast path)
  - If message indicates waiting for input → source `common.sh`, emit `session.waiting` event
  - Exit 0 quickly for other notification types

- [x] Create `hooks/scripts/post-tool-use.sh`
  - Read JSON from stdin
  - **Fast path:** The PostToolUse hook config uses `"matcher": "Bash"`, so this script only fires for Bash tool use. No need to check `tool_name` in the script.
  - Extract `tool_input.command` via `jq` (acceptable latency since `async: true`)
  - Pattern match with `case` statement:
    - `git commit*` → source `common.sh` + `git-snapshot.sh`, emit batch: `git.commit` + `git.snapshot`
    - `git checkout*`/`git switch*` → emit batch: `git.branch_switch` + `git.snapshot`
    - `gh pr create*` → emit batch: `git.pr_created` + `git.snapshot`, write `.lattice/checkpoint-suggested` flag
    - `git push*` → emit `git.snapshot` with trigger `push`
    - `*` → exit 0
  - Mark as `async: true` in hooks config

- [x] Create `hooks/scripts/stop.sh`
  - **CRITICAL: Zero-cost fast path.** This fires after every Claude Code response.
  - Read stdin into variable with `cat` (required by hooks protocol)
  - Check `stop_hook_active` using pure Bash regex — NO `jq`, NO `source`:
    ```bash
    [[ "$INPUT" =~ \"stop_hook_active\":true ]] && exit 0
    ```
  - Check if `.lattice/checkpoint-suggested` exists — `[ -f ".lattice/checkpoint-suggested" ] || exit 0`
  - **Only below here** source `common.sh` and do real work
  - Read trigger reason from flag file, remove flag (atomic: `mv` to temp, read, delete)
  - Output JSON with `decision: "block"` and `reason` containing checkpoint instructions (referencing the `/lattice:checkpoint` skill)
  - The skill instructs Claude to write `.lattice/last-checkpoint.json` AND POST via curl — the curl command IS the delivery mechanism (no background watcher needed)

### Research Insights: Stop Hook Performance

> `stop.sh` fires after every Claude Code response. Benchmarks show: Bash interpreter startup ~2ms, `jq` fork ~5-10ms, `source` of config file ~1-5ms. The fast path MUST avoid all of these. By using pure Bash string matching (`[[ "$INPUT" =~ pattern ]]`) and a stat syscall (`[ -f path ]`), the fast path exits in ~2-3ms total. Only when the checkpoint flag exists (rare — only after PR creation or merge) does the script pay the full cost of sourcing libraries and building JSON.

- [x] Create `hooks/scripts/heartbeat.sh`
  - Scan `~/.config/lattice/active-sessions/` for session files
  - For each file: extract `ppid` and `ppid_start_time`, verify PID is alive AND started at the expected time:
    ```bash
    kill -0 "$ppid" 2>/dev/null || { mark_abandoned; continue; }
    current_start=$(ps -p "$ppid" -o lstart= 2>/dev/null)
    [[ "$current_start" == "$ppid_start_time" ]] || { mark_abandoned; continue; }
    ```
  - If alive and verified: emit `session.heartbeat` with `status: active`
  - If dead or PID reused: emit `session.end` with `reason: "process_disappeared"`, remove session file
  - **Use batch endpoint:** Send all heartbeat events in a single request (N sessions → 1 HTTP call)

### Research Insights: PID Verification

> PIDs are reused by the OS. Storing only the PID means a stale session file with a recycled PID would be treated as active. By also storing `ppid_start_time` (the process start time from `ps -p $pid -o lstart=`) and comparing it on each heartbeat, we detect PID reuse. If the PID is alive but started at a different time, the original Claude Code process is gone and the session is orphaned.

- [x] Create `hooks/hooks.json` — hook event configuration for the install script to merge

**Acceptance criteria:**
- [x] `session-start.sh` emits events via batch endpoint and creates active-session file when receiving valid stdin JSON
- [x] `stop.sh` exits in <3ms when no flag file exists (verified with `time` or `PS4` tracing)
- [x] `post-tool-use.sh` exits in <1ms for non-git commands (script only fires for Bash due to matcher, but `case` fallthrough is instant)
- [x] `stop.sh` correctly detects `stop_hook_active` via bash regex and exits to prevent loops
- [x] `heartbeat.sh` detects orphaned sessions including PID reuse
- [ ] All scripts handle missing config gracefully (exit 0, log error)
- [ ] Checkpoint flag-file flow works end-to-end: `post-tool-use.sh` writes flag → `stop.sh` reads and injects context → Claude writes checkpoint + POSTs via skill's curl command

#### Phase 3: Dashboard

Static SPA served by Fastify, dark mode, mobile-friendly.

**Tasks:**

- [ ] Create `server/dashboard/index.html`
  - Single HTML file with semantic structure
  - Three views via show/hide containers (no hash router — overkill for 3 views). Use `data-view` attributes and a `showView(name)` function. Project detail uses `showProjectDetail(id)` with dynamic fetch.
  - Tab-style nav bar with active indicator
  - Auth: check `sessionStorage` for token; if missing, check URL hash `#token=...` and `history.replaceState()` to clear; if missing, show token input prompt
  - `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">`
  - `<meta name="color-scheme" content="dark light">`
  - `<template>` elements for card and detail components (cloned via `cloneNode`)

### Research Insights: Dashboard Architecture

> Hash-based routing was replaced with simple show/hide containers — three views don't need a router. This eliminates URL parsing, route matching, render dispatch, and back-button handling. The `<template>` element + `cloneNode` pattern is the recommended vanilla JS approach for repeated card elements — it's faster than `innerHTML` and preserves DOM state during polling updates. Use `morphdom` (3KB) if innerHTML convenience is needed later.

- [ ] Create `server/dashboard/style.css`
  - Dark mode default using CSS `light-dark()` function (supported in all browsers since mid-2024):
    ```css
    :root {
      color-scheme: dark light;
      --color-bg: light-dark(#ffffff, #0f0f0f);
      --color-bg-surface: light-dark(#f5f5f5, #1a1a1a);
      /* ... semantic tokens for text, borders, accents */
    }
    ```
  - Responsive card grid: `repeat(auto-fit, minmax(min(300px, 100%), 1fr))` — zero media queries
  - Status badges with colored dots using `color-mix()` for transparent backgrounds
  - Pulsing animation for "waiting for input" cards
  - Mobile: `min-height: 100dvh` (dynamic viewport height), 44px minimum touch targets, `content-visibility: auto` on cards for off-screen rendering performance
  - Skeleton loading states (animated gradient) instead of spinners
  - Sticky top bar for persistent navigation

### Research Insights: CSS Patterns

> The `light-dark()` CSS function co-locates both color values on a single line, eliminating duplicated `@media (prefers-color-scheme)` blocks. `color-mix(in srgb, var(--color-success) 15%, transparent)` creates transparent badge backgrounds from the text color — keeps the palette consistent. `100dvh` (not `100vh`) accounts for mobile browser chrome (URL bar) that dynamically appears/disappears.

- [ ] Create `server/dashboard/app.js`
  - Vanilla JS, no framework
  - `apiFetch(path)` helper: fetch with bearer token from `sessionStorage`, auto-redirect to login on 401
  - Polling via `createPoller()` utility:
    - Configurable interval (15s default for active view, 60s for project list)
    - Exponential backoff with jitter on error (max 60s)
    - `visibilitychange` listener: pause polling when tab is hidden, restart when visible
    - Error counter with circuit breaker (stop after 10 consecutive failures, show banner)
  - **Project list view:** card per project — name, client_tag badge, status dot, last activity via `timeAgo()`, device/interface, current branch, link to git remote
    - Client-side filtering by client_tag, status, device (no server-side search)
    - Empty state message when no projects exist
  - **Project detail view:** header (name, remote link, editable tag/display_name), git state, session history (reverse chronological with expandable snapshots), latest checkpoint as "Continue in Claude Code" block
  - **Active sessions view:** fetch with `?status=active,waiting_for_input`, waiting sessions at top with visual prominence, auto-refresh via poller
  - Error state: show banner when API is unreachable, preserve previous data in DOM
  - Relative time: `timeAgo(isoString)` using `Intl.RelativeTimeFormat` with `numeric: 'auto'` (produces "yesterday" instead of "1 day ago")
  - DOM updates for polling: use `reconcileList()` pattern — compare by ID, update changed cards in-place, add new cards, remove stale ones. Preserves scroll position, focus, and expanded state.
  - Auto-update `[data-time]` elements every 30 seconds via `setInterval`
  - "Logout" button that clears `sessionStorage` token
  - Connection status: `offline`/`online` event listeners → banner

### Research Insights: Polling Efficiency

> Replacing the DOM on every poll (via `innerHTML`) resets scroll position, focus state, and expanded details — terrible UX for a "mission control" dashboard. The `reconcileList()` pattern diffs by element `data-id`, updates only changed fields in existing cards, and creates/removes cards as needed. Combined with `visibilitychange` pausing, this means the dashboard uses zero resources when backgrounded. `Intl.RelativeTimeFormat` with `numeric: 'auto'` is locale-aware and produces natural language ("yesterday", "last month") — significantly better readability than "1 day ago".

**Acceptance criteria:**
- [ ] Dashboard loads at `/` and prompts for token if not set
- [ ] Token is cleared from URL hash after reading
- [ ] Project list shows projects with correct status indicators and relative timestamps
- [ ] Project detail shows session history, git state, and latest checkpoint
- [ ] Active sessions view auto-refreshes and surfaces waiting-for-input sessions prominently
- [ ] Polling pauses when tab is hidden, resumes when visible
- [ ] Works on mobile Safari (iPhone viewport)
- [ ] All data visible in dashboard is also available via API endpoints

#### Phase 4: Installation, Deployment, and Plugin

Install script, uninstall script, VPS deployment config, Claude Code plugin/skills/commands.

**Tasks:**

- [ ] Create `install-hooks.sh`
  - Check prerequisites: `jq`, `curl`, `git`, `node` (v20+)
  - Prompt for API URL (**validate starts with `https://`**), API token, device label
  - Write `~/.config/lattice/config.json` with `chmod 0600`
  - **Generate `~/.config/lattice/config.env`** from config.json (sourceable shell vars — avoids jq in hooks)
  - Create `~/.config/lattice/active-sessions/` with `chmod 0700`
  - Create `~/.config/lattice/last-checkpoint/` directory
  - Copy hook scripts to `~/.claude/hooks/lattice/` (including `lib/`)
  - Merge hook configuration into `~/.claude/settings.json`:
    - **Back up first:** `cp ~/.claude/settings.json ~/.claude/settings.json.bak.$(date +%s)`
    - Validate JSON before modification: `jq empty ~/.claude/settings.json` — if invalid, abort with error
    - Use array concatenation (`+=`) not replacement (`=`) for hook arrays
    - **Write to temp file, then `mv`** — `jq '...' file > file` truncates; `jq '...' file > file.tmp && mv file.tmp file`
    - If `settings.json` doesn't exist, create minimal scaffold: `{"hooks":{}}`
    - Display diff of changes for user confirmation
  - Install heartbeat: create launchd plist on macOS (`~/Library/LaunchAgents/com.lattice.heartbeat.plist`)
    - **CRITICAL:** Explicitly set `EnvironmentVariables.PATH` to include `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` — launchd agents do NOT inherit the user's shell PATH. Without this, `jq`, `curl`, and `git` are not found.
    - Use absolute paths (no `~` expansion — launchd doesn't expand it)
    - Use `launchctl bootstrap gui/$(id -u)` (modern syntax, not deprecated `launchctl load`)

### Research Insights: Install Script Safety

> The `settings.json` merge is the highest-risk client-side operation. Failure modes: (1) file isn't valid JSON → back up and abort, (2) file doesn't exist → create scaffold, (3) existing hooks for same events → array concatenation preserves them, (4) `jq '...' file > file` truncates → always write to temp then `mv`. The launchd PATH issue is the #1 cause of "works in terminal, fails from cron" on macOS — plist agents get only `/usr/bin:/bin:/usr/sbin:/sbin` by default.

- [ ] Create `uninstall-hooks.sh`
  - Remove hook scripts from `~/.claude/hooks/lattice/`
  - Remove Lattice entries from `~/.claude/settings.json` (match any path containing `lattice` — handles modified paths)
  - Unload and remove launchd plist using `launchctl bootout gui/$(id -u)/com.lattice.heartbeat`
  - Optionally remove `~/.config/lattice/` (prompt user)

- [ ] Create root `package.json` with scripts pointing to `server/`

- [ ] Create `README.md` — consolidated docs (project description, architecture diagram, quick start for VPS + per-machine, configuration reference, API reference, event types). Single file — no separate `docs/api.md` or `docs/event-schema.md` for a single-user tool.

- [ ] Create `LICENSE` — MIT

- [ ] Create root `.gitignore` — `node_modules/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env`, `.DS_Store`, `.lattice/`

- [ ] Create `.claude-plugin/plugin.json` — plugin manifest with name `lattice`

- [ ] Create `skills/checkpoint/SKILL.md` — checkpoint summary skill
  - Must read `~/.config/lattice/config.env` for API URL and token (Claude Code's Bash env doesn't inherit hook env vars)
  - Write to `.lattice/last-checkpoint.json` AND POST to API via curl (the curl IS the delivery mechanism)
  - All paths use `.lattice/` (not `.lattice-tracker/`)

- [ ] Create `commands/status.md` — `/lattice:status` slash command
- [ ] Create `commands/where.md` — `/lattice:where` slash command
- [ ] Create `commands/project.md` — `/lattice:project <name>` slash command (single-project detail + latest checkpoint)
- [ ] Create `commands/tag.md` — `/lattice:tag <project> <client_tag>` slash command (PATCH project metadata)

### Research Insights: Agent-Native Slash Commands

> The original plan had only 2 query commands (`/lattice:status`, `/lattice:where`) + 1 action command (`/lattice:checkpoint`). The dashboard has 3 views with filtering, editing, and deep-dive. Adding `/lattice:project` (detail view equivalent) and `/lattice:tag` (edit equivalent) closes the parity gap so agents can do everything dashboard users can. These are curl compositions, not new API endpoints.

- [ ] Create VPS deployment docs (section in README)
  - **Use pm2** (not systemd) — simpler for iterative v1 development
  - pm2 ecosystem file: `instances: 1` (**NEVER cluster — SQLite is single-writer**)
  - **Require Nginx reverse proxy** on port 443 forwarding to `127.0.0.1:3377` — Fastify must NOT be internet-facing
  - Let's Encrypt SSL via certbot
  - Firewall: allow 443 only
  - SQLite backup cron: `0 */6 * * * sqlite3 /var/lib/lattice-tracker/lattice.db ".backup /var/lib/lattice-tracker/backups/lattice-$(date +\%Y\%m\%d-\%H\%M).db"` (retain 7 days)
  - Stale session cleanup runs automatically on server startup (in db.js plugin)

**Acceptance criteria:**
- [ ] `install-hooks.sh` completes on a fresh macOS machine with Homebrew
- [ ] `config.env` is generated alongside `config.json`
- [ ] `settings.json` backup is created before modification
- [ ] After install, Claude Code hooks fire and events reach the API
- [ ] `uninstall-hooks.sh` cleanly removes all Lattice components
- [ ] Heartbeat plist loads and runs every 3 minutes (verify with `launchctl list`)
- [ ] All 5 slash commands work (`/lattice:checkpoint`, `/lattice:status`, `/lattice:where`, `/lattice:project`, `/lattice:tag`)
- [ ] Nginx proxies HTTPS → Fastify correctly
- [ ] SQLite backup cron runs and produces restorable `.db` files

## Alternative Approaches Considered

**Local-only tracking (no VPS):** Simpler, but defeats the cross-device purpose. Each machine would have its own SQLite — no unified view.

**MCP server instead of REST API:** Richer Claude Code integration, but requires MCP on every machine and doesn't serve a web dashboard. Deferred to v2.

**PostgreSQL instead of SQLite:** More capable, but SQLite is sufficient for single-user workloads and simpler to deploy/backup. better-sqlite3's synchronous API is actually an advantage for this use case.

**Full SPA framework (React/Preact):** More maintainable at scale, but adds build complexity. Vanilla JS is fine for three views.

**Git archive JSONL export:** Adds a service, a cron, and a GitHub repo dependency for backup. Replaced with a one-line `sqlite3 .backup` cron — simpler, faster to restore, and sufficient for v1.

## System-Wide Impact

### Interaction Graph

Hook script fires → reads stdin JSON → sources `config.env` → detects project → captures git state → batch POSTs to API → API validates token → API processes event in transaction (upsert project → upsert session → insert event → type-specific side effects) → returns 201. Dashboard polls API every 15 seconds → reconciles DOM with new data.

### Error & Failure Propagation

- Hook curl timeout → event lost, logged to `failed-events.log`. No impact on Claude Code session (`async: true` for PostToolUse, fire-and-forget for others).
- API validation error → 400 returned, hook logs it. Event is lost.
- SQLite write failure → Fastify error handler returns 500, hides stack trace. Hook logs it.
- Dashboard fetch failure → error banner shown, exponential backoff on polling, previous data preserved in DOM.
- Duplicate `session.end` (race between session-end.sh and heartbeat) → API ignores silently (idempotent handler).

### State Lifecycle Risks

- Partial event processing: all side effects run in a single SQLite transaction — atomic commit or full rollback.
- Active-session file not cleaned up on crash: heartbeat.sh handles this by checking PIDs with start-time verification.
- `.lattice/checkpoint-suggested` flag persists after crash: next `stop.sh` invocation picks it up. Low risk — at worst, an extra checkpoint is generated.
- Batch POST partially fails: impossible — the batch endpoint wraps all events in one transaction. Either all events are processed or none are.

### API Surface Parity

All data displayed in the dashboard is served by the REST API. Slash commands (`/lattice:status`, `/lattice:where`, `/lattice:project`, `/lattice:tag`) use the same API endpoints via curl. Agent-native score: all dashboard capabilities have agent equivalents through slash commands or direct API access with the injected `LATTICE_API_URL`.

## Dependencies & Prerequisites

**Per machine:** `jq`, `curl`, `git`, Claude Code installed
**VPS:** Node.js 20+, `build-essential` (for better-sqlite3 native compilation), pm2, Nginx, certbot
**Accounts:** Hostinger VPS

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hook latency slows Claude Code | Medium | High | `async: true` on PostToolUse, zero-cost fast paths on stop.sh, curl timeouts |
| VPS downtime loses events | Low | Medium | Local failure log, SQLite backup cron |
| SQLite grows unbounded | Low (v1 timeframe) | Medium | Add retention policy in v2 |
| install-hooks.sh corrupts settings.json | Medium | High | Backup before modification, validate JSON, temp file + mv, display diff |
| Bearer token exposed | Low | Medium | HTTPS enforced, sessionStorage (not localStorage), hash cleared after read, CSP headers |
| Shell injection via hook payloads | Medium | Critical | All curl payloads built via jq (never string interpolation), all vars double-quoted |
| PID reuse fools heartbeat | Low | Medium | Store and verify process start time alongside PID |
| Nginx misconfiguration exposes port 3377 | Low | High | Firewall blocks all ports except 443, health check verifies HTTPS only |

## Success Metrics

- Events arrive at API within 5 seconds of hook firing
- `stop.sh` exits in <3ms when no checkpoint flag exists
- `post-tool-use.sh` adds <10ms for non-git Bash commands (async, so non-blocking)
- Dashboard loads in <2 seconds
- Cross-device checkpoint injection works (new session gets context from last session on another machine)
- System tracks 10+ projects across 3 devices without degradation

## Scalability Assessment

| Timeframe | Events | Sessions | DB Size (est.) |
|-----------|--------|----------|----------------|
| 1 week    | 1,120  | 56       | ~2 MB          |
| 1 month   | 4,800  | 240      | ~8 MB          |
| 6 months  | 28,800 | 1,440    | ~50 MB         |
| 1 year    | 57,600 | 2,880    | ~100 MB        |

SQLite handles this volume trivially. WAL mode + indexes keep query times under 5ms for indexed lookups. The bottleneck at scale would be full-table scans on the events table — mitigated by pagination on all list endpoints.

## Sources & References

### Internal

- Spec: `docs/plans/lattice-spec.md` — source of truth for all design decisions

### External

- Fastify 5.x docs: https://fastify.dev/docs/latest/
- better-sqlite3 docs: https://github.com/WiseLibs/better-sqlite3
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- @fastify/static: https://github.com/fastify/fastify-static
- @fastify/cors: https://www.npmjs.com/package/@fastify/cors
- @fastify/rate-limit: https://github.com/fastify/fastify-rate-limit
- CSS `light-dark()`: https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark
- `Intl.RelativeTimeFormat`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat
- launchd tutorial: https://www.launchd.info/
- Bash hook performance patterns: https://stevekinney.com/courses/ai-development/claude-code-hook-examples
