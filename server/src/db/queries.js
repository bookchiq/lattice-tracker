// Valid session state transitions
const VALID_TRANSITIONS = {
  unknown: ['active', 'waiting_for_input', 'completed', 'abandoned'],
  active: ['waiting_for_input', 'completed', 'abandoned'],
  waiting_for_input: ['active', 'completed', 'abandoned'],
  completed: [],
  abandoned: [],
};

export function createQueries(db) {
  // -- Events --
  const _insertEvent = db.prepare(`
    INSERT INTO events (client_event_id, session_id, project_id, event_type, timestamp, hostname, payload)
    VALUES (@client_event_id, @session_id, @project_id, @event_type, @timestamp, @hostname, @payload)
  `);

  const _getEventByClientId = db.prepare(`SELECT id FROM events WHERE client_event_id = ?`);

  function insertEvent(event) {
    const clientEventId = event.client_event_id || null;

    // Check for duplicate client_event_id before inserting
    if (clientEventId) {
      const existing = _getEventByClientId.get(clientEventId);
      if (existing) {
        return { changes: 0, lastInsertRowid: existing.id, duplicate: true };
      }
    }

    return _insertEvent.run({
      client_event_id: clientEventId,
      session_id: event.session_id || null,
      project_id: event.project_id || null,
      event_type: event.event_type,
      timestamp: event.timestamp,
      hostname: event.hostname || null,
      payload: typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload || null),
    });
  }

  // -- Projects --
  const _upsertProject = db.prepare(`
    INSERT INTO projects (id, git_remote_url, canonical_name, last_activity_at, created_at)
    VALUES (@id, @git_remote_url, @canonical_name, @last_activity_at, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      last_activity_at = MAX(COALESCE(projects.last_activity_at, ''), @last_activity_at),
      git_remote_url = COALESCE(@git_remote_url, projects.git_remote_url)
  `);

  function upsertProject(project) {
    return _upsertProject.run({
      id: project.id,
      git_remote_url: project.git_remote_url || null,
      canonical_name: project.canonical_name || null,
      last_activity_at: project.last_activity_at || new Date().toISOString(),
    });
  }

  const _getProjects = db.prepare(`SELECT * FROM projects ORDER BY last_activity_at DESC LIMIT @limit OFFSET @offset`);
  const _getProjectsByTag = db.prepare(`SELECT * FROM projects WHERE client_tag = @client_tag ORDER BY last_activity_at DESC LIMIT @limit OFFSET @offset`);
  const _getActiveProjects = db.prepare(`
    SELECT DISTINCT p.* FROM projects p
    INNER JOIN sessions s ON s.project_id = p.id
    WHERE s.status IN ('active', 'waiting_for_input')
    ORDER BY p.last_activity_at DESC
    LIMIT @limit OFFSET @offset
  `);
  const _getIdleProjects = db.prepare(`
    SELECT p.* FROM projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM sessions s WHERE s.project_id = p.id AND s.status IN ('active', 'waiting_for_input')
    )
    ORDER BY p.last_activity_at DESC
    LIMIT @limit OFFSET @offset
  `);
  const _getProjectById = db.prepare(`SELECT * FROM projects WHERE id = ?`);
  const _updateProject = db.prepare(`
    UPDATE projects SET display_name = @display_name, client_tag = @client_tag WHERE id = @id
  `);

  function getProjects(filters = {}) {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    if (filters.status === 'active') {
      return _getActiveProjects.all({ limit, offset });
    }
    if (filters.status === 'idle') {
      return _getIdleProjects.all({ limit, offset });
    }
    if (filters.client_tag) {
      return _getProjectsByTag.all({ client_tag: filters.client_tag, limit, offset });
    }
    return _getProjects.all({ limit, offset });
  }

  function getProjectById(id) {
    return _getProjectById.get(id);
  }

  function updateProject(id, fields) {
    const current = _getProjectById.get(id);
    if (!current) return null;
    return _updateProject.run({
      id,
      display_name: fields.display_name !== undefined ? fields.display_name : current.display_name,
      client_tag: fields.client_tag !== undefined ? fields.client_tag : current.client_tag,
    });
  }

  // -- Sessions --
  const _upsertSession = db.prepare(`
    INSERT INTO sessions (id, project_id, hostname, interface, device_label, status, started_at, last_heartbeat_at)
    VALUES (@id, @project_id, @hostname, @interface, @device_label, @status, @started_at, @started_at)
    ON CONFLICT(id) DO UPDATE SET
      project_id = COALESCE(@project_id, sessions.project_id),
      hostname = COALESCE(@hostname, sessions.hostname),
      interface = COALESCE(@interface, sessions.interface),
      device_label = COALESCE(@device_label, sessions.device_label),
      status = CASE WHEN sessions.status = 'unknown' THEN @status ELSE sessions.status END,
      started_at = CASE WHEN sessions.status = 'unknown' THEN @started_at ELSE sessions.started_at END,
      last_heartbeat_at = COALESCE(@started_at, sessions.last_heartbeat_at)
  `);

  function upsertSession(session) {
    return _upsertSession.run({
      id: session.id,
      project_id: session.project_id || null,
      hostname: session.hostname || null,
      interface: session.interface || null,
      device_label: session.device_label || null,
      status: session.status || 'active',
      started_at: session.started_at || new Date().toISOString(),
    });
  }

  const _getSessionStatus = db.prepare(`SELECT status FROM sessions WHERE id = ?`);
  const _updateSessionStatus = db.prepare(`UPDATE sessions SET status = @status, ended_at = @ended_at WHERE id = @id`);

  function updateSessionStatus(id, newStatus, endedAt = null) {
    const current = _getSessionStatus.get(id);
    if (!current) return null;

    const allowed = VALID_TRANSITIONS[current.status];
    if (allowed && !allowed.includes(newStatus)) {
      return null; // invalid transition, ignore silently
    }

    return _updateSessionStatus.run({ id, status: newStatus, ended_at: endedAt });
  }

  const _updateSessionHeartbeat = db.prepare(`
    UPDATE sessions SET last_heartbeat_at = @last_heartbeat_at, status = @status WHERE id = @id
  `);

  function updateSessionHeartbeat(id, lastHeartbeatAt, status = null) {
    const current = _getSessionStatus.get(id);
    if (!current) return null;

    let newStatus = current.status;
    if (status && status !== current.status) {
      const allowed = VALID_TRANSITIONS[current.status];
      if (allowed && allowed.includes(status)) {
        newStatus = status;
      }
      // If transition is invalid (e.g., completed→active), keep current status
    }

    return _updateSessionHeartbeat.run({ id, last_heartbeat_at: lastHeartbeatAt, status: newStatus });
  }

  const _getSessions = db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC LIMIT @limit OFFSET @offset`);
  const _getSessionsByStatus = db.prepare(`SELECT * FROM sessions WHERE status IN (SELECT value FROM json_each(@statuses)) ORDER BY started_at DESC LIMIT @limit OFFSET @offset`);
  const _getSessionsByHostname = db.prepare(`SELECT * FROM sessions WHERE hostname = @hostname ORDER BY started_at DESC LIMIT @limit OFFSET @offset`);
  const _getSessionById = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
  const _getSessionsByProjectId = db.prepare(`SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT @limit OFFSET @offset`);

  function getSessions(filters = {}) {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    if (filters.status) {
      const statuses = JSON.stringify(filters.status.split(','));
      return _getSessionsByStatus.all({ statuses, limit, offset });
    }
    if (filters.hostname) {
      return _getSessionsByHostname.all({ hostname: filters.hostname, limit, offset });
    }
    return _getSessions.all({ limit, offset });
  }

  function getSessionById(id) {
    return _getSessionById.get(id);
  }

  function getSessionsByProjectId(projectId, { limit = 20, offset = 0 } = {}) {
    return _getSessionsByProjectId.all(projectId, { limit, offset });
  }

  // -- Events queries --
  const _getEventsBySessionId = db.prepare(`
    SELECT * FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT @limit OFFSET @offset
  `);

  function getEventsBySessionId(sessionId, { limit = 100, offset = 0 } = {}) {
    return _getEventsBySessionId.all(sessionId, { limit, offset });
  }

  // -- Git Snapshots --
  const _insertGitSnapshot = db.prepare(`
    INSERT INTO git_snapshots (session_id, project_id, timestamp, branch, commit_hash, commit_message, has_uncommitted_changes, uncommitted_summary, trigger_type)
    VALUES (@session_id, @project_id, @timestamp, @branch, @commit_hash, @commit_message, @has_uncommitted_changes, @uncommitted_summary, @trigger_type)
  `);

  function insertGitSnapshot(snapshot) {
    return _insertGitSnapshot.run({
      session_id: snapshot.session_id || null,
      project_id: snapshot.project_id || null,
      timestamp: snapshot.timestamp || new Date().toISOString(),
      branch: snapshot.branch || null,
      commit_hash: snapshot.commit_hash || null,
      commit_message: snapshot.commit_message || null,
      has_uncommitted_changes: snapshot.has_uncommitted_changes ? 1 : 0,
      uncommitted_summary: snapshot.uncommitted_summary || null,
      trigger_type: snapshot.trigger_type || null,
    });
  }

  const _getSnapshotsByProjectId = db.prepare(`
    SELECT * FROM git_snapshots WHERE project_id = ? ORDER BY timestamp DESC LIMIT @limit OFFSET @offset
  `);
  const _getSnapshotsBySessionId = db.prepare(`
    SELECT * FROM git_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT @limit OFFSET @offset
  `);
  const _getLatestSnapshot = db.prepare(`
    SELECT * FROM git_snapshots WHERE project_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1
  `);

  function getSnapshotsByProjectId(projectId, { limit = 20, offset = 0 } = {}) {
    return _getSnapshotsByProjectId.all(projectId, { limit, offset });
  }

  function getSnapshotsBySessionId(sessionId, { limit = 20, offset = 0 } = {}) {
    return _getSnapshotsBySessionId.all(sessionId, { limit, offset });
  }

  function getLatestSnapshot(projectId) {
    return _getLatestSnapshot.get(projectId);
  }

  // -- Checkpoints --
  const _insertCheckpoint = db.prepare(`
    INSERT INTO checkpoints (session_id, project_id, timestamp, summary, in_progress, blocked_on, next_steps, trigger_type, branch, last_commit)
    VALUES (@session_id, @project_id, @timestamp, @summary, @in_progress, @blocked_on, @next_steps, @trigger_type, @branch, @last_commit)
  `);

  function insertCheckpoint(checkpoint) {
    return _insertCheckpoint.run({
      session_id: checkpoint.session_id || null,
      project_id: checkpoint.project_id || null,
      timestamp: checkpoint.timestamp || new Date().toISOString(),
      summary: checkpoint.summary || null,
      in_progress: checkpoint.in_progress || null,
      blocked_on: checkpoint.blocked_on || null,
      next_steps: checkpoint.next_steps || null,
      trigger_type: checkpoint.trigger_type || null,
      branch: checkpoint.branch || null,
      last_commit: checkpoint.last_commit || null,
    });
  }

  const _getLatestCheckpoint = db.prepare(`
    SELECT * FROM checkpoints WHERE project_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1
  `);
  const _getCheckpointsByProjectId = db.prepare(`
    SELECT * FROM checkpoints WHERE project_id = ? ORDER BY timestamp DESC, id DESC LIMIT @limit OFFSET @offset
  `);

  function getLatestCheckpoint(projectId) {
    return _getLatestCheckpoint.get(projectId);
  }

  function getCheckpointsByProjectId(projectId, { limit = 10, offset = 0 } = {}) {
    return _getCheckpointsByProjectId.all(projectId, { limit, offset });
  }

  return {
    insertEvent,
    upsertProject,
    getProjects,
    getProjectById,
    updateProject,
    upsertSession,
    updateSessionStatus,
    updateSessionHeartbeat,
    getSessions,
    getSessionById,
    getSessionsByProjectId,
    getEventsBySessionId,
    insertGitSnapshot,
    getSnapshotsByProjectId,
    getSnapshotsBySessionId,
    getLatestSnapshot,
    insertCheckpoint,
    getLatestCheckpoint,
    getCheckpointsByProjectId,
  };
}
