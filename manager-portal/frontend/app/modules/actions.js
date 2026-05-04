import {
  registerModule, API, toast, openModal, closeModal, confirmDialog,
  escHtml, avatarHtml, statusBadge, priorityBadge,
  formatDate, formatRelative, pluralize
} from '../app.js';

// ─── Module Registration ──────────────────────────────────────────────────────

registerModule({
  id: 'actions',
  label: 'Action Items',
  icon: '✅',
  section: 'work',
  order: 21,
  render: renderActions
});

// ─── State ────────────────────────────────────────────────────────────────────

let _actions    = [];
let _filters    = { search: '', status: '', priority: '', source: '' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(action) {
  if (!action.due_date) return false;
  const done = ['done', 'completed', 'complete'].includes(String(action.status ?? '').toLowerCase());
  if (done) return false;
  return new Date(action.due_date) < new Date();
}

function isDoneThisWeek(action) {
  if (!['done', 'completed', 'complete'].includes(String(action.status ?? '').toLowerCase())) return false;
  if (!action.updated_at && !action.completed_at) return false;
  const updated = new Date(action.updated_at || action.completed_at);
  const now     = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return updated >= weekAgo;
}

function computeStats(actions) {
  const totalOpen    = actions.filter(a =>
    !['done', 'completed', 'complete'].includes(String(a.status ?? '').toLowerCase())
  ).length;
  const overdue      = actions.filter(isOverdue).length;
  const doneThisWeek = actions.filter(isDoneThisWeek).length;
  const inProgress   = actions.filter(a =>
    ['in_progress', 'in progress'].includes(String(a.status ?? '').toLowerCase())
  ).length;
  return { totalOpen, overdue, doneThisWeek, inProgress };
}

function sourceBadgeHtml(action) {
  const src = String(action.source ?? '').toLowerCase();
  const colors = {
    zoom:   'badge-blue',
    slack:  'badge-purple',
    gmail:  'badge-red',
    manual: 'badge-gray',
  };
  const cls   = colors[src] ?? 'badge-gray';
  const label = src || 'manual';

  if (src === 'zoom' && action.transcript_filename) {
    return `<span class="badge ${cls}">${escHtml(label)}</span>
            <span class="code-ref" title="${escHtml(action.transcript_filename)}">${escHtml(shortFilename(action.transcript_filename))}</span>`;
  }
  return `<span class="badge ${cls}">${escHtml(label)}</span>`;
}

function shortFilename(name) {
  if (!name) return '';
  return name.length > 22 ? '…' + name.slice(-20) : name;
}

function applyFilters(actions) {
  let result = actions;
  const { search, status, priority, source } = _filters;

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(a =>
      String(a.title ?? '').toLowerCase().includes(q) ||
      String(a.owed_to ?? '').toLowerCase().includes(q)
    );
  }
  if (status)   result = result.filter(a => String(a.status ?? '').toLowerCase() === status);
  if (priority) result = result.filter(a => String(a.priority ?? '').toLowerCase() === priority);
  if (source)   result = result.filter(a => String(a.source ?? '').toLowerCase() === source);

  return result;
}

// ─── Main Render ──────────────────────────────────────────────────────────────

async function renderActions(container, params = {}) {
  container.innerHTML = `<div class="loading-spinner-wrap"><div class="loading-spinner"></div></div>`;

  // Support pre-filtering via params
  if (params.status)   _filters.status   = params.status;
  if (params.member_id) {
    // handled server-side for member context
  }

  try {
    const fetchParams = {};
    if (params.member_id) fetchParams.member_id = params.member_id;
    _actions = await API.getActions(fetchParams);
    if (!Array.isArray(_actions)) _actions = _actions.actions ?? [];
    renderAll(container);
  } catch (err) {
    container.innerHTML = `<div class="error-state">⚠️ Failed to load actions: ${escHtml(err.message)}</div>`;
  }
}

function renderAll(container) {
  const stats    = computeStats(_actions);
  const filtered = applyFilters(_actions);

  container.innerHTML = `
    ${renderPageHeader()}
    ${renderStatsRow(stats)}
    ${renderFilterBar()}
    ${renderTable(filtered)}
  `;

  bindEvents(container);
}

// ─── Page Header ──────────────────────────────────────────────────────────────

