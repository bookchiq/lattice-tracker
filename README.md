# Lattice

Cross-device Claude Code session and project tracker.

```
Claude Code hooks (each machine) → Fastify API (VPS) → SQLite → Dashboard (SPA)
```

Lattice answers: "Where was I?", "What's waiting for input?", "What's the git state of each project?"

## Quick Start

### 1. Deploy the server (VPS)

```bash
git clone git@github.com:bookchiq/lattice-tracker.git
cd lattice-tracker/server
npm install

# Create .env
cp .env.example .env
# Edit .env: set LATTICE_API_TOKEN (generate with: openssl rand -hex 32)

# Start with pm2
npm install -g pm2
pm2 start src/index.js --name lattice-api --node-args="--env-file=.env"
pm2 save
pm2 startup  # follow printed instructions
```

### 2. Set up reverse proxy (Caddy example)

Add to your Caddyfile (typically `/etc/caddy/Caddyfile`):

```
lattice.yourdomain.com {
    reverse_proxy 127.0.0.1:3377
}
```

Then reload Caddy: `sudo systemctl reload caddy`

Caddy handles SSL automatically. If you're using nginx or another reverse proxy instead, point it at `127.0.0.1:3377` and configure SSL separately.

**Important:** Never expose port 3377 directly. Only allow 80/443 through your firewall.

Verify it works:

```bash
curl https://lattice.yourdomain.com/api/health
# Expected: {"ok":true,"version":"0.1.0"}
```

### 3. Set up each machine

Lattice has two parts that are installed separately on each machine:

**a) Install the Claude Code plugin** (gives you `/lattice:checkpoint`, `/lattice:status`, and other slash commands):

Inside a Claude Code session, run:

```
/plugin marketplace add bookchiq/lattice-tracker
/plugin install lattice@bookchiq-lattice-tracker
```

Or use `/plugin` and browse the **Discover** tab to find and install it interactively.

**b) Install hooks and config** (gives you automatic session tracking, git snapshots, and heartbeat):

```bash
git clone git@github.com:bookchiq/lattice-tracker.git
cd lattice-tracker
./install-hooks.sh
```

The installer prompts for your API URL, token, and device label. It:
- Writes config to `~/.config/lattice/` (API token, device label)
- Copies hook scripts to `~/.claude/hooks/lattice/`
- Merges hook event configuration into `~/.claude/settings.json`
- Installs a launchd heartbeat agent (every 3 minutes)

> **Why two steps?** The plugin system handles slash commands and skills, but Claude Code plugins can't write config files, install hooks, or set up launchd agents. The install script handles the parts the plugin system can't.

### 4. Open the dashboard

Visit `https://lattice.yourdomain.com/#token=YOUR_TOKEN`

The token is stored in sessionStorage and cleared from the URL automatically.

## Architecture

| Component | Tech | Purpose |
|-----------|------|---------|
| Hook scripts | Bash + jq | Emit events from Claude Code sessions |
| API server | Fastify 5 + SQLite | Ingest events, serve data |
| Dashboard | Vanilla JS SPA | Visual project/session status |

Data flows one direction: hooks → API → SQLite. The dashboard reads via the same API.

## Configuration

### Per-machine (`~/.config/lattice/config.env`)

```bash
LATTICE_API_URL="https://lattice.yourdomain.com"
LATTICE_API_TOKEN="your-token-here"
LATTICE_DEVICE_LABEL="laptop"
```

### Server (`.env` in `server/`)

```bash
PORT=3377
LATTICE_API_TOKEN=your-token-here
LATTICE_DB_PATH=./lattice.db
LATTICE_DASHBOARD_ORIGIN=https://lattice.yourdomain.com
```

## API Reference

All endpoints require `Authorization: Bearer <token>` except health.

### Events

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/events` | Ingest a single event |
| `POST` | `/api/events/batch` | Ingest multiple events (max 50) |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects (`?status=active\|idle`, `?client_tag=...`) |
| `GET` | `/api/projects/:id` | Project detail with latest session, snapshot, checkpoint |
| `GET` | `/api/projects/:id/sessions` | Session history (paginated) |
| `GET` | `/api/projects/:id/checkpoints` | Checkpoint history (paginated) |
| `PATCH` | `/api/projects/:id` | Update display_name, client_tag |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List sessions (`?status=active,waiting_for_input`) |
| `GET` | `/api/sessions/:id` | Session detail with events and snapshots |
| `GET` | `/api/sessions/:id/events` | Event history (paginated) |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (no auth required) |

## Event Types

| Type | Trigger | Description |
|------|---------|-------------|
| `session.start` | SessionStart hook | New session began |
| `session.end` | SessionEnd hook / heartbeat | Session ended |
| `session.heartbeat` | Heartbeat cron (3 min) | Session still alive |
| `session.waiting` | Notification hook | Waiting for user input |
| `session.checkpoint` | Stop hook / manual | Continuity checkpoint |
| `git.snapshot` | Various | Git state capture |
| `git.commit` | PostToolUse | Git commit detected |
| `git.branch_switch` | PostToolUse | Branch change detected |
| `git.pr_created` | PostToolUse | PR created via `gh` |
| `project.tag` | Manual | Project metadata update |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/lattice:checkpoint` | Save a checkpoint of current work |
| `/lattice:status` | View all tracked projects |
| `/lattice:where` | Show active sessions across devices |
| `/lattice:project <name>` | View project detail |
| `/lattice:tag <project> <tag>` | Tag a project |

## Backup

Add a cron job on the VPS for SQLite backups:

```
0 */6 * * * sqlite3 /path/to/lattice.db ".backup /path/to/backups/lattice-$(date +\%Y\%m\%d-\%H\%M).db"
```

Retain 7 days: `find /path/to/backups -name "lattice-*.db" -mtime +7 -delete`

## Uninstall

```bash
./uninstall-hooks.sh
```

## License

MIT
