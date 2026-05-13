import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, authHeader, closeApp } from './helpers.js';

describe('POST /api/events', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await closeApp(app);
  });

  it('accepts a session.start event and auto-creates project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.start',
        session_id: 'sess-001',
        project_id: 'github.com:owner:repo',
        hostname: 'laptop',
        timestamp: '2026-03-26T10:00:00Z',
        payload: { interface: 'terminal', device_label: 'laptop' },
      },
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.ok(body.event_id > 0);

    // Verify project was auto-created
    const projectRes = await app.inject({
      method: 'GET',
      url: '/api/projects/github.com:owner:repo',
      headers: authHeader(),
    });
    assert.equal(projectRes.statusCode, 200);
    const project = JSON.parse(projectRes.body);
    assert.equal(project.id, 'github.com:owner:repo');
    assert.equal(project.last_activity_at, '2026-03-26T10:00:00Z');
  });

  it('creates session on session.start', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/sess-001',
      headers: authHeader(),
    });
    assert.equal(res.statusCode, 200);
    const session = JSON.parse(res.body);
    assert.equal(session.status, 'active');
    assert.equal(session.hostname, 'laptop');
  });

  it('transitions session to completed on session.end', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.end',
        session_id: 'sess-001',
        project_id: 'github.com:owner:repo',
        timestamp: '2026-03-26T11:00:00Z',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/sess-001',
      headers: authHeader(),
    });
    const session = JSON.parse(res.body);
    assert.equal(session.status, 'completed');
    assert.equal(session.ended_at, '2026-03-26T11:00:00Z');
  });

  it('session.end is idempotent for completed sessions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.end',
        session_id: 'sess-001',
        project_id: 'github.com:owner:repo',
        timestamp: '2026-03-26T12:00:00Z',
      },
    });
    assert.equal(res.statusCode, 201);

    const sessRes = await app.inject({
      method: 'GET',
      url: '/api/sessions/sess-001',
      headers: authHeader(),
    });
    const session = JSON.parse(sessRes.body);
    assert.equal(session.status, 'completed');
    // ended_at should still be the first end time
    assert.equal(session.ended_at, '2026-03-26T11:00:00Z');
  });
});

describe('POST /api/events/batch', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await closeApp(app);
  });

  it('processes multiple events atomically', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events/batch',
      headers: authHeader(),
      payload: [
        {
          event_type: 'session.start',
          session_id: 'batch-sess',
          project_id: 'github.com:test:batch',
          hostname: 'desktop',
          timestamp: '2026-03-26T10:00:00Z',
          payload: {},
        },
        {
          event_type: 'git.snapshot',
          session_id: 'batch-sess',
          project_id: 'github.com:test:batch',
          timestamp: '2026-03-26T10:00:01Z',
          payload: { branch: 'main', commit_hash: 'abc123' },
        },
      ],
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.results.length, 2);

    // Both session and snapshot should exist
    const sessRes = await app.inject({
      method: 'GET',
      url: '/api/sessions/batch-sess',
      headers: authHeader(),
    });
    assert.equal(sessRes.statusCode, 200);

    const projRes = await app.inject({
      method: 'GET',
      url: '/api/projects/github.com:test:batch',
      headers: authHeader(),
    });
    assert.equal(projRes.statusCode, 200);
  });
});

describe('Session state machine', () => {
  let app;

  before(async () => {
    app = await buildApp();
    // Create a session
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.start',
        session_id: 'sm-sess',
        project_id: 'github.com:sm:test',
        timestamp: '2026-03-26T10:00:00Z',
      },
    });
  });

  after(async () => {
    await closeApp(app);
  });

  it('transitions active → waiting_for_input on session.waiting', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.waiting',
        session_id: 'sm-sess',
        project_id: 'github.com:sm:test',
        timestamp: '2026-03-26T10:05:00Z',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/sm-sess',
      headers: authHeader(),
    });
    const session = JSON.parse(res.body);
    assert.equal(session.status, 'waiting_for_input');
  });

  it('transitions waiting_for_input → active on heartbeat', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.heartbeat',
        session_id: 'sm-sess',
        project_id: 'github.com:sm:test',
        timestamp: '2026-03-26T10:06:00Z',
        payload: { status: 'active' },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/sm-sess',
      headers: authHeader(),
    });
    const session = JSON.parse(res.body);
    assert.equal(session.status, 'active');
    assert.equal(session.last_heartbeat_at, '2026-03-26T10:06:00Z');
  });

  it('does not bump project last_activity_at on heartbeat/waiting/end', async () => {
    // After session.start (10:00), session.waiting (10:05), and session.heartbeat (10:06),
    // the project's last_activity_at must still reflect the session.start time —
    // passive lifecycle events should not surface a project as "recently active."
    const before = await app.inject({
      method: 'GET',
      url: '/api/projects/github.com:sm:test',
      headers: authHeader(),
    });
    assert.equal(JSON.parse(before.body).last_activity_at, '2026-03-26T10:00:00Z');

    // session.end should also not bump
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.end',
        session_id: 'sm-sess',
        project_id: 'github.com:sm:test',
        timestamp: '2026-03-26T10:30:00Z',
      },
    });
    const after = await app.inject({
      method: 'GET',
      url: '/api/projects/github.com:sm:test',
      headers: authHeader(),
    });
    assert.equal(JSON.parse(after.body).last_activity_at, '2026-03-26T10:00:00Z');
  });

  it('does bump project last_activity_at on real-work events', async () => {
    // A git.commit must move the timestamp forward — that's actual work.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.start',
        session_id: 'work-sess',
        project_id: 'github.com:work:test',
        timestamp: '2026-03-26T10:00:00Z',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'git.commit',
        session_id: 'work-sess',
        project_id: 'github.com:work:test',
        timestamp: '2026-03-26T10:42:00Z',
        payload: { branch: 'main', commit_hash: 'abc123' },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/github.com:work:test',
      headers: authHeader(),
    });
    assert.equal(JSON.parse(res.body).last_activity_at, '2026-03-26T10:42:00Z');
  });
});

