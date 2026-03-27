export default async function healthRoutes(fastify) {
  fastify.get('/health', async () => {
    return { ok: true, version: '0.1.0' };
  });
}
