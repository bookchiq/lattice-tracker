import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { buildApp } from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_TOKEN = 'test-token-for-lattice';

let dbCounter = 0;

export async function buildTestApp() {
  dbCounter++;
  const dbPath = path.join(__dirname, `test-${process.pid}-${dbCounter}.db`);

  const app = await buildApp({
    logger: false,
    dbPath,
    apiToken: TEST_TOKEN,
    host: '127.0.0.1',
    port: 0,
    dashboardOrigin: 'http://localhost:3377',
    rateLimitMax: 1000,
  });

  app._testDbPath = dbPath;
  return app;
}

// Keep the old name as an alias for backwards compatibility
export { buildTestApp as buildApp };

export function authHeader() {
  return { Authorization: `Bearer ${TEST_TOKEN}` };
}

export async function closeApp(app) {
  await app.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { unlinkSync(app._testDbPath + suffix); } catch { /* ignore */ }
  }
}
