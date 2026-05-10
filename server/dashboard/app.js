// Lattice Dashboard — Vanilla JS SPA

// --- Auth ---

const TOKEN_KEY = 'lattice_token';
let authDisabled = false;
let authReady;

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function initAuth() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      authDisabled = cfg.authDisabled === true;
    }
  } catch { /* keep default: authDisabled=false (fail-closed) */ }

  if (authDisabled) {
    document.getElementById('btn-logout').hidden = true;
    showApp();
    return;
  }

  // Check URL hash for token (#token=...)
  const hash = window.location.hash;
  if (hash.startsWith('#token=')) {
    const token = decodeURIComponent(hash.slice(7));
    if (token) setToken(token);
    history.replaceState(null, '', window.location.pathname);
  }

  if (getToken()) {
    showApp();
  } else {
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('app').hidden = true;
}

function showApp() {
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app').hidden = false;
  loadProjects().catch(err => {
    console.error('Failed to load projects:', err.message);
    // Don't bounce to login on load failure — the token might be valid
    // but the API might be temporarily unreachable
    document.getElementById('error-banner').classList.add('visible');
  });
}

// --- API ---

async function apiFetch(path, init = {}) {
  await authReady;
  const headers = { ...(init.headers || {}) };
  if (!authDisabled) {
    const token = getToken();
    if (!token) {
      showAuthScreen();
      throw new Error('Not authenticated');
    }
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Default to JSON when sending a body
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 401 && !authDisabled) {
    clearToken();
    showAuthScreen();
    throw new Error('Invalid token');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

// --- Time ---

const UNITS = [
  { unit: 'year',   seconds: 31_536_000 },
  { unit: 'month',  seconds: 2_592_000 },
  { unit: 'week',   seconds: 604_800 },
  { unit: 'day',    seconds: 86_400 },
  { unit: 'hour',   seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
  { unit: 'second', seconds: 1 },
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const elapsed = (new Date(dateStr) - Date.now()) / 1000;
  for (const { unit, seconds } of UNITS) {
    if (Math.abs(elapsed) >= seconds || unit === 'second') {
      return rtf.format(Math.round(elapsed / seconds), unit);
    }
  }
  return '';
}

function updateTimeElements() {
  for (const el of document.querySelectorAll('[data-time]')) {
    if (el.dataset.time) {
      el.textContent = timeAgo(el.dataset.time);
    }
  }
}

// --- Polling ---

function createPoller(fetchFn, { interval = 15000, maxInterval = 60000, maxErrors = 10 } = {}) {
  let timer = null;
  let errorCount = 0;
  let stopped = false;

  async function poll() {
    if (stopped) return;
    try {
      await fetchFn();
      errorCount = 0;
      document.getElementById('error-banner').classList.remove('visible');
      schedule(interval);
      document.getElementById('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      errorCount++;
      if (errorCount >= maxErrors) {
        document.getElementById('error-banner').classList.add('visible');
        stopped = true;
        return;
      }
      const backoff = Math.min(interval * 2 ** errorCount + Math.random() * 1000, maxInterval);
      schedule(backoff);
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(poll, ms);
  }

  function stop() { stopped = true; clearTimeout(timer); }
  function restart() { stopped = false; errorCount = 0; poll(); }

  poll();
  return { stop, restart };
}

// --- Views ---

let currentView = 'projects';
let projectsPoller = null;
let sessionsPoller = null;
let deviceFilter = '';
let knownDevices = new Set();

function showView(name) {
  // Stop pollers
  if (projectsPoller) { projectsPoller.stop(); projectsPoller = null; }
  if (sessionsPoller) { sessionsPoller.stop(); sessionsPoller = null; }

  currentView = name;

  // Update tabs
  for (const btn of document.querySelectorAll('.tab-nav button')) {
    btn.classList.toggle('active', btn.dataset.view === name);
  }

  // Show/hide views
  for (const view of document.querySelectorAll('.view')) {
    view.classList.toggle('active', view.id === `view-${name}`);
  }

  // Load data (createPoller calls fetchFn immediately, no separate load needed)
  if (name === 'projects') {
    projectsPoller = createPoller(loadProjects, { interval: 60000 });
  } else if (name === 'active') {
    sessionsPoller = createPoller(loadActiveSessions, { interval: 15000 });
  }
}

// --- Status helpers ---

function getProjectStatus(project) {
  const session = project.latest_session;
  if (!session) return 'idle';
  if (session.status === 'waiting_for_input') return 'waiting';
  if (session.status === 'active') return 'active';
  return 'idle';
}

function statusLabel(status) {
  const labels = {
    active: 'Active', waiting: 'Waiting', waiting_for_input: 'Waiting',
    idle: 'Idle', completed: 'Completed', abandoned: 'Abandoned',
  };
  return labels[status] || status;
}

function badgeClass(status) {
  const map = {
    active: 'badge-active', waiting: 'badge-waiting', waiting_for_input: 'badge-waiting',
    idle: 'badge-idle', completed: 'badge-completed', abandoned: 'badge-abandoned',
  };
  return `badge ${map[status] || 'badge-idle'}`;
}

// --- Project list ---

async function loadProjects() {
  const body = await apiFetch('/projects?include=latest');
  const projects = body.data || [];
  renderProjectList(projects);
}

function renderProjectList(projects) {
  const container = document.getElementById('project-list');
  const empty = document.getElementById('projects-empty');
  const tpl = document.getElementById('tpl-project-card');

  // Track known devices for the filter dropdown
  for (const p of projects) {
    const session = p.latest_session;
    if (session) {
      const device = session.device_label || session.hostname;
      if (device) knownDevices.add(device);
    }
  }
  updateDeviceDropdown();

  // Apply device filter
  const filtered = deviceFilter
    ? projects.filter(p => {
        const s = p.latest_session;
        return s && (s.device_label === deviceFilter || s.hostname === deviceFilter);
      })
    : projects;

  if (!filtered.length) {
    container.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // Reconcile: update existing, add new, remove stale
  const existingMap = new Map();
  for (const child of container.children) {
    existingMap.set(child.dataset.id, child);
  }

  const fragment = document.createDocumentFragment();
  const newIds = new Set();

  for (const project of filtered) {
    newIds.add(project.id);
    let el = existingMap.get(project.id);

    if (!el) {
      el = tpl.content.cloneNode(true).firstElementChild;
      el.dataset.id = project.id;
      el.addEventListener('click', () => showProjectDetail(project.id));
    }

    const status = getProjectStatus(project);
    const name = project.display_name || project.canonical_name || project.id;
    const snapshot = project.latest_snapshot;
    const session = project.latest_session;

    el.classList.toggle('waiting', status === 'waiting');
    el.querySelector('[data-field="name"]').textContent = name;

    const badge = el.querySelector('[data-field="status"]');
    badge.className = badgeClass(status);
    badge.textContent = statusLabel(status);

    const tagEl = el.querySelector('[data-field="tag"]');
    if (project.client_tag) {
      tagEl.innerHTML = `<span class="badge badge-tag">${escapeHtml(project.client_tag)}</span>`;
    } else {
      tagEl.textContent = '';
    }

    const actEl = el.querySelector('[data-field="activity"]');
    actEl.textContent = project.last_activity_at ? timeAgo(project.last_activity_at) : '';
    actEl.dataset.time = project.last_activity_at || '';

    el.querySelector('[data-field="device"]').textContent =
      session ? `${session.device_label || session.hostname || ''}` : '';

    el.querySelector('[data-field="branch"]').textContent =
      snapshot ? snapshot.branch || '' : '';

    fragment.appendChild(el);
  }

  container.replaceChildren(fragment);
}

// --- Active sessions ---

async function loadActiveSessions() {
  const body = await apiFetch('/sessions?status=active,waiting_for_input');
  const sessions = body.data || [];

  // Sort: waiting first
  sessions.sort((a, b) => {
    if (a.status === 'waiting_for_input' && b.status !== 'waiting_for_input') return -1;
    if (b.status === 'waiting_for_input' && a.status !== 'waiting_for_input') return 1;
    return 0;
  });

  renderSessionList(sessions);
}

function renderSessionList(sessions) {
  const container = document.getElementById('session-list');
  const empty = document.getElementById('sessions-empty');
  const tpl = document.getElementById('tpl-session-card');

  // Track known devices
  for (const s of sessions) {
    const device = s.device_label || s.hostname;
    if (device) knownDevices.add(device);
  }
  updateDeviceDropdown();

  // Apply device filter
  const filtered = deviceFilter
    ? sessions.filter(s => s.device_label === deviceFilter || s.hostname === deviceFilter)
    : sessions;

  if (!filtered.length) {
    container.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // Reconcile: update existing, add new, remove stale
  const existingMap = new Map();
  for (const child of container.children) {
    existingMap.set(child.dataset.id, child);
  }

  const fragment = document.createDocumentFragment();
  const newIds = new Set();

  for (const session of filtered) {
    newIds.add(session.id);
    let el = existingMap.get(session.id);

    if (!el) {
      el = tpl.content.cloneNode(true).firstElementChild;
      el.dataset.id = session.id;
    }

    el.classList.toggle('waiting', session.status === 'waiting_for_input');

    el.querySelector('[data-field="project"]').textContent = session.project_id || 'Unknown';

    const badge = el.querySelector('[data-field="status"]');
    badge.className = badgeClass(session.status);
    badge.textContent = statusLabel(session.status);

    el.querySelector('[data-field="device"]').textContent =
      session.device_label || session.hostname || '';

    el.querySelector('[data-field="interface"]').textContent = session.interface || '';

    const startedEl = el.querySelector('[data-field="started"]');
    startedEl.textContent = session.started_at ? timeAgo(session.started_at) : '';
    startedEl.dataset.time = session.started_at || '';

    fragment.appendChild(el);
  }

  container.replaceChildren(fragment);
}

// --- Project detail ---

async function showProjectDetail(projectId) {
  // Stop pollers
  if (projectsPoller) { projectsPoller.stop(); projectsPoller = null; }
  if (sessionsPoller) { sessionsPoller.stop(); sessionsPoller = null; }

  // Update tabs (deselect all)
  for (const btn of document.querySelectorAll('.tab-nav button')) {
    btn.classList.remove('active');
  }

  // Show detail view
  for (const view of document.querySelectorAll('.view')) {
    view.classList.toggle('active', view.id === 'view-detail');
  }

  const detail = document.getElementById('view-detail');
  detail.innerHTML = '<div class="skeleton skeleton-card"></div>';

  try {
    const [project, sessionsBody, notesBody] = await Promise.all([
      apiFetch(`/projects/${encodeURIComponent(projectId)}`),
      apiFetch(`/projects/${encodeURIComponent(projectId)}/sessions?limit=10`),
      apiFetch(`/projects/${encodeURIComponent(projectId)}/notes?limit=50`),
    ]);
    renderProjectDetail(project, sessionsBody.data || [], notesBody.data || []);
  } catch (err) {
    detail.innerHTML = `<div class="empty-state"><p>Failed to load project: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderProjectDetail(project, sessions, notes = []) {
  const detail = document.getElementById('view-detail');
  const name = project.display_name || project.canonical_name || project.id;
  const snapshot = project.latest_snapshot;
  const checkpoint = project.latest_checkpoint;
  const fallbackName = project.canonical_name || project.id;

  let html = `
    <div class="detail-header">
      <div class="detail-header-main">
        <div class="detail-title-row" id="detail-title-row">
          <h2 class="detail-title">${escapeHtml(name)}</h2>
          <button class="btn-edit-project" id="btn-edit-project" type="button" aria-label="Edit project name and tag" title="Edit name and tag">Edit</button>
        </div>
        <div class="detail-id">${escapeHtml(project.id)}</div>
        ${project.client_tag ? `<span class="badge badge-tag detail-tag">${escapeHtml(project.client_tag)}</span>` : ''}
        <form class="edit-project-form" id="edit-project-form" hidden>
          <label class="edit-project-field">
            <span>Display name</span>
            <input type="text" id="edit-display-name" maxlength="255" value="${escapeHtml(project.display_name || '')}" placeholder="${escapeHtml(fallbackName)}">
          </label>
          <label class="edit-project-field">
            <span>Tag</span>
            <input type="text" id="edit-client-tag" maxlength="255" value="${escapeHtml(project.client_tag || '')}" placeholder="e.g. work, client-name">
          </label>
          <div class="edit-project-actions">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" id="btn-cancel-edit">Cancel</button>
          </div>
          <div class="edit-project-error" id="edit-project-error" hidden></div>
        </form>
      </div>
      <button class="btn-back" id="btn-back">Back to projects</button>
    </div>
  `;

  // Git state
  if (snapshot) {
    html += `
      <div class="detail-section">
        <h3>Git State</h3>
        <div class="git-state">
          <div>Branch: <strong>${escapeHtml(snapshot.branch || 'unknown')}</strong></div>
          <div>Commit: ${escapeHtml(snapshot.commit_hash || '')} ${escapeHtml(snapshot.commit_message || '')}</div>
          ${snapshot.has_uncommitted_changes ? '<div class="uncommitted-warning">Has uncommitted changes</div>' : ''}
        </div>
      </div>
    `;
  }

  // Checkpoint
  if (checkpoint) {
    const contextBlock = [
      `Project: ${name}`,
      `Branch: ${checkpoint.branch || 'unknown'}`,
      `Last Commit: ${checkpoint.last_commit || 'unknown'}`,
      '',
      `Summary: ${checkpoint.summary || 'None'}`,
      `In Progress: ${checkpoint.in_progress || 'None'}`,
      checkpoint.blocked_on ? `Blocked On: ${checkpoint.blocked_on}` : '',
      `Next Steps: ${checkpoint.next_steps || 'None'}`,
    ].filter(Boolean).join('\n');

    html += `
      <div class="detail-section">
        <h3>Latest Checkpoint</h3>
        <div class="checkpoint-block">
          <dl>
            <dt>Summary</dt><dd>${escapeHtml(checkpoint.summary || 'None')}</dd>
            <dt>In Progress</dt><dd>${escapeHtml(checkpoint.in_progress || 'None')}</dd>
            <dt>Next Steps</dt><dd>${escapeHtml(checkpoint.next_steps || 'None')}</dd>
            <dt>Branch</dt><dd>${escapeHtml(checkpoint.branch || 'unknown')}</dd>
            <dt>Last Commit</dt><dd>${escapeHtml(checkpoint.last_commit || 'unknown')}</dd>
          </dl>
          <button class="btn-copy-context" id="btn-copy-context" title="Copy context for a new Claude Code session">Continue in Claude Code</button>
        </div>
      </div>
    `;

    // Store for copy handler after innerHTML assignment
    detail._contextBlock = contextBlock;
  }

  // Notes
  html += `<div class="detail-section">
    <h3>Notes</h3>
    <form class="note-form" id="note-form">
      <textarea id="note-text" class="note-input" rows="3" maxlength="4096" placeholder="Add a note about this project — anything fresh in your mind."></textarea>
      <div class="note-form-row">
        <span class="note-counter" id="note-counter">0 / 4096</span>
        <button type="submit" class="btn-primary" id="btn-add-note">Add note</button>
      </div>
      <div class="edit-project-error" id="note-error" hidden></div>
    </form>
    <div class="note-list" id="note-list">
      ${notes.length ? notes.map(renderNote).join('') : '<div class="empty-state-inline">No notes yet.</div>'}
    </div>
  </div>`;

  // Sessions
  html += `<div class="detail-section"><h3>Session History</h3>`;
  if (sessions.length) {
    html += '<div class="session-list">';
    for (const s of sessions) {
      html += `
        <div class="session-item">
          <div>
            <span class="${badgeClass(s.status)}">${statusLabel(s.status)}</span>
            <span class="session-id-label">${escapeHtml(s.id)}</span>
          </div>
          <div class="session-item-meta">
            <span>${escapeHtml(s.device_label || s.hostname || '')}</span>
            <span>${escapeHtml(s.interface || '')}</span>
            <span data-time="${s.started_at || ''}">${s.started_at ? timeAgo(s.started_at) : ''}</span>
          </div>
        </div>
      `;
    }
    html += '</div>';
  } else {
    html += '<div class="empty-state"><p>No sessions recorded.</p></div>';
  }
  html += '</div>';

  detail.innerHTML = html;

  document.getElementById('btn-back').addEventListener('click', () => showView('projects'));

  const copyBtn = document.getElementById('btn-copy-context');
  if (copyBtn && detail._contextBlock) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(detail._contextBlock).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Continue in Claude Code'; }, 2000);
      });
    });
  }

  // --- Inline edit (display_name + client_tag) ---
  const titleRow = document.getElementById('detail-title-row');
  const editBtn = document.getElementById('btn-edit-project');
  const form = document.getElementById('edit-project-form');
  const cancelBtn = document.getElementById('btn-cancel-edit');
  const errorEl = document.getElementById('edit-project-error');
  const nameInput = document.getElementById('edit-display-name');

  function showEditMode() {
    titleRow.hidden = true;
    form.hidden = false;
    errorEl.hidden = true;
    nameInput.focus();
    nameInput.select();
  }
  function hideEditMode() {
    form.hidden = true;
    titleRow.hidden = false;
  }

  editBtn.addEventListener('click', showEditMode);
  cancelBtn.addEventListener('click', hideEditMode);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const body = {
      display_name: nameInput.value.trim(),
      client_tag: document.getElementById('edit-client-tag').value.trim(),
    };
    try {
      await apiFetch(`/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      // Re-render the detail view with fresh data
      const [fresh, sessionsBody, notesBody] = await Promise.all([
        apiFetch(`/projects/${encodeURIComponent(project.id)}`),
        apiFetch(`/projects/${encodeURIComponent(project.id)}/sessions?limit=10`),
        apiFetch(`/projects/${encodeURIComponent(project.id)}/notes?limit=50`),
      ]);
      renderProjectDetail(fresh, sessionsBody.data || [], notesBody.data || []);
    } catch (err) {
      errorEl.textContent = `Couldn't save: ${err.message}`;
      errorEl.hidden = false;
    }
  });

  // --- Add note ---
  const noteForm = document.getElementById('note-form');
  const noteText = document.getElementById('note-text');
  const noteCounter = document.getElementById('note-counter');
  const noteError = document.getElementById('note-error');
  const noteList = document.getElementById('note-list');
  const addNoteBtn = document.getElementById('btn-add-note');

  function updateCounter() {
    noteCounter.textContent = `${noteText.value.length} / 4096`;
  }
  updateCounter();
  noteText.addEventListener('input', updateCounter);

  noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    noteError.hidden = true;
    const text = noteText.value.trim();
    if (!text) return;

    addNoteBtn.disabled = true;
    addNoteBtn.textContent = 'Adding…';
    try {
      await apiFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          event_type: 'project.note',
          project_id: project.id,
          timestamp: new Date().toISOString(),
          hostname: 'dashboard',
          payload: { text },
        }),
      });
      // Optimistically prepend; also re-fetch in the background to stay correct
      const newNote = {
        text: text.slice(0, 4096),
        timestamp: new Date().toISOString(),
        hostname: 'dashboard',
      };
      // Replace the empty-state if present
      const empty = noteList.querySelector('.empty-state-inline');
      if (empty) noteList.innerHTML = '';
      noteList.insertAdjacentHTML('afterbegin', renderNote(newNote));
      noteText.value = '';
      updateCounter();
    } catch (err) {
      noteError.textContent = `Couldn't add note: ${err.message}`;
      noteError.hidden = false;
    } finally {
      addNoteBtn.disabled = false;
      addNoteBtn.textContent = 'Add note';
    }
  });
}

