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
    // Defaults are now narrow: loopback (v4 + v6) + Tailscale CGNAT only.
    assert.deepEqual(
      app.config.trustedCidrs,
      ['127.0.0.0/8', '::1/128', '100.64.0.0/10']
    );
    // RFC1918 ranges are no longer trusted by default.
    assert.ok(!app.config.trustedCidrs.includes('10.0.0.0/8'));
    assert.ok(!app.config.trustedCidrs.includes('172.16.0.0/12'));
    assert.ok(!app.config.trustedCidrs.includes('192.168.0.0/16'));

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

  describe('public-bind refusal when auth disabled', () => {
    it('refuses to start when authDisabled=true and host=0.0.0.0 without override', async () => {
      const savedOverride = process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND;
      delete process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND;

      const app = Fastify({ logger: false });
      await assert.rejects(
        () => app.register(configPlugin, {
          configOverrides: { authDisabled: true, apiToken: null, host: '0.0.0.0' },
        }).ready(),
        /LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND/
      );
      await app.close();

      if (savedOverride !== undefined) process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND = savedOverride;
    });

    it('refuses to start when authDisabled=true and host=:: without override', async () => {
      const savedOverride = process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND;
      delete process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND;

      const app = Fastify({ logger: false });
      await assert.rejects(
        () => app.register(configPlugin, {
          configOverrides: { authDisabled: true, apiToken: null, host: '::' },
        }).ready(),
        /LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND/
      );
      await app.close();

      if (savedOverride !== undefined) process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND = savedOverride;
    });

    it('allows authDisabled=true with host=0.0.0.0 when LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND=true', async () => {
      const savedOverride = process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND;
      process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND = 'true';

      const app = Fastify({ logger: false });
      await app.register(configPlugin, {
        configOverrides: { authDisabled: true, apiToken: null, host: '0.0.0.0' },
      });
      await app.ready();

      assert.equal(app.config.authDisabled, true);
      assert.equal(app.config.host, '0.0.0.0');

      await app.close();

      if (savedOverride === undefined) delete process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND;
      else process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND = savedOverride;
    });

    it('allows authDisabled=true with default host (127.0.0.1)', async () => {
      const app = Fastify({ logger: false });
      await app.register(configPlugin, {
        configOverrides: { authDisabled: true, apiToken: null, host: '127.0.0.1' },
      });
      await app.ready();

      assert.equal(app.config.authDisabled, true);
      assert.equal(app.config.host, '127.0.0.1');

      await app.close();
    });

    it('allows host=0.0.0.0 when auth is enabled', async () => {
      const app = Fastify({ logger: false });
      await app.register(configPlugin, {
        configOverrides: { authDisabled: false, apiToken: 'real-token', host: '0.0.0.0' },
      });
      await app.ready();

      assert.equal(app.config.authDisabled, false);
      assert.equal(app.config.host, '0.0.0.0');

      await app.close();
    });
  });

  describe('trustedCidrs validation at boot', () => {
    it('throws when a CIDR has an out-of-range prefix', async () => {
      const app = Fastify({ logger: false });
      await assert.rejects(
        () => app.register(configPlugin, {
          configOverrides: {
            apiToken: 'tok',
            trustedCidrs: ['10.0.0.0/200'],
          },
        }).ready(),
        /Invalid CIDR in trustedCidrs.*10\.0\.0\.0\/200/
      );
      await app.close();
    });

    it('throws when a CIDR has a negative prefix', async () => {
      const app = Fastify({ logger: false });
      await assert.rejects(
        () => app.register(configPlugin, {
          configOverrides: {
            apiToken: 'tok',
            trustedCidrs: ['10.0.0.0/-1'],
          },
        }).ready(),
        /Invalid CIDR in trustedCidrs/
      );
      await app.close();
    });

    it('throws when a CIDR has a non-numeric prefix', async () => {
      const app = Fastify({ logger: false });
      await assert.rejects(
        () => app.register(configPlugin, {
          configOverrides: {
            apiToken: 'tok',
            trustedCidrs: ['10.0.0.0/abc'],
          },
        }).ready(),
        /Invalid CIDR in trustedCidrs/
      );
      await app.close();
    });

    it('throws when a CIDR has a malformed address', async () => {
      const app = Fastify({ logger: false });
      await assert.rejects(
        () => app.register(configPlugin, {
          configOverrides: {
            apiToken: 'tok',
            trustedCidrs: ['not-an-ip/24'],
          },
        }).ready(),
        /Invalid CIDR in trustedCidrs.*not-an-ip/
      );
      await app.close();
    });

    it('accepts valid IPv4 and IPv6 CIDRs', async () => {
      const app = Fastify({ logger: false });
      await app.register(configPlugin, {
        configOverrides: {
          apiToken: 'tok',
          trustedCidrs: ['127.0.0.0/8', '::1/128', '2001:db8::/32', '10.0.0.0/8'],
        },
      });
      await app.ready();

      assert.deepEqual(
        app.config.trustedCidrs,
        ['127.0.0.0/8', '::1/128', '2001:db8::/32', '10.0.0.0/8']
      );

      await app.close();
    });
  });

  describe('explicit-null overrides do not leak from process.env', () => {
    it('apiToken: null + authDisabled: true ignores LATTICE_API_TOKEN from env', async () => {
      const savedTok = process.env.LATTICE_API_TOKEN;
      process.env.LATTICE_API_TOKEN = 'env-leaked-token';

      const app = Fastify({ logger: false });
      await app.register(configPlugin, {
        configOverrides: { apiToken: null, authDisabled: true },
      });
      await app.ready();

      assert.equal(app.config.apiToken, null);

      await app.close();

      if (savedTok === undefined) delete process.env.LATTICE_API_TOKEN;
      else process.env.LATTICE_API_TOKEN = savedTok;
    });
  });
});