function renderPageHeader() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1>✅ Action Items</h1>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary btn-sm" id="new-action-btn">+ Add Item</button>
      </div>
    </div>
  `;
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function renderStatsRow({ totalOpen, overdue, doneThisWeek, inProgress }) {
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalOpen}</div>
        <div class="stat-label">Total Open</div>
      </div>
      <div class="stat-card ${overdue > 0 ? 'stat-card-red' : ''}">
        <div class="stat-value">${overdue}</div>
        <div class="stat-label">Overdue</div>
      </div>
      <div class="stat-card stat-card-green">
        <div class="stat-value">${doneThisWeek}</div>
        <div class="stat-label">Done This Week</div>
      </div>
      <div class="stat-card stat-card-blue">
        <div class="stat-value">${inProgress}</div>
        <div class="stat-label">In Progress</div>
      </div>
    </div>
  `;
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function renderFilterBar() {
  const { search, status, priority, source } = _filters;

  return `
    <div class="filter-bar card">
      <input class="form-input filter-search" id="filter-search" type="search"
        placeholder="Search by title or owner…" value="${escHtml(search)}">

      <select class="form-select filter-select" id="filter-status">
        <option value="">All Statuses</option>
        ${['open','in_progress','done','blocked'].map(s =>
          `<option value="${s}" ${status === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`
        ).join('')}
      </select>

      <select class="form-select filter-select" id="filter-priority">
        <option value="">All Priorities</option>
        ${['critical','high','medium','low'].map(p =>
          `<option value="${p}" ${priority === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
        ).join('')}
      </select>

      <select class="form-select filter-select" id="filter-source">
        <option value="">All Sources</option>
        ${['zoom','slack','gmail','manual'].map(s =>
          `<option value="${s}" ${source === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
        ).join('')}
      </select>

      <button class="btn btn-ghost btn-sm" id="filter-clear-btn">Clear</button>
    </div>
  `;
}

// ─── Table ────────────────────────────────────────────────────────────────────

function renderTable(actions) {
  if (!actions.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">No action items found</div>
        <div class="empty-desc">
          ${Object.values(_filters).some(Boolean)
            ? 'Try clearing the filters.'
            : 'Add your first action item to get started.'}
        </div>
      </div>
    `;
  }

  const rows = actions.map(a => renderRow(a)).join('');

  return `
    <div class="card">
      <table class="data-table actions-table">
        <thead>
          <tr>
            <th class="th-check"></th>
            <th>Title</th>
            <th>Owed To</th>
            <th>Due Date</th>
            <th>Priority</th>
            <th>Source</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderRow(action) {
  const overdue = isOverdue(action);
  const done    = ['done', 'completed', 'complete'].includes(String(action.status ?? '').toLowerCase());
  const rowCls  = [
    overdue ? 'row-overdue' : '',
    done    ? 'row-done'    : '',
  ].filter(Boolean).join(' ');

  const dueCellHtml = action.due_date
    ? `<span class="${overdue ? 'text-danger' : ''}">${formatDate(action.due_date)}</span>
       ${overdue ? ' <span class="overdue-flag">⚠ Overdue</span>' : ''}`
    : '<span class="muted">—</span>';

  return `
    <tr class="${rowCls}" data-id="${action.id}">
      <td class="td-check">
        <input type="checkbox" class="action-complete-checkbox"
          data-id="${action.id}"
          ${done ? 'checked disabled' : ''}
          title="${done ? 'Completed' : 'Mark as complete'}">
      </td>
      <td class="td-title">
        <span class="action-title-link ${done ? 'strikethrough' : ''}"
          data-id="${action.id}" role="button" tabindex="0">
          ${escHtml(action.title ?? '')}
        </span>
      </td>
      <td class="td-owed">
        ${action.owed_to
          ? `${avatarHtml(action.owed_to, 'xs')} <span>${escHtml(action.owed_to)}</span>`
          : '<span class="muted">—</span>'}
      </td>
      <td class="td-due">${dueCellHtml}</td>
      <td class="td-priority">${priorityBadge(action.priority)}</td>
      <td class="td-source">${sourceBadgeHtml(action)}</td>
      <td class="td-status">${statusBadge(action.status)}</td>
      <td class="td-actions">
        <button class="btn btn-ghost btn-xs edit-action-btn" data-id="${action.id}" title="Edit">✏️</button>
        <button class="btn btn-ghost btn-xs delete-action-btn" data-id="${action.id}" title="Delete">🗑️</button>
      </td>
    </tr>
  `;
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function bindEvents(container) {
  // New action
  container.querySelector('#new-action-btn')?.addEventListener('click', () => {
    openActionForm(null, container);
  });

  // Filter: search (debounced)
  let searchTimer;
  container.querySelector('#filter-search')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      _filters.search = e.target.value.trim();
      refreshTable(container);
    }, 200);
  });

  // Filter: dropdowns
  container.querySelector('#filter-status')?.addEventListener('change', e => {
    _filters.status = e.target.value;
    refreshTable(container);
  });
  container.querySelector('#filter-priority')?.addEventListener('change', e => {
    _filters.priority = e.target.value;
    refreshTable(container);
  });
  container.querySelector('#filter-source')?.addEventListener('change', e => {
    _filters.source = e.target.value;
    refreshTable(container);
  });

  // Clear filters
  container.querySelector('#filter-clear-btn')?.addEventListener('click', () => {
    _filters = { search: '', status: '', priority: '', source: '' };
    renderAll(container);
  });

  // Complete checkboxes
  container.querySelectorAll('.action-complete-checkbox').forEach(cb => {
    cb.addEventListener('change', async e => {
      if (!e.target.checked) return;
      const id  = cb.dataset.id;
      cb.disabled = true;
      try {
        await API.completeAction(id);
        const idx = _actions.findIndex(a => String(a.id) === String(id));
        if (idx >= 0) _actions[idx] = { ..._actions[idx], status: 'done' };
        toast('Action marked complete. ✅', 'success');
        refreshTable(container);
        refreshStats(container);
      } catch (err) {
        toast(`Failed to complete: ${err.message}`, 'error');
        cb.checked  = false;
        cb.disabled = false;
      }
    });
  });

  // Title click → edit
  container.querySelectorAll('.action-title-link').forEach(el => {
    const handler = () => {
      const action = _actions.find(a => String(a.id) === String(el.dataset.id));
      if (action) openActionForm(action, container);
    };
    el.addEventListener('click', handler);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  // Edit buttons
  container.querySelectorAll('.edit-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = _actions.find(a => String(a.id) === String(btn.dataset.id));
      if (action) openActionForm(action, container);
    });
  });

  // Delete buttons
  container.querySelectorAll('.delete-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = _actions.find(a => String(a.id) === String(btn.dataset.id));
      const confirmed = await confirmDialog(
        `Delete this action item?`,
        `"${action?.title ?? ''}" will be permanently removed.`
      );
      if (!confirmed) return;
      try {
        await API.deleteAction(btn.dataset.id);
        _actions = _actions.filter(a => String(a.id) !== String(btn.dataset.id));
        toast('Action deleted.', 'success');
        renderAll(container);
      } catch (err) {
        toast(`Failed to delete: ${err.message}`, 'error');
      }
    });
  });
}

