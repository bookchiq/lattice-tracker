import Fastify from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import configPlugin from '../src/plugins/config.js';
import dbPlugin from '../src/plugins/db.js';
import authPlugin from '../src/plugins/auth.js';
import eventRoutes from '../src/routes/events.js';
import projectRoutes from '../src/routes/projects.js';
import sessionRoutes from '../src/routes/sessions.js';
import healthRoutes from '../src/routes/health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_TOKEN = 'test-token-for-lattice';

let dbCounter = 0;

export async function buildApp() {
  dbCounter++;
  const dbPath = path.join(__dirname, `test-${process.pid}-${dbCounter}.db`);

  // Set env vars for the config plugin
  process.env.LATTICE_API_TOKEN = TEST_TOKEN;
  process.env.LATTICE_DB_PATH = dbPath;
  process.env.PORT = '0'; // random port

  const app = Fastify({ logger: false });

  await app.register(configPlugin);
  await app.register(cors, { origin: true });
  await app.register(dbPlugin);
  await app.register(authPlugin);
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });

  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'dashboard'),
    prefix: '/',
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(eventRoutes, { prefix: '/api' });
  await app.register(projectRoutes, { prefix: '/api' });
  await app.register(sessionRoutes, { prefix: '/api' });

  app._testDbPath = dbPath;
  return app;
}

export function authHeader() {
  return { Authorization: `Bearer ${TEST_TOKEN}` };
}

export async function closeApp(app) {
  await app.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { unlinkSync(app._testDbPath + suffix); } catch { /* ignore */ }
  }
}
