import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, closeApp } from './helpers.js';
import { EVENT_TYPES } from '../src/constants/event-types.js';

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
      assert.deepEqual(body.eventTypes, EVENT_TYPES);
    });

    it('includes rateLimit { max, windowSeconds }', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.deepEqual(body.rateLimit, { max: 100, windowSeconds: 60 });
    });

    it('includes an endpoints map covering per-project sub-resources', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.equal(typeof body.endpoints, 'object');
      assert.notEqual(body.endpoints, null);

      // Spot-check a few well-known keys, including project sub-resources.
      assert.equal(body.endpoints.events, '/api/events');
      assert.equal(body.endpoints.projects, '/api/projects');
      assert.equal(body.endpoints.projectNotes, '/api/projects/:id/notes');
      assert.equal(body.endpoints.projectSessions, '/api/projects/:id/sessions');
      assert.equal(body.endpoints.projectCheckpoints, '/api/projects/:id/checkpoints');
      assert.equal(body.endpoints.health, '/api/health');
      assert.equal(body.endpoints.config, '/api/config');
    });

    it('exposes exactly the documented keys (no accidental decorator pollution)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/config' });
      const body = res.json();
      assert.deepEqual(
        Object.keys(body).sort(),
        ['authDisabled', 'endpoints', 'eventTypes', 'rateLimit', 'version'].sort()
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