describe('Checkpoints', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.start',
        session_id: 'cp-sess',
        project_id: 'github.com:cp:test',
        timestamp: '2026-03-26T10:00:00Z',
      },
    });
  });

  after(async () => {
    await closeApp(app);
  });

  it('stores checkpoint via session.checkpoint event', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.checkpoint',
        session_id: 'cp-sess',
        project_id: 'github.com:cp:test',
        timestamp: '2026-03-26T10:30:00Z',
        payload: {
          summary: 'Working on SSO integration',
          in_progress: 'Token refresh logic',
          next_steps: 'Add error handling',
          trigger: 'manual',
          branch: 'feat/sso',
          last_commit: 'abc123 Add token refresh',
        },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/github.com:cp:test/checkpoints',
      headers: authHeader(),
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].summary, 'Working on SSO integration');
    assert.equal(body.data[0].branch, 'feat/sso');
  });
});

describe('Project listing with NULL last_activity_at (heartbeat-only project)', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => { await closeApp(app); });

  it('heartbeat-only project appears in GET /api/projects with usable timestamp', async () => {
    // Heartbeat-only project: auto-created with last_activity_at = NULL,
    // since session.heartbeat is a passive event that should not bump activity.
    // Stub session is auto-created by the event processor.
    const hbRes = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.heartbeat',
        session_id: 'hb-only-sess',
        project_id: 'github.com:hb:only',
        timestamp: '2026-03-26T09:00:00Z',
        payload: { status: 'active' },
      },
    });
    assert.equal(hbRes.statusCode, 201);

    // Verify the project actually has NULL last_activity_at (the precondition we're testing).
    const projRes = await app.inject({
      method: 'GET',
      url: '/api/projects/github.com:hb:only',
      headers: authHeader(),
    });
    assert.equal(projRes.statusCode, 200);
    const project = JSON.parse(projRes.body);
    assert.equal(project.last_activity_at, null, 'heartbeat-only project should have NULL last_activity_at');
    assert.ok(project.created_at, 'project should have created_at populated');

    // The project must still show up in the list (not silently dropped).
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authHeader(),
    });
    assert.equal(listRes.statusCode, 200);
    const list = JSON.parse(listRes.body).data;
    const found = list.find(p => p.id === 'github.com:hb:only');
    assert.ok(found, 'heartbeat-only project must appear in GET /api/projects');
  });

  it('sorts heartbeat-only project above projects with older last_activity_at', async () => {
    // Create a project whose last_activity_at is far in the past (a real session.start
    // dated 2020). The heartbeat-only project's COALESCE sort value is its
    // created_at = datetime('now') (current wall-clock at test time), which is
    // newer than 2020 → the heartbeat-only project should sort first.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'session.start',
        session_id: 'old-real-sess',
        project_id: 'github.com:old:real',
        timestamp: '2020-01-01T00:00:00Z',
      },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authHeader(),
    });
    const list = JSON.parse(listRes.body).data;
    const hbIdx = list.findIndex(p => p.id === 'github.com:hb:only');
    const oldIdx = list.findIndex(p => p.id === 'github.com:old:real');
    assert.ok(hbIdx >= 0 && oldIdx >= 0, 'both projects must appear in the list');
    // Heartbeat-only's created_at (now) > old project's last_activity_at (2020).
    assert.ok(hbIdx < oldIdx, `heartbeat-only (idx ${hbIdx}) should sort above old real-work (idx ${oldIdx}) via COALESCE`);
  });
});
