import fp from 'fastify-plugin';
import ipaddr from 'ipaddr.js';

const DEFAULT_TRUSTED_CIDRS = [
  '127.0.0.0/8',     // IPv4 loopback
  '::1/128',         // IPv6 loopback
  '100.64.0.0/10',   // Tailscale CGNAT
];

function parseBool(v) {
  return typeof v === 'string' && ['true', '1', 'yes'].includes(v.toLowerCase());
}

async function configPlugin(fastify, opts = {}) {
  const overrides = opts.configOverrides || {};

  const authDisabled = 'authDisabled' in overrides
    ? overrides.authDisabled
    : parseBool(process.env.LATTICE_AUTH_DISABLED);

  const token = 'apiToken' in overrides ? overrides.apiToken : process.env.LATTICE_API_TOKEN;
  if (!token && !authDisabled) {
    throw new Error('LATTICE_API_TOKEN environment variable is required (or set LATTICE_AUTH_DISABLED=true for trusted-network deployments)');
  }

  const trustedCidrs = 'trustedCidrs' in overrides
    ? overrides.trustedCidrs
    : (process.env.LATTICE_TRUSTED_CIDRS
      ? process.env.LATTICE_TRUSTED_CIDRS.split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_TRUSTED_CIDRS);

  // Validate every trusted CIDR at boot — fail loud rather than silently widening at request time.
  for (const cidr of trustedCidrs) {
    try {
      ipaddr.parseCIDR(cidr);
    } catch {
      throw new Error(`Invalid CIDR in trustedCidrs: ${JSON.stringify(cidr)} — check LATTICE_TRUSTED_CIDRS`);
    }
  }

  const dashboardOrigin = 'dashboardOrigin' in overrides
    ? overrides.dashboardOrigin
    : (process.env.LATTICE_DASHBOARD_ORIGIN ?? 'http://localhost:3377');
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !process.env.LATTICE_DASHBOARD_ORIGIN && !('dashboardOrigin' in overrides)) {
    fastify.log.warn('LATTICE_DASHBOARD_ORIGIN not set — CORS defaults to http://localhost:3377. Set LATTICE_DASHBOARD_ORIGIN for production.');
  }

  const host = 'host' in overrides
    ? overrides.host
    : (process.env.LATTICE_HOST ?? '127.0.0.1');

  // Refuse to bind publicly when auth is disabled — operators must explicitly opt in.
  if (authDisabled && (host === '0.0.0.0' || host === '::')
      && process.env.LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND !== 'true') {
    throw new Error(
      `Refusing to start: LATTICE_AUTH_DISABLED=true with LATTICE_HOST=${host} would expose the API on a public interface without authentication. ` +
      `Bind to 127.0.0.1 (default), or set LATTICE_AUTH_DISABLED_ALLOW_PUBLIC_BIND=true to override (not recommended).`
    );
  }

  const config = {
    port: 'port' in overrides ? overrides.port : parseInt(process.env.PORT || '3377', 10),
    dbPath: 'dbPath' in overrides ? overrides.dbPath : (process.env.LATTICE_DB_PATH ?? './lattice.db'),
    apiToken: token || null,
    authDisabled,
    trustedCidrs,
    host,
    dashboardOrigin,
  };

  fastify.decorate('config', config);
}

export default fp(configPlugin, {
  name: 'lattice-config',
  fastify: '5.x',
});
