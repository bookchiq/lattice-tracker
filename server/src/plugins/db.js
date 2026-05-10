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

  // Migration system using user_version. Each migration runs atomically:
  // DDL + version bump succeed or fail together. schema.sql is the v1
  // baseline only; later migrations live as inline blocks below.
  const currentVersion = db.pragma('user_version', { simple: true });

  function migrate(version, label, sql) {
    if (currentVersion < version) {
      db.transaction(() => {
        db.exec(sql);
        db.pragma(`user_version = ${version}`);
      })();
      fastify.log.info(`Applied migration ${version}: ${label}`);
    }
  }

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  migrate(1, 'initial schema', readFileSync(schemaPath, 'utf-8'));

  migrate(2, 'notes table', `
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
      hostname TEXT,
      timestamp TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_project_id_timestamp ON notes(project_id, timestamp DESC);
  `);

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