function renderNote(note) {
  const ts = note.timestamp || '';
  const author = note.hostname ? escapeHtml(note.hostname) : 'unknown';
  return `
    <div class="note-item">
      <div class="note-meta">
        <span class="note-author">${author}</span>
        <span data-time="${ts}">${ts ? timeAgo(ts) : ''}</span>
      </div>
      <div class="note-text">${escapeHtml(note.text || '')}</div>
    </div>
  `;
}

// --- Device filter ---

function updateDeviceDropdown() {
  const select = document.getElementById('device-filter');
  const devices = [...knownDevices].sort();
  const current = select.value;

  // Only rebuild if devices changed
  if (select.options.length - 1 === devices.length) return;

  select.innerHTML = '<option value="">All devices</option>';
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  }
  select.value = current;
}

// --- Utilities ---

function escapeHtml(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

// --- Theme ---

const THEME_KEY = 'lattice_theme';

// SVG icons for each theme state
const THEME_ICONS = {
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  auto: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/><line x1="12" y1="8" x2="12" y2="12" stroke-dasharray="2 2"/>',
};

const THEME_TITLES = {
  auto: 'Theme: System',
  light: 'Theme: Light',
  dark: 'Theme: Dark',
};

function getStoredTheme() {
  try {
    const val = localStorage.getItem(THEME_KEY);
    if (val === 'light' || val === 'dark') return val;
  } catch (_) { /* private browsing */ }
  return 'auto';
}

function setStoredTheme(value) {
  try {
    if (value === 'auto') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, value);
    }
  } catch (_) { /* private browsing */ }
}

