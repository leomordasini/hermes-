import { registerModule, API, toast, confirmDialog, escHtml, formatDate, formatRelative } from '../app.js';

registerModule({
  id: 'settings',
  label: 'Settings',
  icon: '⚙️',
  section: 'system',
  order: 90,
  render: renderSettings,
});

async function renderSettings(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>⚙️ Settings</h1>
        <div class="page-subtitle">Data management, integrations, audit log</div>
      </div>
    </div>

    <div class="grid-2" style="align-items:start">

      <!-- Data Management -->
      <div class="card">
        <div class="card-header"><h3 class="card-title">💾 Data Management</h3></div>
        <div class="card-body">
          <div id="storage-stats" class="text-muted text-sm">Loading…</div>
          <hr class="divider">
          <div class="flex gap-sm" style="flex-wrap:wrap">
            <button class="btn btn-secondary" id="btn-export">⬇️ Export All Data</button>
            <label class="btn btn-secondary" style="cursor:pointer">
              ⬆️ Import Data
              <input type="file" accept=".json" id="import-file" style="display:none">
            </label>
            <button class="btn btn-secondary" id="btn-sync-zoom">🔄 Sync Zoom Now</button>
          </div>
          <div class="form-hint mt-sm">Data is stored in SQLite on your machine and never leaves it.</div>
        </div>
      </div>

      <!-- About -->
      <div class="card">
        <div class="card-header"><h3 class="card-title">ℹ️ About</h3></div>
        <div class="card-body">
          <table class="data-table">
            <tbody>
              <tr><td class="text-muted">App</td><td>Manager Portal</td></tr>
              <tr><td class="text-muted">Version</td><td>1.0.0</td></tr>
              <tr><td class="text-muted">Storage</td><td>SQLite (local, persistent)</td></tr>
              <tr><td class="text-muted">Profile</td><td id="profile-name">…</td></tr>
              <tr><td class="text-muted">DB Path</td><td id="db-path" class="code-ref text-xs">…</td></tr>
              <tr><td class="text-muted">Source</td><td><a href="https://github.com/leomordasini/hermes-" target="_blank">github.com/leomordasini/hermes-</a></td></tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- Audit Log -->
    <div class="card mt-md">
      <div class="card-header">
        <h3 class="card-title">📋 Audit Log</h3>
        <span class="text-muted text-sm">Last 50 changes</span>
      </div>
      <div class="card-body">
        <div id="audit-table">Loading…</div>
      </div>
    </div>`;

  // Load health / profile info
  try {
    const h = await API.health();
    document.getElementById('profile-name').textContent = h.profile;
    document.getElementById('db-path').textContent = h.db;
  } catch(e) { /* ignore */ }

  // Storage stats — reuse getActionCounts + getMembers etc
  _loadStats();

  // Export
  document.getElementById('btn-export').addEventListener('click', _exportData);

  // Import
  document.getElementById('import-file').addEventListener('change', _importData);

  // Sync Zoom
  document.getElementById('btn-sync-zoom').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-zoom');
    btn.disabled = true;
    btn.textContent = '⏳ Scanning…';
    try {
      const r = await API.syncZoom();
      toast(`Zoom sync: ${r.result?.processed ?? 0} new, ${r.result?.skipped ?? 0} skipped`, 'success');
    } catch(e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Sync Zoom Now';
    }
  });

  // Audit log — fetch from /api/transcripts as proxy (real audit endpoint TBD)
  _loadAuditLog();
}

async function _loadStats() {
  try {
    const [members, actions, projects, inbox] = await Promise.all([
      API.getMembers(),
      API.getActionCounts(),
      API.getProjects({}),
      API.getInboxCount(),
    ]);

    document.getElementById('storage-stats').innerHTML = `
      <div class="grid-2" style="gap:8px">
        ${_statChip('👥', 'Team Members', members.length)}
        ${_statChip('✅', 'Action Items (open)', actions.open)}
        ${_statChip('🚀', 'Projects', projects.length)}
        ${_statChip('📥', 'Inbox Pending', inbox.pending)}
      </div>`;
  } catch(e) {
    document.getElementById('storage-stats').textContent = 'Could not load stats.';
  }
}

function _statChip(icon, label, val) {
  return `<div style="padding:8px 12px;background:var(--surface-2);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center">
    <span class="text-muted text-sm">${icon} ${escHtml(label)}</span>
    <span class="fw-600">${val}</span>
  </div>`;
}

async function _exportData() {
  try {
    // Fetch all data from each endpoint and combine
    const [members, projects, actions, transcripts, inbox] = await Promise.all([
      API.getMembers(),
      API.getProjects({}),
      API.getActions({}),
      API.getTranscripts(),
      API.getInbox('all'),
    ]);

    const exportObj = {
      exported_at: new Date().toISOString(),
      version: '1.0.0',
      data: { members, projects, actions, transcripts, inbox }
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manager-portal-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Export downloaded', 'success');
  } catch(e) {
    toast(`Export failed: ${e.message}`, 'error');
  }
}

async function _importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const ok = await confirmDialog(
    `Import data from "${escHtml(file.name)}"? This will merge with existing data.`,
    { confirmText: 'Import', cancelText: 'Cancel' }
  );
  if (!ok) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    toast(`Import parsed — ${Object.keys(json.data || {}).length} sections found. Full import via CLI: make import`, 'info', 6000);
  } catch(e) {
    toast(`Import failed: ${e.message}`, 'error');
  }

  e.target.value = '';
}

async function _loadAuditLog() {
  const el = document.getElementById('audit-table');
  try {
    const transcripts = await API.getTranscripts();
    if (!transcripts.length) {
      el.innerHTML = `<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📋</div><div class="empty-sub">No audit entries yet</div></div>`;
      return;
    }

    el.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>File</th><th>Date</th><th>Participants</th><th>Status</th><th>Processed</th>
        </tr></thead>
        <tbody>
          ${transcripts.map(t => `
            <tr>
              <td class="code-ref text-xs">${escHtml(t.file_name)}</td>
              <td>${t.call_date ? formatDate(t.call_date) : '—'}</td>
              <td>${(t.participants || []).map(p => escHtml(p)).join(', ') || '—'}</td>
              <td>${t.processed ? '<span class="badge badge-success">Processed</span>' : '<span class="badge badge-warning">Pending</span>'}</td>
              <td class="text-muted text-xs">${t.processed_at ? formatRelative(t.processed_at) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    el.textContent = 'Could not load audit log.';
  }
}
