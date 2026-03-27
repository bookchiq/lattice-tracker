import fp from 'fastify-plugin';

async function configPlugin(fastify, opts = {}) {
  const overrides = opts.configOverrides || {};

  const token = overrides.apiToken ?? process.env.LATTICE_API_TOKEN;
  if (!token) {
    throw new Error('LATTICE_API_TOKEN environment variable is required');
  }

  const config = {
    port: overrides.port ?? parseInt(process.env.PORT || '3377', 10),
    dbPath: overrides.dbPath ?? process.env.LATTICE_DB_PATH ?? './lattice.db',
    apiToken: token,
    host: overrides.host ?? process.env.LATTICE_HOST ?? '127.0.0.1',
    dashboardOrigin: overrides.dashboardOrigin ?? process.env.LATTICE_DASHBOARD_ORIGIN ?? 'http://localhost:3377',
  };

  fastify.decorate('config', config);
}

export default fp(configPlugin, {
  name: 'lattice-config',
  fastify: '5.x',
});
