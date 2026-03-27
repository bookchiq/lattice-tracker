import fp from 'fastify-plugin';

async function configPlugin(fastify, opts = {}) {
  const overrides = opts.configOverrides || {};

  const token = overrides.apiToken ?? process.env.LATTICE_API_TOKEN;
  if (!token) {
    throw new Error('LATTICE_API_TOKEN environment variable is required');
  }

  const dashboardOrigin = overrides.dashboardOrigin ?? process.env.LATTICE_DASHBOARD_ORIGIN ?? 'http://localhost:3377';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !process.env.LATTICE_DASHBOARD_ORIGIN && !overrides.dashboardOrigin) {
    fastify.log.warn('LATTICE_DASHBOARD_ORIGIN not set — CORS defaults to http://localhost:3377. Set LATTICE_DASHBOARD_ORIGIN for production.');
  }

  const config = {
    port: overrides.port ?? parseInt(process.env.PORT || '3377', 10),
    dbPath: overrides.dbPath ?? process.env.LATTICE_DB_PATH ?? './lattice.db',
    apiToken: token,
    host: overrides.host ?? process.env.LATTICE_HOST ?? '127.0.0.1',
    dashboardOrigin,
  };

  fastify.decorate('config', config);
}

export default fp(configPlugin, {
  name: 'lattice-config',
  fastify: '5.x',
});