// Refresh just the table section without full re-render (preserves filter inputs)
function refreshTable(container) {
  const filtered  = applyFilters(_actions);
  const tableWrap = container.querySelector('.actions-table')?.closest('.card') ??
                    container.querySelector('.empty-state');
  const newTable  = document.createElement('div');
  newTable.innerHTML = renderTable(filtered);
  if (tableWrap) {
    tableWrap.replaceWith(newTable.firstElementChild);
  } else {
    container.insertAdjacentHTML('beforeend', renderTable(filtered));
  }
  // Re-bind only table events
  bindTableEvents(container);
}

// Refresh stats row in-place
function refreshStats(container) {
  const stats     = computeStats(_actions);
  const statsWrap = container.querySelector('.stats-grid');
  if (statsWrap) {
    const temp = document.createElement('div');
    temp.innerHTML = renderStatsRow(stats);
    statsWrap.replaceWith(temp.firstElementChild);
  }
}

function bindTableEvents(container) {
  container.querySelectorAll('.action-complete-checkbox').forEach(cb => {
    cb.addEventListener('change', async e => {
      if (!e.target.checked) return;
      cb.disabled = true;
      try {
        await API.completeAction(cb.dataset.id);
        const idx = _actions.findIndex(a => String(a.id) === String(cb.dataset.id));
        if (idx >= 0) _actions[idx] = { ..._actions[idx], status: 'done' };
        toast('Action marked complete. ✅', 'success');
        refreshTable(container);
        refreshStats(container);
      } catch (err) {
        toast(`Failed: ${err.message}`, 'error');
        cb.checked  = false;
        cb.disabled = false;
      }
    });
  });

  container.querySelectorAll('.action-title-link').forEach(el => {
    const handler = () => {
      const action = _actions.find(a => String(a.id) === String(el.dataset.id));
      if (action) openActionForm(action, container);
    };
    el.addEventListener('click', handler);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  container.querySelectorAll('.edit-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = _actions.find(a => String(a.id) === String(btn.dataset.id));
      if (action) openActionForm(action, container);
    });
  });

  container.querySelectorAll('.delete-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action  = _actions.find(a => String(a.id) === String(btn.dataset.id));
      const confirmed = await confirmDialog(
        'Delete this action item?',
        `"${action?.title ?? ''}" will be permanently removed.`
      );
      if (!confirmed) return;
      try {
        await API.deleteAction(btn.dataset.id);
        _actions = _actions.filter(a => String(a.id) !== String(btn.dataset.id));
        toast('Action deleted.', 'success');
        renderAll(container);
      } catch (err) {
        toast(`Failed to delete: ${err.message}`, 'error');
      }
    });
  });
}

