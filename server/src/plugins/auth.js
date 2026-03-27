import fp from 'fastify-plugin';

async function authPlugin(fastify) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (request.url === '/api/health' && request.method === 'GET') return;

    const header = request.headers.authorization;
    if (!header) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing Authorization header' });
      return;
    }

    const token = header.replace(/^Bearer\s+/i, '');
    if (token !== fastify.config.apiToken) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' });
      return;
    }
  });
}

export default fp(authPlugin, {
  name: 'lattice-auth',
  dependencies: ['lattice-config'],
  fastify: '5.x',
});
