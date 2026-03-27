import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export default async function healthRoutes(fastify) {
  fastify.get('/health', async () => {
    return { ok: true, version };
  });
}
