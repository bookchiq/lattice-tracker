import fp from 'fastify-plugin';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQueries } from '../db/queries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function dbPlugin(fastify) {
  const dbPath = fastify.config.dbPath;
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -20000');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Migration system using user_version
  const currentVersion = db.pragma('user_version', { simple: true });

  if (currentVersion < 1) {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    db.pragma('user_version = 1');
    fastify.log.info('Applied migration 1: initial schema');
  }

  // Stale session cleanup
  const staleCleanup = db.prepare(`
    UPDATE sessions
    SET status = 'abandoned'
    WHERE status = 'active'
      AND last_heartbeat_at IS NOT NULL
      AND last_heartbeat_at < datetime('now', '-10 minutes')
  `);

  function cleanupStaleSessions() {
    const result = staleCleanup.run();
    if (result.changes > 0) {
      fastify.log.info(`Marked ${result.changes} stale session(s) as abandoned`);
    }
  }

  // Run at startup and every 5 minutes
  cleanupStaleSessions();
  const cleanupTimer = setInterval(cleanupStaleSessions, 5 * 60 * 1000);

  fastify.decorate('db', db);
  fastify.decorate('queries', createQueries(db));

  fastify.addHook('onClose', async (instance) => {
    clearInterval(cleanupTimer);
    instance.db.pragma('optimize');
    instance.db.close();
    instance.log.info('Database connection closed');
  });
}

export default fp(dbPlugin, {
  name: 'lattice-db',
  dependencies: ['lattice-config'],
  fastify: '5.x',
});
