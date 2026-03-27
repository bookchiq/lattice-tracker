/**
 * Git Archive Export
 *
 * Exports SQLite tables to JSONL files and commits to a private git repo.
 * Designed to run as a cron job on the VPS.
 *
 * Usage:
 *   node server/src/services/git-archive.js
 *
 * Environment:
 *   LATTICE_DB_PATH       - Path to SQLite database (default: ./data/lattice.db)
 *   LATTICE_ARCHIVE_REPO  - Git remote URL for archive repo
 *   LATTICE_ARCHIVE_DIR   - Local clone path (default: /tmp/lattice-archive)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.LATTICE_DB_PATH || './data/lattice.db';
const ARCHIVE_REPO = process.env.LATTICE_ARCHIVE_REPO;
const ARCHIVE_DIR = process.env.LATTICE_ARCHIVE_DIR || '/tmp/lattice-archive';

const TABLES = ['projects', 'sessions', 'events', 'git_snapshots', 'checkpoints'];

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts }).trim();
}

function exportTable(db, table, outDir) {
  const outPath = path.join(outDir, `${table}.jsonl`);
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  const lines = rows.map(row => JSON.stringify(row));
  fs.writeFileSync(outPath, lines.join('\n') + (lines.length ? '\n' : ''));
  return rows.length;
}

async function main() {
  if (!ARCHIVE_REPO) {
    console.error('LATTICE_ARCHIVE_REPO is not set. Skipping archive export.');
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  // Ensure local clone exists
  if (!fs.existsSync(path.join(ARCHIVE_DIR, '.git'))) {
    console.log(`Cloning ${ARCHIVE_REPO} → ${ARCHIVE_DIR}`);
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    run(`git clone "${ARCHIVE_REPO}" "${ARCHIVE_DIR}"`);
  } else {
    run('git pull --ff-only', { cwd: ARCHIVE_DIR });
  }

  // Export tables
  const db = new Database(DB_PATH, { readonly: true });
  const dataDir = path.join(ARCHIVE_DIR, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  console.log('Exporting tables:');
  for (const table of TABLES) {
    const count = exportTable(db, table, dataDir);
    console.log(`  ${table}: ${count} rows`);
  }
  db.close();

  // Check for changes
  const status = run('git status --porcelain', { cwd: ARCHIVE_DIR });
  if (!status) {
    console.log('No changes to commit.');
    return;
  }

  // Commit and push
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  run('git add -A', { cwd: ARCHIVE_DIR });
  run(`git commit -m "archive: export ${timestamp}"`, { cwd: ARCHIVE_DIR });
  run('git push', { cwd: ARCHIVE_DIR });

  console.log(`Archive pushed at ${timestamp}`);
}

main().catch(err => {
  console.error('Archive export failed:', err.message);
  process.exit(1);
});
