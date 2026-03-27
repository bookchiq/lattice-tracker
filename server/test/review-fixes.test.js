import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, authHeader, closeApp } from './helpers.js';

describe('P1-002: Heartbeat cannot resurrect terminal sessions', () => {
  let app;

  before(async () => {
    app = await buildApp();
    // Create and complete a session
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'term-sess', project_id: 'github.com:test:term', timestamp: '2026-03-26T10:00:00Z' },
    });
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.end', session_id: 'term-sess', project_id: 'github.com:test:term', timestamp: '2026-03-26T11:00:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('heartbeat does not change completed session to active', async () => {
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.heartbeat', session_id: 'term-sess', project_id: 'github.com:test:term', timestamp: '2026-03-26T12:00:00Z', payload: { status: 'active' } },
    });

    const res = await app.inject({ method: 'GET', url: '/api/sessions/term-sess', headers: authHeader() });
    const session = JSON.parse(res.body);
    assert.equal(session.status, 'completed', 'completed session should remain completed after heartbeat');
  });
});

describe('P1-003: Waiting sessions survive stale cleanup', () => {
  let app;

  before(async () => {
    app = await buildApp();
    // Create a session, transition to waiting
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'wait-sess', project_id: 'github.com:test:wait', timestamp: '2026-03-26T10:00:00Z' },
    });
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.waiting', session_id: 'wait-sess', project_id: 'github.com:test:wait', timestamp: '2026-03-26T10:01:00Z', payload: { message: 'needs input' } },
    });
  });

  after(async () => { await closeApp(app); });

  it('session.waiting updates last_heartbeat_at', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions/wait-sess', headers: authHeader() });
    const session = JSON.parse(res.body);
    assert.equal(session.status, 'waiting_for_input');
    assert.equal(session.last_heartbeat_at, '2026-03-26T10:01:00Z', 'last_heartbeat_at should be updated by session.waiting');
  });
});

describe('P2-005: Pagination bounds are clamped', () => {
  let app;

  before(async () => { app = await buildApp(); });
  after(async () => { await closeApp(app); });

  it('clamps excessive limit on sessions', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/sessions?limit=999999', headers: authHeader(),
    });
    assert.equal(res.statusCode, 200);
  });

  it('handles negative offset gracefully', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/sessions?offset=-5', headers: authHeader(),
    });
    assert.equal(res.statusCode, 200);
  });
});

describe('P2-009: Event schema rejects oversized fields', () => {
  let app;

  before(async () => { app = await buildApp(); });
  after(async () => { await closeApp(app); });

  it('rejects event_type longer than 100 chars', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'x'.repeat(101), timestamp: '2026-03-26T10:00:00Z' },
    });
    assert.equal(res.statusCode, 400);
  });
});

describe('P2-011: Duplicate client_event_id is handled gracefully', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'dup-sess', project_id: 'github.com:test:dup', timestamp: '2026-03-26T10:00:00Z', client_event_id: 'evt-unique-1' },
    });
  });

  after(async () => { await closeApp(app); });

  it('does not throw 500 on duplicate client_event_id', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'dup-sess', project_id: 'github.com:test:dup', timestamp: '2026-03-26T10:01:00Z', client_event_id: 'evt-unique-1' },
    });
    assert.equal(res.statusCode, 201, 'duplicate client_event_id should not cause 500');
  });
});

describe('P2-012: Project status filter', () => {
  let app;

  before(async () => {
    app = await buildApp();
    // Create two projects - one active, one idle
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'active-proj-sess', project_id: 'github.com:test:active', timestamp: '2026-03-26T10:00:00Z' },
    });
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'idle-proj-sess', project_id: 'github.com:test:idle', timestamp: '2026-03-26T09:00:00Z' },
    });
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.end', session_id: 'idle-proj-sess', project_id: 'github.com:test:idle', timestamp: '2026-03-26T09:30:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('filters projects by status=active', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects?status=active', headers: authHeader() });
    const projects = JSON.parse(res.body);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, 'github.com:test:active');
  });

  it('filters projects by status=idle', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects?status=idle', headers: authHeader() });
    const projects = JSON.parse(res.body);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, 'github.com:test:idle');
  });

  it('returns all projects with no status filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects', headers: authHeader() });
    const projects = JSON.parse(res.body);
    assert.equal(projects.length, 2);
  });
});

describe('P2-010: Malformed JSON payload does not crash', () => {
  let app;

  before(async () => { app = await buildApp(); });
  after(async () => { await closeApp(app); });

  it('handles invalid JSON string payload gracefully', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'bad-json', project_id: 'github.com:test:bad', timestamp: '2026-03-26T10:00:00Z', payload: '{not valid json}' },
    });
    // Should not be 500 - either 201 (handled gracefully) or 400
    assert.notEqual(res.statusCode, 500, 'should not return 500 for invalid JSON payload');
  });
});
