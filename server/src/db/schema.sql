-- Lattice Tracker v1 Schema (migration 1)

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  git_remote_url TEXT,
  canonical_name TEXT,
  display_name TEXT,
  client_tag TEXT,
  last_activity_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  hostname TEXT,
  interface TEXT,
  device_label TEXT,
  status TEXT DEFAULT 'active',
  started_at TEXT,
  last_heartbeat_at TEXT,
  ended_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT UNIQUE,
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  hostname TEXT,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS git_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  timestamp TEXT,
  branch TEXT,
  commit_hash TEXT,
  commit_message TEXT,
  has_uncommitted_changes INTEGER,
  uncommitted_summary TEXT,
  trigger_type TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  timestamp TEXT,
  summary TEXT,
  in_progress TEXT,
  blocked_on TEXT,
  next_steps TEXT,
  trigger_type TEXT,
  branch TEXT,
  last_commit TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events(event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_project_status ON sessions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_git_snapshots_project_id ON git_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_git_snapshots_session_id ON git_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_project_id_timestamp ON checkpoints(project_id, timestamp DESC);
