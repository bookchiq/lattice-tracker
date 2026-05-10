import fp from 'fastify-plugin';

const DEFAULT_TRUSTED_CIDRS = [
  '127.0.0.0/8',     // IPv4 loopback
  '::1/128',         // IPv6 loopback
  '10.0.0.0/8',      // RFC1918
  '172.16.0.0/12',   // RFC1918
  '192.168.0.0/16',  // RFC1918
  '100.64.0.0/10',   // Tailscale CGNAT
];

function parseBool(v) {
  return typeof v === 'string' && ['true', '1', 'yes'].includes(v.toLowerCase());
}

async function configPlugin(fastify, opts = {}) {
  const overrides = opts.configOverrides || {};

  const authDisabled = overrides.authDisabled ?? parseBool(process.env.LATTICE_AUTH_DISABLED);

  const token = overrides.apiToken ?? process.env.LATTICE_API_TOKEN;
  if (!token && !authDisabled) {
    throw new Error('LATTICE_API_TOKEN environment variable is required (or set LATTICE_AUTH_DISABLED=true for trusted-network deployments)');
  }

  const trustedCidrs = overrides.trustedCidrs
    ?? (process.env.LATTICE_TRUSTED_CIDRS
      ? process.env.LATTICE_TRUSTED_CIDRS.split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_TRUSTED_CIDRS);

  const dashboardOrigin = overrides.dashboardOrigin ?? process.env.LATTICE_DASHBOARD_ORIGIN ?? 'http://localhost:3377';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !process.env.LATTICE_DASHBOARD_ORIGIN && !overrides.dashboardOrigin) {
    fastify.log.warn('LATTICE_DASHBOARD_ORIGIN not set — CORS defaults to http://localhost:3377. Set LATTICE_DASHBOARD_ORIGIN for production.');
  }

  const config = {
    port: overrides.port ?? parseInt(process.env.PORT || '3377', 10),
    dbPath: overrides.dbPath ?? process.env.LATTICE_DB_PATH ?? './lattice.db',
    apiToken: token || null,
    authDisabled,
    trustedCidrs,
    host: overrides.host ?? process.env.LATTICE_HOST ?? '127.0.0.1',
    dashboardOrigin,
  };

  fastify.decorate('config', config);
}

export default fp(configPlugin, {
  name: 'lattice-config',
  fastify: '5.x',
});
