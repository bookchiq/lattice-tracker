import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, authHeader, closeApp } from './helpers.js';

describe('Project notes (project.note event)', () => {
  let app;
  const PROJECT_ID = 'local:test-notes';

  before(async () => {
    app = await buildApp();
    // Seed a project so FK constraints don't bite
    app.queries.upsertProject({
      id: PROJECT_ID,
      git_remote_url: null,
      canonical_name: 'test-notes',
      last_activity_at: '2026-05-10T00:00:00Z',
    });
  });

  after(async () => {
    await closeApp(app);
  });

  it('persists a note from a project.note event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'project.note',
        project_id: PROJECT_ID,
        timestamp: '2026-05-10T12:00:00Z',
        hostname: 'dashboard',
        payload: { text: 'First note — fresh in mind' },
      },
    });
    assert.equal(res.statusCode, 201);

    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${encodeURIComponent(PROJECT_ID)}/notes`,
      headers: authHeader(),
    });
    assert.equal(list.statusCode, 200);
    const body = list.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].text, 'First note — fresh in mind');
    assert.equal(body.data[0].hostname, 'dashboard');
    assert.equal(body.data[0].project_id, PROJECT_ID);
  });

  it('ignores notes with empty/whitespace text', async () => {
    const before = app.queries.getNotesByProjectId(PROJECT_ID).length;
    for (const text of ['', '   ', '\n\t']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: authHeader(),
        payload: {
          event_type: 'project.note',
          project_id: PROJECT_ID,
          timestamp: '2026-05-10T12:01:00Z',
          payload: { text },
        },
      });
      // Event itself is accepted (201), but no note row should be inserted
      assert.equal(res.statusCode, 201);
    }
    const after = app.queries.getNotesByProjectId(PROJECT_ID).length;
    assert.equal(after, before);
  });

  it('truncates notes longer than 4096 chars', async () => {
    const longText = 'x'.repeat(5000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: authHeader(),
      payload: {
        event_type: 'project.note',
        project_id: PROJECT_ID,
        timestamp: '2026-05-10T12:02:00Z',
        payload: { text: longText },
      },
    });
    assert.equal(res.statusCode, 201);
    const notes = app.queries.getNotesByProjectId(PROJECT_ID);
    const trimmed = notes.find(n => n.text.startsWith('xxx') && n.text.length === 4096);
    assert.ok(trimmed, 'expected a note truncated to 4096 chars');
  });

  it('returns notes in reverse-chronological order', async () => {
    // Insert two more notes with explicit timestamps
    app.queries.insertNote({
      project_id: PROJECT_ID,
      timestamp: '2026-05-10T08:00:00Z',
      text: 'Older note',
    });
    app.queries.insertNote({
      project_id: PROJECT_ID,
      timestamp: '2026-05-10T20:00:00Z',
      text: 'Newer note',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${encodeURIComponent(PROJECT_ID)}/notes`,
      headers: authHeader(),
    });
    const body = res.json();
    // Newest first
    assert.equal(body.data[0].text, 'Newer note');
    // The "Older note" should be later in the list than the noon-12:00 ones
    const olderIdx = body.data.findIndex(n => n.text === 'Older note');
    const newerIdx = body.data.findIndex(n => n.text === 'Newer note');
    assert.ok(newerIdx < olderIdx, 'newer note should appear before older note');
  });

  it('exposes project.note in /api/config eventTypes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    assert.ok(res.json().eventTypes.includes('project.note'));
  });
});