// ─── Add/Edit Action Modal ────────────────────────────────────────────────────

async function openActionForm(action, container) {
  const isEdit = !!action;
  const title  = isEdit ? 'Edit Action Item' : 'Add Action Item';

  // Fetch team members and projects for selects
  let members  = [];
  let projects = [];
  try { members  = await API.getMembers();  } catch { /* ok */ }
  try {
    const p = await API.getProjects();
    projects = Array.isArray(p) ? p : (p.projects ?? []);
  } catch { /* ok */ }

  const memberOptions = members.map(m =>
    `<option value="${m.id}" ${String(action?.member_id ?? '') === String(m.id) ? 'selected' : ''}>${escHtml(m.name)}</option>`
  ).join('');

  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${String(action?.project_id ?? '') === String(p.id) ? 'selected' : ''}>${escHtml(p.name)}</option>`
  ).join('');

  const bodyHtml = `
    <form id="action-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Title <span class="required">*</span></label>
        <input class="form-input" id="af-title" type="text" required
          value="${escHtml(action?.title ?? '')}"
          placeholder="e.g. Follow up on SAP 2.0 contract">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" id="af-description" rows="2"
          placeholder="Additional context">${escHtml(action?.description ?? '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Context</label>
        <textarea class="form-input" id="af-context" rows="2"
          placeholder="Where did this come from?">${escHtml(action?.context ?? '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Owed To</label>
          <input class="form-input" id="af-owed-to" type="text"
            value="${escHtml(action?.owed_to ?? '')}"
            placeholder="Person responsible">
        </div>
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input class="form-input" id="af-due-date" type="date"
            value="${action?.due_date ? action.due_date.slice(0,10) : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="af-status">
            ${['open','in_progress','done','blocked'].map(s =>
              `<option value="${s}" ${(action?.status ?? 'open') === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select class="form-select" id="af-priority">
            ${['critical','high','medium','low'].map(p =>
              `<option value="${p}" ${(action?.priority ?? 'medium') === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Source</label>
          <select class="form-select" id="af-source">
            ${['manual','zoom','slack','gmail'].map(s =>
              `<option value="${s}" ${(action?.source ?? 'manual') === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Team Member</label>
          <select class="form-select" id="af-member">
            <option value="">— none —</option>
            ${memberOptions}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Project <span class="muted">(optional)</span></label>
        <select class="form-select" id="af-project">
          <option value="">— none —</option>
          ${projectOptions}
        </select>
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-ghost" id="af-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="af-save-btn">${isEdit ? 'Save Changes' : 'Add Item'}</button>
  `;

  const modal = openModal(title, bodyHtml, footerHtml);

  modal.querySelector('#af-cancel-btn').addEventListener('click', closeModal);

  modal.querySelector('#af-save-btn').addEventListener('click', async () => {
    const actionTitle = modal.querySelector('#af-title').value.trim();
    if (!actionTitle) {
      toast('Title is required.', 'warning');
      modal.querySelector('#af-title').focus();
      return;
    }

    const memberId  = modal.querySelector('#af-member').value;
    const projectId = modal.querySelector('#af-project').value;

    const data = {
      title:       actionTitle,
      description: modal.querySelector('#af-description').value.trim() || null,
      context:     modal.querySelector('#af-context').value.trim()     || null,
      owed_to:     modal.querySelector('#af-owed-to').value.trim()     || null,
      due_date:    modal.querySelector('#af-due-date').value           || null,
      status:      modal.querySelector('#af-status').value,
      priority:    modal.querySelector('#af-priority').value,
      source:      modal.querySelector('#af-source').value,
      member_id:   memberId  ? Number(memberId)  : null,
      project_id:  projectId ? Number(projectId) : null,
    };

    const btn = modal.querySelector('#af-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    try {
      let saved;
      if (isEdit) {
        saved = await API.updateAction(action.id, data);
        const idx = _actions.findIndex(a => String(a.id) === String(action.id));
        if (idx >= 0) _actions[idx] = { ..._actions[idx], ...saved };
        toast('Action item updated.', 'success');
      } else {
        saved = await API.createAction(data);
        _actions.unshift(saved);
        toast('Action item added.', 'success');
      }
      closeModal();
      renderAll(container);
    } catch (err) {
      toast(`Failed to save: ${err.message}`, 'error');
      btn.disabled    = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Add Item';
    }
  });
}
