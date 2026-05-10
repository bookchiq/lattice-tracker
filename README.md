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
/plugin install lattice@lattice-tracker
```

Or for local development, start Claude Code with the plugin directory:

```bash
claude --plugin-dir /path/to/lattice-tracker
```

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
LATTICE_API_TOKEN="your-token-here"   # leave blank if server runs with auth disabled
LATTICE_DEVICE_LABEL="laptop"
```

### Server (`.env` in `server/`)

```bash
PORT=3377
LATTICE_API_TOKEN=your-token-here
LATTICE_DB_PATH=./lattice.db
LATTICE_DASHBOARD_ORIGIN=https://lattice.yourdomain.com
```

#### Trusted-network mode (e.g. Tailscale, LAN)

If you only access Lattice from a trusted network, you can skip the bearer token:

```bash
LATTICE_AUTH_DISABLED=true
# Optional: comma-separated CIDRs allowed to reach the API without a token.
# Defaults to loopback + Tailscale CGNAT only (127.0.0.0/8, ::1/128, 100.64.0.0/10).
# To also trust your LAN, opt in explicitly:
LATTICE_TRUSTED_CIDRS=127.0.0.0/8,::1/128,100.64.0.0/10,10.0.0.0/8,192.168.0.0/16
```

CIDRs are validated at boot via `ipaddr.js` (IPv4 + IPv6); a malformed entry causes a hard fail with a clear error. Untrusted source IPs receive a 401 with a one-time-per-IP warning in the server log.

⚠ **Do not enable on a publicly-accessible host.** Reverse proxies hide the real client IP from the bind-address check, so this is enforced at request time using the source IP — anyone whose traffic reaches the server from a trusted CIDR will be admitted without a token. As a safety net, the server **refuses to start** when `LATTICE_AUTH_DISABLED=true` is combined with `LATTICE_HOST=0.0.0.0` (or `::`) unless you explicitly opt in:

```bash
LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND=true
```

Only enable that override on hosts that are genuinely behind a trusted overlay (e.g. a Tailscale-only Linux box).

Hooks may also leave `LATTICE_API_TOKEN` blank in their `config.env` to skip sending the `Authorization` header entirely.

#### Discovery endpoint

`GET /api/config` is unauthenticated and returns a self-describing manifest the dashboard (and any agent) uses to bootstrap:

```json
{
  "authDisabled": true,
  "version": "0.1.0",
  "eventTypes": ["session.start", "session.end", ...],
  "rateLimit": { "max": 100, "windowSeconds": 60 }
}
```

## API Reference

All endpoints require `Authorization: Bearer <token>` except `GET /api/health` and `GET /api/config`. When `LATTICE_AUTH_DISABLED=true`, requests from trusted CIDRs are admitted without a token.

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
