import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, authHeader, closeApp } from './helpers.js';

describe('GET /api/health', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await closeApp(app);
  });

  it('returns 200 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.version, '0.1.0');
  });

  it('does not include uptime', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const body = JSON.parse(res.body);
    assert.equal(body.uptime, undefined);
  });
});
