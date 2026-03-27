import fp from 'fastify-plugin';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  // Stale session cleanup on startup
  const staleCleanup = db.prepare(`
    UPDATE sessions
    SET status = 'abandoned'
    WHERE status IN ('active', 'waiting_for_input')
      AND last_heartbeat_at IS NOT NULL
      AND last_heartbeat_at < datetime('now', '-10 minutes')
  `);
  const staleResult = staleCleanup.run();
  if (staleResult.changes > 0) {
    fastify.log.info(`Marked ${staleResult.changes} stale session(s) as abandoned`);
  }

  fastify.decorate('db', db);

  fastify.addHook('onClose', async (instance) => {
    instance.db.close();
    instance.log.info('Database connection closed');
  });
}

export default fp(dbPlugin, {
  name: 'lattice-db',
  dependencies: ['lattice-config'],
  fastify: '5.x',
});
