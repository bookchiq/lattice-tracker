import Fastify from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import configPlugin from './plugins/config.js';
import dbPlugin from './plugins/db.js';
import authPlugin from './plugins/auth.js';
import eventRoutes from './routes/events.js';
import projectRoutes from './routes/projects.js';
import sessionRoutes from './routes/sessions.js';
import healthRoutes from './routes/health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

// Plugins (order matters)
await fastify.register(configPlugin);

await fastify.register(cors, {
  origin: fastify.config.dashboardOrigin,
  methods: ['GET', 'POST', 'PATCH'],
});

await fastify.register(dbPlugin);
await fastify.register(authPlugin);

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Security headers
fastify.addHook('onSend', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
});

// Static dashboard
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'dashboard'),
  prefix: '/',
});

// API routes
await fastify.register(healthRoutes, { prefix: '/api' });
await fastify.register(eventRoutes, { prefix: '/api' });
await fastify.register(projectRoutes, { prefix: '/api' });
await fastify.register(sessionRoutes, { prefix: '/api' });

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
  await fastify.listen({ port: fastify.config.port, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
