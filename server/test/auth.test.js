import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, authHeader, closeApp } from './helpers.js';

describe('Auth', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await closeApp(app);
  });

  it('rejects requests without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    assert.equal(res.statusCode, 401);
  });

  it('rejects requests with wrong token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { Authorization: 'Bearer wrong-token' },
    });
    assert.equal(res.statusCode, 401);
  });

  it('allows requests with correct token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authHeader(),
    });
    assert.equal(res.statusCode, 200);
  });

  it('allows health endpoint without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.statusCode, 200);
  });

  it('allows dashboard without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
  });
});
