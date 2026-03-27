import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, authHeader, closeApp } from './helpers.js';

// --- Route coverage ---

describe('GET /api/sessions', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'list-sess-1', project_id: 'github.com:test:list', hostname: 'laptop', timestamp: '2026-03-26T10:00:00Z' },
    });
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'list-sess-2', project_id: 'github.com:test:list', hostname: 'desktop', timestamp: '2026-03-26T10:01:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('lists sessions with pagination', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions?limit=1', headers: authHeader() });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 1);
    assert.equal(body.limit, 1);
  });

  it('filters sessions by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions?status=active', headers: authHeader() });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.length >= 2);
  });

  it('filters sessions by hostname', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions?hostname=laptop', headers: authHeader() });
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].hostname, 'laptop');
  });
});

describe('GET /api/sessions/:id/events', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'evt-list-sess', project_id: 'github.com:test:evtlist', timestamp: '2026-03-26T10:00:00Z' },
    });
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.heartbeat', session_id: 'evt-list-sess', project_id: 'github.com:test:evtlist', timestamp: '2026-03-26T10:05:00Z', payload: { status: 'active' } },
    });
  });

  after(async () => { await closeApp(app); });

  it('returns events for a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions/evt-list-sess/events', headers: authHeader() });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 2);
  });
});

describe('PATCH /api/projects/:id', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'patch-sess', project_id: 'github.com:test:patch', timestamp: '2026-03-26T10:00:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('updates display_name and client_tag', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/projects/github.com:test:patch', headers: authHeader(),
      payload: { display_name: 'My Project', client_tag: 'frontend' },
    });
    assert.equal(res.statusCode, 200);

    const getRes = await app.inject({ method: 'GET', url: '/api/projects/github.com:test:patch', headers: authHeader() });
    const project = JSON.parse(getRes.body);
    assert.equal(project.display_name, 'My Project');
    assert.equal(project.client_tag, 'frontend');
  });

  it('returns 404 for unknown project', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/projects/nonexistent', headers: authHeader(),
      payload: { display_name: 'Nope' },
    });
    assert.equal(res.statusCode, 404);
  });
});

describe('GET /api/projects/:id/sessions', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'proj-sess-1', project_id: 'github.com:test:projsess', timestamp: '2026-03-26T10:00:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('returns sessions for a project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/github.com:test:projsess/sessions', headers: authHeader() });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 1);
    assert.ok(body.limit);
  });
});

// --- Event type coverage ---

describe('Git event types', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'git-sess', project_id: 'github.com:test:git', timestamp: '2026-03-26T10:00:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('processes git.commit event and creates snapshot', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: {
        event_type: 'git.commit', session_id: 'git-sess', project_id: 'github.com:test:git',
        timestamp: '2026-03-26T10:01:00Z',
        payload: { branch: 'main', commit_hash: 'abc123', commit_message: 'initial' },
      },
    });
    assert.equal(res.statusCode, 201);
  });

  it('processes git.branch_switch event', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: {
        event_type: 'git.branch_switch', session_id: 'git-sess', project_id: 'github.com:test:git',
        timestamp: '2026-03-26T10:02:00Z',
        payload: { branch: 'feat/new' },
      },
    });
    assert.equal(res.statusCode, 201);
  });

  it('processes git.pr_created event', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: {
        event_type: 'git.pr_created', session_id: 'git-sess', project_id: 'github.com:test:git',
        timestamp: '2026-03-26T10:03:00Z',
        payload: { branch: 'feat/new', commit_hash: 'def456' },
      },
    });
    assert.equal(res.statusCode, 201);

    // Verify snapshots were created
    const projRes = await app.inject({ method: 'GET', url: '/api/projects/github.com:test:git', headers: authHeader() });
    const project = JSON.parse(projRes.body);
    assert.ok(project.latest_snapshot);
  });
});

describe('project.tag event', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'tag-sess', project_id: 'github.com:test:tag', timestamp: '2026-03-26T10:00:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('updates project display_name and client_tag', async () => {
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: {
        event_type: 'project.tag', project_id: 'github.com:test:tag',
        timestamp: '2026-03-26T10:01:00Z',
        payload: { display_name: 'Tagged Project', client_tag: 'infra' },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/projects/github.com:test:tag', headers: authHeader() });
    const project = JSON.parse(res.body);
    assert.equal(project.display_name, 'Tagged Project');
    assert.equal(project.client_tag, 'infra');
  });
});

