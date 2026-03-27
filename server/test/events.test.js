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
