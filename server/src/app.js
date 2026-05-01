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
import snapshotRoutes from './routes/snapshots.js';
import healthRoutes from './routes/health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build a configured Fastify application without starting it.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.logger=true]          - Fastify logger setting
 * @param {string}  [opts.dbPath]               - Override database path
 * @param {string}  [opts.apiToken]             - Override API token
 * @param {string}  [opts.host]                 - Override listen host
 * @param {number}  [opts.port]                 - Override listen port
 * @param {string}  [opts.dashboardOrigin]      - Override dashboard origin for CORS
 * @param {number}  [opts.rateLimitMax=100]     - Rate-limit max requests per window
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildApp(opts = {}) {
  const {
    logger = true,
    dbPath,
    apiToken,
    host,
    port,
    dashboardOrigin,
    rateLimitMax = 100,
  } = opts;

  const app = Fastify({ logger });

  // Config plugin with optional overrides
  const configOverrides = {};
  if (dbPath !== undefined) configOverrides.dbPath = dbPath;
  if (apiToken !== undefined) configOverrides.apiToken = apiToken;
  if (host !== undefined) configOverrides.host = host;
  if (port !== undefined) configOverrides.port = port;
  if (dashboardOrigin !== undefined) configOverrides.dashboardOrigin = dashboardOrigin;

  await app.register(configPlugin, { configOverrides });

  await app.register(cors, {
    origin: app.config.dashboardOrigin,
    methods: ['GET', 'POST', 'PATCH'],
  });

  await app.register(dbPlugin);
  await app.register(authPlugin);

  // Security headers
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (request.url.startsWith('/api/')) return;
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'");
  });

  // Static dashboard (1 hour cache)
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'dashboard'),
    prefix: '/',
    maxAge: 3600000,
  });

  // API routes — rate limiter scoped to /api/ only
  await app.register(async function apiRoutes(api) {
    await api.register(rateLimit, {
      max: rateLimitMax,
      timeWindow: '1 minute',
    });

    await api.register(healthRoutes);
    await api.register(eventRoutes);
    await api.register(projectRoutes);
    await api.register(sessionRoutes);
    await api.register(snapshotRoutes);
  }, { prefix: '/api' });

  return app;
}
