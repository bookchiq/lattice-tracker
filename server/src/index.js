import { buildApp } from './app.js';

const fastify = await buildApp({ logger: true });

// Graceful shutdown
const shutdown = async (signal) => {
  fastify.log.info(`Received ${signal}, shutting down`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start
try {
  await fastify.listen({ port: fastify.config.port, host: fastify.config.host });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
