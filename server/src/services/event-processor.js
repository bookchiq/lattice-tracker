/**
 * Process a single event inside a transaction.
 * Handles project upsert, session management, and event-type-specific side effects.
 */
export function createEventProcessor(queries) {
  return function processEvent(event) {
    const projectId = event.project_id;
    let payload;
    try {
      payload = typeof event.payload === 'string'
        ? JSON.parse(event.payload || '{}')
        : (event.payload || {});
    } catch {
      payload = {};
    }

    // 1. Upsert project (always update last_activity_at)
    if (projectId) {
      queries.upsertProject({
        id: projectId,
        git_remote_url: payload.git_remote_url || null,
        canonical_name: payload.canonical_name || projectId.split(':').pop(),
        last_activity_at: event.timestamp,
      });
    }

    // 2. For session.start, upsert session BEFORE inserting event (FK safety)
    if (event.event_type === 'session.start' && event.session_id) {
      queries.upsertSession({
        id: event.session_id,
        project_id: projectId,
        hostname: event.hostname,
        interface: payload.interface || null,
        device_label: payload.device_label || null,
        status: 'active',
        started_at: event.timestamp,
      });
    }

    // 2b. For non-session.start events, ensure session exists (handles out-of-order delivery)
    if (event.event_type !== 'session.start' && event.session_id) {
      const existing = queries.getSessionById(event.session_id);
      if (!existing) {
        queries.upsertSession({
          id: event.session_id,
          project_id: projectId,
          hostname: event.hostname,
          interface: null,
          device_label: null,
          status: 'unknown',
          started_at: event.timestamp,
        });
      }
    }

    // 3. Insert the event
    const result = queries.insertEvent(event);

    // 4. Type-specific side effects
    switch (event.event_type) {
      case 'session.end':
        if (event.session_id) {
          queries.updateSessionStatus(
            event.session_id,
            'completed',
            event.timestamp
          );
        }
        break;

      case 'session.heartbeat':
        if (event.session_id) {
          const newStatus = payload.status === 'active' ? 'active' : null;
          queries.updateSessionHeartbeat(
            event.session_id,
            event.timestamp,
            newStatus
          );
        }
        break;

      case 'session.waiting':
        if (event.session_id) {
          queries.updateSessionStatus(event.session_id, 'waiting_for_input');
          // Keep last_heartbeat_at fresh so stale cleanup doesn't kill waiting sessions
          queries.updateSessionHeartbeat(event.session_id, event.timestamp);
        }
        break;

      case 'session.checkpoint':
        if (event.session_id) {
          queries.insertCheckpoint({
            session_id: event.session_id,
            project_id: projectId,
            timestamp: event.timestamp,
            summary: payload.summary,
            in_progress: payload.in_progress,
            blocked_on: payload.blocked_on,
            next_steps: payload.next_steps,
            trigger_type: payload.trigger_type || payload.trigger,
            branch: payload.branch,
            last_commit: payload.last_commit,
          });
        }
        break;

      case 'git.snapshot':
      case 'git.commit':
      case 'git.branch_switch':
      case 'git.pr_created':
        queries.insertGitSnapshot({
          session_id: event.session_id,
          project_id: projectId,
          timestamp: event.timestamp,
          branch: payload.branch,
          commit_hash: payload.commit_hash,
          commit_message: payload.commit_message,
          has_uncommitted_changes: payload.has_uncommitted_changes,
          uncommitted_summary: payload.uncommitted_summary,
          trigger_type: payload.trigger_type || event.event_type.replace('git.', ''),
        });
        break;

      case 'project.tag':
        if (projectId) {
          queries.updateProject(projectId, {
            display_name: payload.display_name,
            client_tag: payload.client_tag,
          });
        }
        break;

      default:
        // For any other event type that arrives for a waiting session,
        // implicitly transition to active
        if (event.session_id && event.event_type !== 'session.start') {
          const session = queries.getSessionById(event.session_id);
          if (session && session.status === 'waiting_for_input') {
            queries.updateSessionHeartbeat(event.session_id, event.timestamp, 'active');
          }
        }
        break;
    }

    return result;
  };
}
