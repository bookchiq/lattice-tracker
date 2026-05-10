import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, closeApp } from './helpers.js';

describe('GET /api/config (discovery manifest)', () => {
  describe('with auth enabled (default)', () => {
    let app;

    before(async () => {
      app = await buildApp();
    });

    after(async () => {
      await closeApp(app);
    });

    it('returns 200 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      assert.equal(res.statusCode, 200);
    });

    it('reports authDisabled:false when auth is enabled', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.equal(body.authDisabled, false);
    });

    it('includes version from package.json', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.equal(body.version, '0.1.0');
    });

    it('includes the full eventTypes list', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.deepEqual(body.eventTypes, [
        'session.start',
        'session.end',
        'session.heartbeat',
        'session.waiting',
        'session.checkpoint',
        'git.snapshot',
        'git.commit',
        'git.branch_switch',
        'git.pr_created',
        'project.tag',
      ]);
    });

    it('includes rateLimit { max, windowSeconds }', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.deepEqual(body.rateLimit, { max: 100, windowSeconds: 60 });
    });

    it('exposes exactly the documented keys (no accidental decorator pollution)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.deepEqual(
        Object.keys(body).sort(),
        ['authDisabled', 'eventTypes', 'rateLimit', 'version'].sort()
      );
    });
  });

  describe('with auth disabled (trusted-network mode)', () => {
    let app;

    before(async () => {
      app = await buildApp({ authDisabled: true, apiToken: null });
    });

    after(async () => {
      await closeApp(app);
    });

    it('reports authDisabled:true when auth is disabled', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.authDisabled, true);
    });
  });
});
