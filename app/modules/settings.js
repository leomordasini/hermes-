import { registerModule, db, toast, confirm, escHtml } from '../app.js';

const STORES = ['team_members', 'one_on_ones', 'goals', 'projects', 'action_items', 'notes', 'reviews'];

const STORE_LABELS = {
  team_members: 'Team Members',
  one_on_ones: '1-on-1s',
  goals: 'Goals',
  projects: 'Projects',
  action_items: 'Action Items',
  notes: 'Notes',
  reviews: 'Reviews'
};

async function getStoreCounts() {
  const counts = {};
  for (const store of STORES) {
    try {
      const records = await db.getAll(store);
      counts[store] = records.length;
    } catch {
      counts[store] = 0;
    }
  }
  return counts;
}

async function handleExport() {
  try {
    const data = await db.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datadog-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Data exported successfully', 'success');
  } catch (err) {
    console.error('Export failed:', err);
    toast('Export failed: ' + err.message, 'error');
  }
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const ok = await confirm('Import data from this file? This may overwrite existing records.');
  if (!ok) {
    e.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importData(data);
    toast('Data imported successfully', 'success');
    // Re-render to update stats
    renderSettings(document.getElementById('settings-container'));
  } catch (err) {
    console.error('Import failed:', err);
    toast('Import failed: ' + err.message, 'error');
  }
  e.target.value = '';
}

async function renderSettings(container) {
  container.id = 'settings-container';

  // Fetch data in parallel
  const [counts, auditLog] = await Promise.all([
    getStoreCounts(),
    db.getAuditLog(null, 50).catch(() => [])
  ]);

  const totalRecords = Object.values(counts).reduce((sum, c) => sum + c, 0);

  container.innerHTML = `
    <div class="page-header">
      <h1>⚙️ Settings</h1>
      <p>Manage your data, view audit logs, and configure the application.</p>
    </div>

    <!-- Data Management -->
    <div class="card">
      <h2>Data Management</h2>
      <p>Export or import your data for backup and migration purposes.</p>

      <div class="stats-grid" style="margin-bottom: 1.5rem;">
        ${STORES.map(store => `
          <div class="stat-card">
            <div class="stat-value">${counts[store]}</div>
            <div class="stat-label">${escHtml(STORE_LABELS[store])}</div>
          </div>
        `).join('')}
        <div class="stat-card">
          <div class="stat-value">${totalRecords}</div>
          <div class="stat-label">Total Records</div>
        </div>
      </div>

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;">
        <button class="btn btn-primary" id="btn-export-data">
          📦 Export All Data
        </button>

        <div class="form-group" style="margin: 0;">
          <label class="btn btn-secondary" for="input-import-data" style="cursor: pointer; margin: 0;">
            📥 Import Data
          </label>
          <input type="file" id="input-import-data" accept=".json,application/json" style="display: none;" />
        </div>
      </div>
    </div>

    <!-- Audit Log -->
    <div class="card">
      <h2>Audit Log</h2>
      <p>Recent changes across all data stores (last 50 entries).</p>

      ${auditLog.length === 0
        ? '<p><em>No audit log entries yet.</em></p>'
        : `<div style="overflow-x: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Store</th>
                  <th>Action</th>
                  <th>Record ID</th>
                </tr>
              </thead>
              <tbody>
                ${auditLog.map(entry => `
                  <tr>
                    <td>${escHtml(new Date(entry.timestamp).toLocaleString())}</td>
                    <td>${escHtml(STORE_LABELS[entry.store] || entry.store)}</td>
                    <td><span class="badge badge-${actionBadge(entry.action)}">${escHtml(entry.action)}</span></td>
                    <td><code>${escHtml(String(entry.recordId || '—'))}</code></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>

    <!-- About -->
    <div class="card">
      <h2>About</h2>
      <table class="data-table" style="max-width: 500px;">
        <tbody>
          <tr>
            <td><strong>Application</strong></td>
            <td>Datadog Manager Portal</td>
          </tr>
          <tr>
            <td><strong>Version</strong></td>
            <td>1.0.0</td>
          </tr>
          <tr>
            <td><strong>Storage</strong></td>
            <td>Data is stored in IndexedDB and persists across code changes</td>
          </tr>
          <tr>
            <td><strong>Source</strong></td>
            <td><a href="https://github.com/nousresearch/datadog-manager" target="_blank" rel="noopener">GitHub Repository ↗</a></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Bind event listeners
  container.querySelector('#btn-export-data').addEventListener('click', handleExport);
  container.querySelector('#input-import-data').addEventListener('change', handleImport);
}

function actionBadge(action) {
  if (!action) return 'secondary';
  const a = action.toLowerCase();
  if (a === 'create' || a === 'add') return 'success';
  if (a === 'update' || a === 'edit') return 'warning';
  if (a === 'delete' || a === 'remove') return 'danger';
  return 'secondary';
}

registerModule({
  id: 'settings',
  label: 'Settings',
  icon: '⚙️',
  section: 'system',
  order: 90,
  render: renderSettings
});
