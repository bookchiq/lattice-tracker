import fp from 'fastify-plugin';

async function configPlugin(fastify) {
  const token = process.env.LATTICE_API_TOKEN;
  if (!token) {
    throw new Error('LATTICE_API_TOKEN environment variable is required');
  }

  const config = {
    port: parseInt(process.env.PORT || '3377', 10),
    dbPath: process.env.LATTICE_DB_PATH || './lattice.db',
    apiToken: token,
    host: process.env.LATTICE_HOST || '127.0.0.1',
    dashboardOrigin: process.env.LATTICE_DASHBOARD_ORIGIN || 'http://localhost:3377',
  };

  fastify.decorate('config', config);
}

export default fp(configPlugin, {
  name: 'lattice-config',
  fastify: '5.x',
});
