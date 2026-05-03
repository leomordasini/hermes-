/* ══════════════════════════════════════════════
   Action Items Module
   ══════════════════════════════════════════════ */

import { registerModule, db, openModal, closeModal, toast, confirm, escHtml, avatarHtml, statusBadge, priorityBadge, formatDate } from '../app.js';

const STORE = 'action_items';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// ── Filter State ──
let filterStatus = '';
let filterAssignee = '';
let filterPriority = '';

// ── Helpers ──
function isOverdue(item) {
  if (!item.dueDate) return false;
  if (item.status === 'completed' || item.status === 'cancelled') return false;
  const due = new Date(item.dueDate + 'T23:59:59');
  return due < new Date();
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildStats(items) {
  const now = new Date();
  const weekStart = startOfWeek(now);

  return {
    total: items.length,
    open: items.filter(i => i.status === 'open' || i.status === 'in_progress').length,
    overdue: items.filter(i => isOverdue(i)).length,
    completedThisWeek: items.filter(i => {
      if (i.status !== 'completed') return false;
      const updated = new Date(i.updatedAt);
      return updated >= weekStart;
    }).length,
  };
}

// ── Main Render ──
async function renderActions(container) {
  container.innerHTML = '<div id="actions-root"></div>';
  await renderList();
}

async function renderList() {
  const root = document.getElementById('actions-root');
  if (!root) return;

  const allItems = await db.getAll(STORE, { sortBy: 'dueDate', sortDir: 'asc' });

  // Collect unique assignees for filter dropdown
  const assignees = [...new Set(allItems.map(i => i.assignee).filter(Boolean))].sort();

  // Apply filters
  const filtered = allItems.filter(item => {
    if (filterStatus && item.status !== filterStatus) return false;
    if (filterAssignee && item.assignee !== filterAssignee) return false;
    if (filterPriority && item.priority !== filterPriority) return false;
    return true;
  });

  const stats = buildStats(allItems);

  root.innerHTML = `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>✅ Action Items</h1>
        <div class="page-subtitle">${allItems.length} item${allItems.length !== 1 ? 's' : ''} tracked</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="action-add-btn">+ Add Action Item</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="margin-bottom: 20px;">
      <div class="stat-card">
        <div class="stat-icon purple">📋</div>
        <div class="stat-info">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Items</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">🔵</div>
        <div class="stat-info">
          <div class="stat-value">${stats.open}</div>
          <div class="stat-label">Open</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">🔴</div>
        <div class="stat-info">
          <div class="stat-value">${stats.overdue}</div>
          <div class="stat-label">Overdue</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✓</div>
        <div class="stat-info">
          <div class="stat-value">${stats.completedThisWeek}</div>
          <div class="stat-label">Completed This Week</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="card" style="margin-bottom: 20px; padding: 14px 20px;">
      <div class="flex gap-md" style="align-items: center; flex-wrap: wrap;">
        <div style="min-width: 160px;">
          <select class="form-input" id="action-filter-status">
            <option value="">All Statuses</option>
            ${STATUS_OPTIONS.map(s =>
              `<option value="${s.value}" ${filterStatus === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </select>
        </div>
        <div style="min-width: 160px;">
          <select class="form-input" id="action-filter-assignee">
            <option value="">All Assignees</option>
            ${assignees.map(a =>
              `<option value="${escHtml(a)}" ${filterAssignee === a ? 'selected' : ''}>${escHtml(a)}</option>`
            ).join('')}
          </select>
        </div>
        <div style="min-width: 160px;">
          <select class="form-input" id="action-filter-priority">
            <option value="">All Priorities</option>
            ${PRIORITY_OPTIONS.map(p =>
              `<option value="${p.value}" ${filterPriority === p.value ? 'selected' : ''}>${p.label}</option>`
            ).join('')}
          </select>
        </div>
        ${(filterStatus || filterAssignee || filterPriority) ? `<button class="btn btn-ghost btn-sm" id="action-clear-filters">Clear</button>` : ''}
      </div>
    </div>

    <!-- Table -->
    <div class="card" style="padding: 0; overflow-x: auto;">
      ${filtered.length === 0 ? renderEmptyState(allItems.length === 0) : renderTable(filtered)}
    </div>
  `;

  // ── Event Bindings ──
  document.getElementById('action-add-btn')?.addEventListener('click', () => openActionModal());

  document.getElementById('action-filter-status')?.addEventListener('change', (e) => {
    filterStatus = e.target.value;
    renderList();
  });

  document.getElementById('action-filter-assignee')?.addEventListener('change', (e) => {
    filterAssignee = e.target.value;
    renderList();
  });

  document.getElementById('action-filter-priority')?.addEventListener('change', (e) => {
    filterPriority = e.target.value;
    renderList();
  });

  document.getElementById('action-clear-filters')?.addEventListener('click', () => {
    filterStatus = '';
    filterAssignee = '';
    filterPriority = '';
    renderList();
  });

  // Quick complete checkboxes
  document.querySelectorAll('.action-complete-cb').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const id = cb.dataset.id;
      const newStatus = cb.checked ? 'completed' : 'open';
      try {
        await db.update(STORE, { id, status: newStatus });
        toast(cb.checked ? 'Marked as completed' : 'Reopened', 'success');
        await renderList();
      } catch (err) {
        console.error('Toggle status error:', err);
        toast('Failed to update status', 'error');
      }
    });
  });

  // Edit buttons
  document.querySelectorAll('.action-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openActionModal(btn.dataset.id));
  });

  // Delete buttons
  document.querySelectorAll('.action-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAction(btn.dataset.id, btn.dataset.title));
  });
}

// ── Render Table ──
function renderTable(items) {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 40px;"></th>
          <th>Title</th>
          <th>Priority</th>
          <th>Assignee</th>
          <th>Due Date</th>
          <th>Source</th>
          <th>Status</th>
          <th style="width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const overdue = isOverdue(item);
          const isComplete = item.status === 'completed';
          const isCancelled = item.status === 'cancelled';
          const rowStyle = overdue ? 'background: rgba(239, 83, 80, 0.08);' : '';
          const titleStyle = (isComplete || isCancelled) ? 'text-decoration: line-through; opacity: 0.6;' : '';
          const dueDateStyle = overdue ? 'color: var(--red, #ef5350); font-weight: 600;' : '';

          return `
            <tr style="${rowStyle}">
              <td>
                <input type="checkbox" class="action-complete-cb"
                  data-id="${item.id}"
                  ${isComplete ? 'checked' : ''}
                  ${isCancelled ? 'disabled' : ''}
                  title="${isComplete ? 'Mark as open' : 'Mark as completed'}" />
              </td>
              <td>
                <div class="fw-600" style="${titleStyle}">${escHtml(item.title)}</div>
                ${item.description ? `<div class="text-xs text-muted" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(item.description)}</div>` : ''}
                ${item.tags && item.tags.length > 0 ? `
                  <div class="flex gap-xs" style="flex-wrap: wrap; margin-top: 4px;">
                    ${item.tags.map(t => `<span class="badge badge-neutral" style="font-size: 0.68rem;">${escHtml(t)}</span>`).join('')}
                  </div>
                ` : ''}
              </td>
              <td>${priorityBadge(item.priority || 'medium')}</td>
              <td>
                ${item.assignee ? `
                  <div class="flex gap-xs" style="align-items: center;">
                    ${avatarHtml(item.assignee)}
                    <span style="font-size: 0.85rem;">${escHtml(item.assignee)}</span>
                  </div>
                ` : '<span class="text-muted">—</span>'}
              </td>
              <td>
                <span style="${dueDateStyle}">
                  ${item.dueDate ? formatDate(item.dueDate) : '—'}
                </span>
                ${overdue ? '<div class="text-xs" style="color: var(--red, #ef5350);">⚠ Overdue</div>' : ''}
              </td>
              <td>
                <span class="text-muted" style="font-size: 0.85rem;">${escHtml(item.source || '—')}</span>
              </td>
              <td>${statusBadge(item.status || 'open')}</td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-ghost btn-sm btn-icon action-edit-btn" data-id="${item.id}" title="Edit">✏️</button>
                  <button class="btn btn-ghost btn-sm btn-icon action-delete-btn" data-id="${item.id}" data-title="${escHtml(item.title)}" title="Delete">🗑️</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── Empty State ──
function renderEmptyState(isNew) {
  if (isNew) {
    return `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <h3>No action items yet</h3>
        <p>Create your first action item to start tracking tasks.</p>
        <button class="btn btn-primary" onclick="document.getElementById('action-add-btn').click()">+ Add Action Item</button>
      </div>`;
  }
  return `
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <h3>No results found</h3>
      <p>Try adjusting your filters.</p>
    </div>`;
}

// ── Add / Edit Modal ──
async function openActionModal(itemId) {
  let item = null;
  if (itemId) {
    item = await db.get(STORE, itemId);
  }

  const isEdit = !!item;
  const title = isEdit ? 'Edit Action Item' : 'New Action Item';

  const body = `
    <div class="form-group">
      <label class="form-label">Title *</label>
      <input type="text" class="form-input" id="action-title"
        value="${escHtml(item?.title || '')}" placeholder="What needs to be done?" required />
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-input" id="action-description" rows="3"
        placeholder="Additional details…">${escHtml(item?.description || '')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-input" id="action-status">
          ${STATUS_OPTIONS.map(s =>
            `<option value="${s.value}" ${(item?.status || 'open') === s.value ? 'selected' : ''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-input" id="action-priority">
          ${PRIORITY_OPTIONS.map(p =>
            `<option value="${p.value}" ${(item?.priority || 'medium') === p.value ? 'selected' : ''}>${p.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Assignee</label>
        <input type="text" class="form-input" id="action-assignee"
          value="${escHtml(item?.assignee || '')}" placeholder="e.g. John Smith" />
      </div>
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input type="date" class="form-input" id="action-dueDate"
          value="${item?.dueDate || ''}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Source</label>
      <input type="text" class="form-input" id="action-source"
        value="${escHtml(item?.source || '')}" placeholder="e.g. 1:1 with John, Team meeting" />
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <input type="text" class="form-input" id="action-tags"
        value="${escHtml((item?.tags || []).join(', '))}" placeholder="follow-up, hiring, process…" />
      <div class="form-hint">Comma-separated list of tags</div>
    </div>
  `;

  const footer = `
    <button class="btn btn-ghost" id="action-modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="action-modal-save">${isEdit ? 'Save Changes' : 'Add Item'}</button>
  `;

  openModal(title, body, footer);

  document.getElementById('action-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('action-modal-save').addEventListener('click', () => saveAction(itemId));
}

async function saveAction(existingId) {
  const title = document.getElementById('action-title')?.value.trim();
  const description = document.getElementById('action-description')?.value.trim();
  const status = document.getElementById('action-status')?.value || 'open';
  const priority = document.getElementById('action-priority')?.value || 'medium';
  const assignee = document.getElementById('action-assignee')?.value.trim();
  const dueDate = document.getElementById('action-dueDate')?.value || '';
  const source = document.getElementById('action-source')?.value.trim();
  const tagsRaw = document.getElementById('action-tags')?.value || '';

  if (!title) {
    toast('Title is required', 'error');
    document.getElementById('action-title')?.focus();
    return;
  }

  const tags = tagsRaw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const record = { title, description, status, priority, assignee, dueDate, source, tags };

  try {
    if (existingId) {
      record.id = existingId;
      await db.update(STORE, record);
      toast('Action item updated', 'success');
    } else {
      await db.add(STORE, record);
      toast('Action item created', 'success');
    }
    closeModal();
    await renderList();
  } catch (err) {
    console.error('Save action error:', err);
    toast('Failed to save: ' + err.message, 'error');
  }
}

// ── Delete ──
async function deleteAction(id, title) {
  const ok = await confirm(`Delete action item "${title}"? This cannot be undone.`);
  if (!ok) return;

  try {
    await db.delete(STORE, id);
    toast('Action item deleted', 'success');
    await renderList();
  } catch (err) {
    console.error('Delete action error:', err);
    toast('Failed to delete: ' + err.message, 'error');
  }
}

// ── Register Module ──
registerModule({
  id: 'actions',
  label: 'Action Items',
  icon: '✅',
  section: 'work',
  order: 22,
  render: renderActions
});
