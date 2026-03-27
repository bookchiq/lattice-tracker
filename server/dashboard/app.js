// Lattice Dashboard — Vanilla JS SPA

// --- Auth ---

const TOKEN_KEY = 'lattice_token';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function initAuth() {
  // Check URL hash for token (#token=...)
  const hash = window.location.hash;
  if (hash.startsWith('#token=')) {
    const token = hash.slice(7);
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
  loadProjects();
}

// --- API ---

async function apiFetch(path) {
  const token = getToken();
  if (!token) {
    showAuthScreen();
    throw new Error('Not authenticated');
  }

  const res = await fetch(`/api${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearToken();
    showAuthScreen();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
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
    document.getElementById('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
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

  // Load data
  if (name === 'projects') {
    loadProjects();
    projectsPoller = createPoller(loadProjects, { interval: 60000 });
  } else if (name === 'active') {
    loadActiveSessions();
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
  const body = await apiFetch('/projects');
  const projects = body.data || [];

  // Fetch detail for each to get latest_session (the list endpoint doesn't include it)
  const detailed = await Promise.all(
    projects.map(p => apiFetch(`/projects/${encodeURIComponent(p.id)}`).catch(() => p))
  );

  renderProjectList(detailed);
}

function renderProjectList(projects) {
  const container = document.getElementById('project-list');
  const empty = document.getElementById('projects-empty');
  const tpl = document.getElementById('tpl-project-card');

  if (!projects.length) {
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

  for (const project of projects) {
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

  if (!sessions.length) {
    container.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const fragment = document.createDocumentFragment();

  for (const session of sessions) {
    const el = tpl.content.cloneNode(true).firstElementChild;
    el.dataset.id = session.id;

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
    const project = await apiFetch(`/projects/${encodeURIComponent(projectId)}`);
    const sessionsBody = await apiFetch(`/projects/${encodeURIComponent(projectId)}/sessions?limit=10`);
    const sessions = sessionsBody.data || [];

    renderProjectDetail(project, sessions);
  } catch (err) {
    detail.innerHTML = `<div class="empty-state"><p>Failed to load project: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderProjectDetail(project, sessions) {
  const detail = document.getElementById('view-detail');
  const name = project.display_name || project.canonical_name || project.id;
  const snapshot = project.latest_snapshot;
  const checkpoint = project.latest_checkpoint;

  let html = `
    <div class="detail-header">
      <div>
        <h2 class="detail-title">${escapeHtml(name)}</h2>
        <div class="detail-id">${escapeHtml(project.id)}</div>
        ${project.client_tag ? `<span class="badge badge-tag" style="margin-top:8px">${escapeHtml(project.client_tag)}</span>` : ''}
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
          ${snapshot.has_uncommitted_changes ? '<div style="color:var(--color-warning)">Has uncommitted changes</div>' : ''}
        </div>
      </div>
    `;
  }

  // Checkpoint
  if (checkpoint) {
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
        </div>
      </div>
    `;
  }

  // Sessions
  html += `<div class="detail-section"><h3>Session History</h3>`;
  if (sessions.length) {
    html += '<div class="session-list">';
    for (const s of sessions) {
      html += `
        <div class="session-item">
          <div>
            <span class="${badgeClass(s.status)}">${statusLabel(s.status)}</span>
            <span style="margin-left:8px;font-size:0.8125rem;color:var(--color-text-muted)">${escapeHtml(s.id)}</span>
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
}

// --- Utilities ---

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
initAuth();
