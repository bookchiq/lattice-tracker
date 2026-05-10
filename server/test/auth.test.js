import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, authHeader, closeApp } from './helpers.js';
import { isTrustedIp, ipInCidr } from '../src/plugins/auth.js';

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

  it('exposes /api/config without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { authRequired: true });
  });

  it('allows dashboard without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
  });
});

describe('Auth disabled (trusted-network mode)', () => {
  let app;

  before(async () => {
    // localhost (127.0.0.1) is in the default trusted CIDRs, so injected requests
    // — which arrive from 127.0.0.1 — should be allowed without a token
    app = await buildApp({ authDisabled: true, apiToken: null });
  });

  after(async () => {
    await closeApp(app);
  });

  it('reports authRequired:false via /api/config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { authRequired: false });
  });

  it('allows API request with no token from trusted IP', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    assert.equal(res.statusCode, 200);
  });

  it('rejects API request from untrusted IP (X-Forwarded-For not honored by default)', async () => {
    // Use a tight CIDR list that excludes 127.* to simulate an "untrusted" caller
    const tightApp = await buildApp({
      authDisabled: true,
      apiToken: null,
      trustedCidrs: ['10.0.0.0/8'],
    });
    try {
      const res = await tightApp.inject({ method: 'GET', url: '/api/projects' });
      assert.equal(res.statusCode, 401);
    } finally {
      await closeApp(tightApp);
    }
  });
});

describe('CIDR helpers', () => {
  it('matches IPv4 CIDR', () => {
    assert.equal(ipInCidr('127.0.0.1', '127.0.0.0/8'), true);
    assert.equal(ipInCidr('100.64.0.1', '100.64.0.0/10'), true);
    assert.equal(ipInCidr('100.127.255.255', '100.64.0.0/10'), true);
    assert.equal(ipInCidr('100.128.0.0', '100.64.0.0/10'), false);
    assert.equal(ipInCidr('8.8.8.8', '10.0.0.0/8'), false);
    assert.equal(ipInCidr('10.5.6.7', '10.0.0.0/8'), true);
  });

  it('matches single-address CIDR (no prefix)', () => {
    assert.equal(ipInCidr('1.2.3.4', '1.2.3.4'), true);
    assert.equal(ipInCidr('1.2.3.5', '1.2.3.4'), false);
  });

  it('matches IPv6 loopback exactly', () => {
    assert.equal(ipInCidr('::1', '::1'), true);
    assert.equal(ipInCidr('::2', '::1'), false);
  });

  it('isTrustedIp normalizes IPv4-mapped IPv6 addresses', () => {
    assert.equal(isTrustedIp('::ffff:127.0.0.1', ['127.0.0.0/8']), true);
    assert.equal(isTrustedIp('::ffff:8.8.8.8', ['127.0.0.0/8']), false);
  });

  it('isTrustedIp returns false for malformed input', () => {
    assert.equal(isTrustedIp(null, ['127.0.0.0/8']), false);
    assert.equal(isTrustedIp('', ['127.0.0.0/8']), false);
    assert.equal(isTrustedIp('not-an-ip', ['127.0.0.0/8']), false);
  });
});
