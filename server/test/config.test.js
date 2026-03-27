import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import configPlugin from '../src/plugins/config.js';

describe('Config plugin', () => {
  it('throws if LATTICE_API_TOKEN is missing', async () => {
    const saved = process.env.LATTICE_API_TOKEN;
    delete process.env.LATTICE_API_TOKEN;

    const app = Fastify({ logger: false });
    await assert.rejects(
      () => app.register(configPlugin).ready(),
      { message: 'LATTICE_API_TOKEN environment variable is required' }
    );
    await app.close();

    // Restore
    process.env.LATTICE_API_TOKEN = saved;
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

    await app.close();
  });
});