// --- Cross-cutting concerns ---

describe('Security headers', () => {
  let app;

  before(async () => { app = await buildApp(); });
  after(async () => { await closeApp(app); });

  it('sets security headers on API responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['x-xss-protection'], '0');
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });

  it('sets CSP on static responses without unsafe-inline', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.ok(res.headers['content-security-policy']);
    assert.ok(!res.headers['content-security-policy'].includes('unsafe-inline'));
  });
});

describe('Auth exact health match', () => {
  let app;

  before(async () => { app = await buildApp(); });
  after(async () => { await closeApp(app); });

  it('allows GET /api/health without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.statusCode, 200);
  });

  it('requires auth for routes starting with /api/health-', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health-admin' });
    // Should be 401 (auth required) or 404 (route not found)
    assert.ok([401, 404].includes(res.statusCode), `Expected 401 or 404, got ${res.statusCode}`);
  });
});

describe('404 responses', () => {
  let app;

  before(async () => { app = await buildApp(); });
  after(async () => { await closeApp(app); });

  it('returns 404 for unknown project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/nonexistent', headers: authHeader() });
    assert.equal(res.statusCode, 404);
  });

  it('returns 404 for unknown session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions/nonexistent', headers: authHeader() });
    assert.equal(res.statusCode, 404);
  });
});

// --- New feature coverage ---

describe('Projects include=latest enrichment', () => {
  let app;

  before(async () => {
    app = await buildApp();
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.start', session_id: 'enrich-sess', project_id: 'github.com:test:enrich', hostname: 'laptop', timestamp: '2026-03-26T10:00:00Z' },
    });
  });

  after(async () => { await closeApp(app); });

  it('enriches project list with latest_session when include=latest', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects?include=latest', headers: authHeader() });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.length >= 1);
    const project = body.data.find(p => p.id === 'github.com:test:enrich');
    assert.ok(project.latest_session);
    assert.equal(project.latest_session.id, 'enrich-sess');
  });

  it('does not enrich without include=latest', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects', headers: authHeader() });
    const body = JSON.parse(res.body);
    const project = body.data.find(p => p.id === 'github.com:test:enrich');
    assert.equal(project.latest_session, undefined);
  });
});

describe('Session stub auto-creation (out-of-order events)', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => { await closeApp(app); });

  it('creates stub session on heartbeat before session.start', async () => {
    // Send heartbeat before session.start — should not crash (FK violation fix)
    const res = await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: { event_type: 'session.heartbeat', session_id: 'ooo-sess', project_id: 'github.com:test:ooo', timestamp: '2026-03-26T10:01:00Z', payload: { status: 'active' } },
    });
    assert.equal(res.statusCode, 201);

    // Session should exist (stub auto-created, then heartbeat transitions to active)
    const sessRes = await app.inject({ method: 'GET', url: '/api/sessions/ooo-sess', headers: authHeader() });
    assert.equal(sessRes.statusCode, 200);
    const session = JSON.parse(sessRes.body);
    assert.ok(['unknown', 'active'].includes(session.status), 'stub should be created');
  });

  it('upgrades stub to active on session.start arrival', async () => {
    await app.inject({
      method: 'POST', url: '/api/events', headers: authHeader(),
      payload: {
        event_type: 'session.start', session_id: 'ooo-sess', project_id: 'github.com:test:ooo',
        hostname: 'laptop', timestamp: '2026-03-26T10:00:00Z',
        payload: { interface: 'terminal', device_label: 'laptop' },
      },
    });

    const sessRes = await app.inject({ method: 'GET', url: '/api/sessions/ooo-sess', headers: authHeader() });
    const session = JSON.parse(sessRes.body);
    assert.equal(session.status, 'active');
    assert.equal(session.hostname, 'laptop');
  });
});

describe('Project pagination', () => {
  let app;

  before(async () => {
    app = await buildApp();
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST', url: '/api/events', headers: authHeader(),
        payload: { event_type: 'session.start', session_id: `pag-sess-${i}`, project_id: `github.com:test:pag-${i}`, timestamp: `2026-03-26T10:0${i}:00Z` },
      });
    }
  });

  after(async () => { await closeApp(app); });

  it('respects limit parameter on project list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects?limit=2', headers: authHeader() });
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 2);
    assert.equal(body.limit, 2);
    assert.equal(body.offset, 0);
  });

  it('respects offset parameter on project list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects?limit=2&offset=2', headers: authHeader() });
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 1);
  });
});