function resolveTheme(preference) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved) {
  document.documentElement.classList.toggle('theme-dark', resolved === 'dark');
}

function updateToggleButtons(preference) {
  const icon = THEME_ICONS[preference];
  const title = THEME_TITLES[preference];
  for (const btn of document.querySelectorAll('.theme-toggle')) {
    btn.querySelector('svg').innerHTML = icon;
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }
}

function cycleTheme() {
  const current = getStoredTheme();
  const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
  setStoredTheme(next);
  applyTheme(resolveTheme(next));
  updateToggleButtons(next);
}

// Listen for OS theme changes (only affects auto mode)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getStoredTheme() === 'auto') {
    applyTheme(resolveTheme('auto'));
  }
});

// Init theme toggle buttons
function initTheme() {
  const pref = getStoredTheme();
  applyTheme(resolveTheme(pref));
  updateToggleButtons(pref);

  document.getElementById('auth-theme-toggle').addEventListener('click', cycleTheme);
  document.getElementById('app-theme-toggle').addEventListener('click', cycleTheme);
}

// --- Init ---

document.getElementById('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const token = document.getElementById('token-input').value.trim();
  if (token) {
    setToken(token);
    showApp();
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  clearToken();
  showAuthScreen();
});

document.getElementById('tab-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (btn) showView(btn.dataset.view);
});

document.getElementById('device-filter').addEventListener('change', (e) => {
  deviceFilter = e.target.value;
  // Re-trigger current view to apply filter
  if (currentView === 'projects' && projectsPoller) {
    loadProjects().catch(() => {});
  } else if (currentView === 'active' && sessionsPoller) {
    loadActiveSessions().catch(() => {});
  }
});

// Pause polling when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (projectsPoller) projectsPoller.stop();
    if (sessionsPoller) sessionsPoller.stop();
  } else {
    if (currentView === 'projects' && projectsPoller) projectsPoller.restart();
    if (currentView === 'active' && sessionsPoller) sessionsPoller.restart();
  }
});

// Online/offline banners
window.addEventListener('offline', () => {
  document.getElementById('error-banner').classList.add('visible');
});
window.addEventListener('online', () => {
  document.getElementById('error-banner').classList.remove('visible');
});

// Auto-update relative timestamps
setInterval(updateTimeElements, 30000);

// Boot
initTheme();
authReady = initAuth();
