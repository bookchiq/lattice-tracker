import fp from 'fastify-plugin';
import { timingSafeEqual } from 'node:crypto';

function safeTokenCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function authPlugin(fastify) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (request.url.startsWith('/api/health') && request.method === 'GET') return;

    const header = request.headers.authorization;
    if (!header) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing Authorization header' });
      return;
    }

    const token = header.replace(/^Bearer\s+/i, '');
    if (!safeTokenCompare(token, fastify.config.apiToken)) {
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
