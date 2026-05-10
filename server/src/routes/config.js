export default async function configRoutes(fastify) {
  fastify.get('/config', async () => {
    return { authRequired: !fastify.config.authDisabled };
  });
}
