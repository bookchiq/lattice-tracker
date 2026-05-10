import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import configPlugin from '../src/plugins/config.js';

describe('Config plugin', () => {
  it('throws if LATTICE_API_TOKEN is missing and auth is not disabled', async () => {
    const savedTok = process.env.LATTICE_API_TOKEN;
    const savedDisabled = process.env.LATTICE_AUTH_DISABLED;
    delete process.env.LATTICE_API_TOKEN;
    delete process.env.LATTICE_AUTH_DISABLED;

    const app = Fastify({ logger: false });
    await assert.rejects(
      () => app.register(configPlugin).ready(),
      /LATTICE_API_TOKEN environment variable is required/
    );
    await app.close();

    if (savedTok !== undefined) process.env.LATTICE_API_TOKEN = savedTok;
    if (savedDisabled !== undefined) process.env.LATTICE_AUTH_DISABLED = savedDisabled;
  });

  it('allows missing token when LATTICE_AUTH_DISABLED=true', async () => {
    const savedTok = process.env.LATTICE_API_TOKEN;
    delete process.env.LATTICE_API_TOKEN;
    process.env.LATTICE_AUTH_DISABLED = 'true';

    const app = Fastify({ logger: false });
    await app.register(configPlugin);
    await app.ready();

    assert.equal(app.config.authDisabled, true);
    assert.equal(app.config.apiToken, null);
    assert.ok(Array.isArray(app.config.trustedCidrs));
    assert.ok(app.config.trustedCidrs.includes('127.0.0.0/8'));
    assert.ok(app.config.trustedCidrs.includes('100.64.0.0/10'));

    await app.close();
    delete process.env.LATTICE_AUTH_DISABLED;
    if (savedTok !== undefined) process.env.LATTICE_API_TOKEN = savedTok;
  });

  it('parses LATTICE_TRUSTED_CIDRS from env', async () => {
    process.env.LATTICE_API_TOKEN = 'test-tok';
    process.env.LATTICE_AUTH_DISABLED = 'true';
    process.env.LATTICE_TRUSTED_CIDRS = '127.0.0.0/8, 192.168.1.0/24';

    const app = Fastify({ logger: false });
    await app.register(configPlugin);
    await app.ready();

    assert.deepEqual(app.config.trustedCidrs, ['127.0.0.0/8', '192.168.1.0/24']);

    await app.close();
    delete process.env.LATTICE_AUTH_DISABLED;
    delete process.env.LATTICE_TRUSTED_CIDRS;
  });

  it('decorates fastify with config', async () => {
    process.env.LATTICE_API_TOKEN = 'test-tok';
    process.env.PORT = '4000';
    process.env.LATTICE_DB_PATH = '/tmp/test.db';

    const app = Fastify({ logger: false });
    await app.register(configPlugin);
    await app.ready();

    assert.equal(app.config.apiToken, 'test-tok');
    assert.equal(app.config.port, 4000);
    assert.equal(app.config.dbPath, '/tmp/test.db');
    assert.equal(app.config.authDisabled, false);

    await app.close();
  });
});
