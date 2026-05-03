/* ══════════════════════════════════════════════
   Projects Module — Track team projects
   ══════════════════════════════════════════════ */

import { registerModule, db, openModal, closeModal, toast, confirm, escHtml, statusBadge, priorityBadge, formatDate, avatarHtml } from '../app.js';

const STORE = 'projects';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
];

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const KANBAN_COLUMNS = [
  { status: 'not_started', label: 'Not Started', icon: '⏳' },
  { status: 'in_progress', label: 'In Progress', icon: '🔄' },
  { status: 'blocked', label: 'Blocked', icon: '🚫' },
  { status: 'completed', label: 'Completed', icon: '✅' },
];

let currentView = 'table';
let filterStatus = '';
let filterPriority = '';

// ── Helpers ──

function progressBar(progress) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const color = pct >= 100 ? 'green' : pct >= 60 ? 'blue' : pct >= 30 ? 'yellow' : 'red';
  return `
    <div class="progress" style="min-width:80px;">
      <div class="progress-bar ${color}" style="width:${pct}%"></div>
    </div>
    <span class="text-xs text-muted" style="margin-left:6px;">${pct}%</span>
  `;
}

function tagsHtml(tags) {
  if (!tags) return '';
  return tags.split(',').map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="badge badge-neutral" style="font-size:0.7rem;">${escHtml(t)}</span>`)
    .join(' ');
}

// ── Modal: Add / Edit ──

function openProjectModal(project, onSave) {
  const isEdit = !!project;
  const p = project || { title: '', description: '', status: 'not_started', priority: 'medium', owner: '', startDate: '', dueDate: '', tags: '', progress: 0 };

  const body = `
    <div class="form-grid">
      <div class="form-group" style="grid-column: 1 / -1;">
        <label class="form-label">Title *</label>
        <input type="text" class="form-input" id="proj-title" value="${escHtml(p.title)}" placeholder="Project name" required>
      </div>
      <div class="form-group" style="grid-column: 1 / -1;">
        <label class="form-label">Description</label>
        <textarea class="form-input" id="proj-desc" rows="3" placeholder="What is this project about?">${escHtml(p.description)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-input" id="proj-status">
          ${STATUS_OPTIONS.map(s => `<option value="${s.value}" ${p.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-input" id="proj-priority">
          ${PRIORITY_OPTIONS.map(pr => `<option value="${pr.value}" ${p.priority === pr.value ? 'selected' : ''}>${pr.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Owner</label>
        <input type="text" class="form-input" id="proj-owner" value="${escHtml(p.owner)}" placeholder="Who owns this?">
      </div>
      <div class="form-group">
        <label class="form-label">Progress (%)</label>
        <input type="number" class="form-input" id="proj-progress" min="0" max="100" value="${p.progress || 0}">
      </div>
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input type="date" class="form-input" id="proj-start" value="${p.startDate || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input type="date" class="form-input" id="proj-due" value="${p.dueDate || ''}">
      </div>
      <div class="form-group" style="grid-column: 1 / -1;">
        <label class="form-label">Tags <span class="text-muted text-xs">(comma-separated)</span></label>
        <input type="text" class="form-input" id="proj-tags" value="${escHtml(p.tags)}" placeholder="e.g. backend, Q2, migration">
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-ghost" id="proj-cancel">Cancel</button>
    <button class="btn btn-primary" id="proj-save">${isEdit ? 'Update' : 'Create'} Project</button>
  `;

  openModal(isEdit ? 'Edit Project' : 'New Project', body, footer);

  document.getElementById('proj-cancel').addEventListener('click', closeModal);
  document.getElementById('proj-save').addEventListener('click', async () => {
    const title = document.getElementById('proj-title').value.trim();
    if (!title) {
      toast('Project title is required', 'warning');
      document.getElementById('proj-title').focus();
      return;
    }

    const data = {
      title,
      description: document.getElementById('proj-desc').value.trim(),
      status: document.getElementById('proj-status').value,
      priority: document.getElementById('proj-priority').value,
      owner: document.getElementById('proj-owner').value.trim(),
      startDate: document.getElementById('proj-start').value,
      dueDate: document.getElementById('proj-due').value,
      tags: document.getElementById('proj-tags').value.trim(),
      progress: parseInt(document.getElementById('proj-progress').value, 10) || 0,
    };

    if (isEdit) {
      data.id = project.id;
    }

    closeModal();
    await onSave(data);
  });
}

// ── Render: Stats ──

function renderStats(projects) {
  const total = projects.length;
  const active = projects.filter(p => p.status === 'in_progress').length;
  const blocked = projects.filter(p => p.status === 'blocked').length;
  const completed = projects.filter(p => p.status === 'completed').length;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon purple">📋</div>
        <div class="stat-info">
          <div class="stat-value">${total}</div>
          <div class="stat-label">Total Projects</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">🔄</div>
        <div class="stat-info">
          <div class="stat-value">${active}</div>
          <div class="stat-label">In Progress</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">🚫</div>
        <div class="stat-info">
          <div class="stat-value">${blocked}</div>
          <div class="stat-label">Blocked</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✅</div>
        <div class="stat-info">
          <div class="stat-value">${completed}</div>
          <div class="stat-label">Completed</div>
        </div>
      </div>
    </div>
  `;
}

// ── Render: Table View ──

function renderTable(projects) {
  if (projects.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No projects found</h3>
        <p>Create your first project or adjust filters</p>
      </div>
    `;
  }

  return `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Owner</th>
            <th>Progress</th>
            <th>Due Date</th>
            <th>Tags</th>
            <th style="width:80px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${projects.map(p => `
            <tr>
              <td>
                <div class="fw-600">${escHtml(p.title)}</div>
                ${p.description ? `<div class="text-xs text-muted truncate" style="max-width:250px;">${escHtml(p.description)}</div>` : ''}
              </td>
              <td>${statusBadge(p.status)}</td>
              <td>${priorityBadge(p.priority)}</td>
              <td>
                ${p.owner ? `
                  <div style="display:flex;align-items:center;gap:6px;">
                    ${avatarHtml(p.owner, 'sm')}
                    <span class="text-sm">${escHtml(p.owner)}</span>
                  </div>
                ` : '<span class="text-muted">—</span>'}
              </td>
              <td>
                <div style="display:flex;align-items:center;">
                  ${progressBar(p.progress)}
                </div>
              </td>
              <td>${formatDate(p.dueDate)}</td>
              <td>${tagsHtml(p.tags)}</td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn btn-ghost btn-icon btn-sm proj-edit" data-id="${p.id}" title="Edit">✏️</button>
                  <button class="btn btn-ghost btn-icon btn-sm proj-delete" data-id="${p.id}" title="Delete">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Render: Kanban View ──

function renderKanban(projects) {
  return `
    <div class="kanban-board">
      ${KANBAN_COLUMNS.map(col => {
        const colProjects = projects.filter(p => p.status === col.status);
        return `
          <div class="kanban-column">
            <div class="kanban-column-header">
              <span>${col.icon} ${col.label}</span>
              <span class="badge badge-neutral">${colProjects.length}</span>
            </div>
            <div class="kanban-cards">
              ${colProjects.length === 0 ? `
                <div style="text-align:center;padding:24px 12px;color:var(--text-muted);font-size:0.85rem;">
                  No projects
                </div>
              ` : colProjects.map(p => `
                <div class="kanban-card" data-id="${p.id}">
                  <div class="kanban-card-title">${escHtml(p.title)}</div>
                  <div class="kanban-card-meta">
                    <span>${priorityBadge(p.priority)}</span>
                  </div>
                  ${p.description ? `<div class="text-xs text-muted" style="margin:6px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(p.description)}</div>` : ''}
                  <div style="margin-top:8px;">
                    <div style="display:flex;align-items:center;">
                      ${progressBar(p.progress)}
                    </div>
                  </div>
                  <div class="kanban-card-meta" style="margin-top:8px;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:4px;">
                      ${p.owner ? `${avatarHtml(p.owner, 'sm')}<span class="text-xs">${escHtml(p.owner)}</span>` : '<span class="text-xs text-muted">Unassigned</span>'}
                    </div>
                    ${p.dueDate ? `<span class="text-xs text-muted">${formatDate(p.dueDate)}</span>` : ''}
                  </div>
                  ${p.tags ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${tagsHtml(p.tags)}</div>` : ''}
                  <div style="margin-top:8px;display:flex;gap:4px;justify-content:flex-end;">
                    <button class="btn btn-ghost btn-icon btn-sm proj-edit" data-id="${p.id}" title="Edit">✏️</button>
                    <button class="btn btn-ghost btn-icon btn-sm proj-delete" data-id="${p.id}" title="Delete">🗑️</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Main Render ──

async function renderProjects(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>📋 Projects</h1>
        <div class="page-subtitle">Track and manage team projects</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="proj-add-btn">➕ New Project</button>
      </div>
    </div>
    <div id="proj-stats"></div>
    <div id="proj-toolbar" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px;">
      <div style="display:flex;gap:4px;">
        <button class="btn btn-sm ${currentView === 'table' ? 'btn-primary' : 'btn-ghost'}" id="proj-view-table">📊 Table</button>
        <button class="btn btn-sm ${currentView === 'kanban' ? 'btn-primary' : 'btn-ghost'}" id="proj-view-kanban">📌 Kanban</button>
      </div>
      <select class="form-input" id="proj-filter-status" style="width:auto;min-width:140px;">
        <option value="">All Statuses</option>
        ${STATUS_OPTIONS.map(s => `<option value="${s.value}" ${filterStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <select class="form-input" id="proj-filter-priority" style="width:auto;min-width:140px;">
        <option value="">All Priorities</option>
        ${PRIORITY_OPTIONS.map(pr => `<option value="${pr.value}" ${filterPriority === pr.value ? 'selected' : ''}>${pr.label}</option>`).join('')}
      </select>
    </div>
    <div id="proj-content">
      <div style="text-align:center;padding:48px;color:var(--text-muted);">Loading projects…</div>
    </div>
  `;

  // Load & render data
  async function loadProjects() {
    const allProjects = await db.getAll(STORE, { sortBy: 'createdAt', sortDir: 'desc' });

    // Render stats with all projects (unfiltered)
    document.getElementById('proj-stats').innerHTML = renderStats(allProjects);

    // Apply filters
    let filtered = allProjects;
    if (filterStatus) {
      filtered = filtered.filter(p => p.status === filterStatus);
    }
    if (filterPriority) {
      filtered = filtered.filter(p => p.priority === filterPriority);
    }

    // Render view
    const contentEl = document.getElementById('proj-content');
    if (currentView === 'kanban') {
      contentEl.innerHTML = renderKanban(filtered);
    } else {
      contentEl.innerHTML = renderTable(filtered);
    }
  }

  await loadProjects();

  // ── Event Handlers ──

  // Add project
  document.getElementById('proj-add-btn').addEventListener('click', () => {
    openProjectModal(null, async (data) => {
      await db.add(STORE, data);
      toast('Project created', 'success');
      await loadProjects();
    });
  });

  // View toggle
  document.getElementById('proj-view-table').addEventListener('click', () => {
    currentView = 'table';
    document.getElementById('proj-view-table').className = 'btn btn-sm btn-primary';
    document.getElementById('proj-view-kanban').className = 'btn btn-sm btn-ghost';
    loadProjects();
  });

  document.getElementById('proj-view-kanban').addEventListener('click', () => {
    currentView = 'kanban';
    document.getElementById('proj-view-kanban').className = 'btn btn-sm btn-primary';
    document.getElementById('proj-view-table').className = 'btn btn-sm btn-ghost';
    loadProjects();
  });

  // Filters
  document.getElementById('proj-filter-status').addEventListener('change', (e) => {
    filterStatus = e.target.value;
    loadProjects();
  });

  document.getElementById('proj-filter-priority').addEventListener('change', (e) => {
    filterPriority = e.target.value;
    loadProjects();
  });

  // Edit & Delete via event delegation on content area
  container.addEventListener('click', async (e) => {
    // Edit
    const editBtn = e.target.closest('.proj-edit');
    if (editBtn) {
      const id = editBtn.dataset.id;
      const project = await db.get(STORE, id);
      if (!project) {
        toast('Project not found', 'error');
        return;
      }
      openProjectModal(project, async (data) => {
        await db.update(STORE, data);
        toast('Project updated', 'success');
        await loadProjects();
      });
      return;
    }

    // Delete
    const deleteBtn = e.target.closest('.proj-delete');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const project = await db.get(STORE, id);
      if (!project) {
        toast('Project not found', 'error');
        return;
      }
      const ok = await confirm(`Delete project "${project.title}"? This cannot be undone.`);
      if (ok) {
        await db.delete(STORE, id);
        toast('Project deleted', 'success');
        await loadProjects();
      }
      return;
    }

    // Clicking kanban card (not on a button) opens edit
    const kanbanCard = e.target.closest('.kanban-card');
    if (kanbanCard && !e.target.closest('.btn')) {
      const id = kanbanCard.dataset.id;
      const project = await db.get(STORE, id);
      if (project) {
        openProjectModal(project, async (data) => {
          await db.update(STORE, data);
          toast('Project updated', 'success');
          await loadProjects();
        });
      }
    }
  });
}

// ── Register Module ──

registerModule({
  id: 'projects',
  label: 'Projects',
  icon: '📋',
  section: 'work',
  order: 21,
  render: renderProjects
});
