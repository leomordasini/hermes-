import {
  registerModule, API, toast, openModal, closeModal, confirmDialog,
  escHtml, avatarHtml, statusBadge, priorityBadge, healthDot,
  formatDate, formatRelative
} from '../app.js';

// ─── Module Registration ──────────────────────────────────────────────────────

registerModule({
  id: 'projects',
  label: 'Projects',
  icon: '🚀',
  section: 'work',
  order: 20,
  render: renderProjects
});

// ─── State ────────────────────────────────────────────────────────────────────

let _projects     = [];
let _currentView  = 'table';  // 'table' | 'kanban'

// ─── Health helpers (stored as green/yellow/red) ──────────────────────────────

function projectHealthDot(health) {
  const map = { green: 'dot-green', yellow: 'dot-yellow', red: 'dot-red' };
  const cls = map[String(health ?? '').toLowerCase()] ?? 'dot-gray';
  const label = health ?? 'unknown';
  return `<span class="health-dot ${cls}" title="${escHtml(label)}"></span>`;
}

function healthLabel(health) {
  const map = { green: '🟢 On Track', yellow: '🟡 At Risk', red: '🔴 Off Track' };
  return map[String(health ?? '').toLowerCase()] ?? (health || '—');
}

// ─── Main Render ──────────────────────────────────────────────────────────────

async function renderProjects(container) {
  container.innerHTML = `<div class="loading-spinner-wrap"><div class="loading-spinner"></div></div>`;

  try {
    _projects = await API.getProjects();
    if (!Array.isArray(_projects)) _projects = _projects.projects ?? [];
    renderAll(container);
  } catch (err) {
    container.innerHTML = `<div class="error-state">⚠️ Failed to load projects: ${escHtml(err.message)}</div>`;
  }
}

function renderAll(container) {
  const stats = computeStats(_projects);

  container.innerHTML = `
    ${renderPageHeader(_projects.length)}
    ${renderStatsRow(stats)}
    <div id="projects-view-container">
      ${_currentView === 'table' ? renderTableView(_projects) : renderKanbanView(_projects)}
    </div>
  `;

  bindEvents(container);
}

// ─── Page Header ──────────────────────────────────────────────────────────────

function renderPageHeader(count) {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1>🚀 Projects</h1>
        <span class="badge badge-gray">${count}</span>
      </div>
      <div class="page-header-actions">
        <div class="view-toggle btn-group">
          <button class="btn btn-sm ${_currentView === 'table'  ? 'btn-primary' : 'btn-ghost'}" id="view-table-btn">
            ☰ Table
          </button>
          <button class="btn btn-sm ${_currentView === 'kanban' ? 'btn-primary' : 'btn-ghost'}" id="view-kanban-btn">
            ⊞ Kanban
          </button>
        </div>
        <button class="btn btn-primary btn-sm" id="new-project-btn">+ New Project</button>
      </div>
    </div>
  `;
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function computeStats(projects) {
  const total     = projects.length;
  const active    = projects.filter(p => ['in_progress', 'active', 'in progress'].includes(String(p.status ?? '').toLowerCase())).length;
  const blocked   = projects.filter(p => String(p.status ?? '').toLowerCase() === 'blocked').length;
  const completed = projects.filter(p => ['completed', 'done'].includes(String(p.status ?? '').toLowerCase())).length;
  return { total, active, blocked, completed };
}

function renderStatsRow({ total, active, blocked, completed }) {
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${total}</div>
        <div class="stat-label">Total Projects</div>
      </div>
      <div class="stat-card stat-card-blue">
        <div class="stat-value">${active}</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-card ${blocked > 0 ? 'stat-card-red' : ''}">
        <div class="stat-value">${blocked}</div>
        <div class="stat-label">Blocked</div>
      </div>
      <div class="stat-card stat-card-green">
        <div class="stat-value">${completed}</div>
        <div class="stat-label">Completed</div>
      </div>
    </div>
  `;
}

// ─── Table View ───────────────────────────────────────────────────────────────

function renderTableView(projects) {
  if (!projects.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🚀</div>
        <div class="empty-title">No projects yet</div>
        <div class="empty-desc">Create your first project to get started.</div>
        <button class="btn btn-primary" id="empty-new-project-btn">+ New Project</button>
      </div>
    `;
  }

  const rows = projects.map(p => {
    const progress = Number(p.progress ?? 0);
    return `
      <tr class="clickable-row" data-id="${p.id}">
        <td class="td-name">
          <span class="project-name">${escHtml(p.name)}</span>
        </td>
        <td>${statusBadge(p.status)}</td>
        <td>${priorityBadge(p.priority)}</td>
        <td class="td-health">
          ${projectHealthDot(p.health)}
        </td>
        <td class="td-owner">
          ${p.owner ? `${avatarHtml(p.owner, 'sm')} <span class="owner-name">${escHtml(p.owner)}</span>` : '<span class="muted">—</span>'}
        </td>
        <td class="td-due">${p.due_date ? formatDate(p.due_date) : '<span class="muted">—</span>'}</td>
        <td class="td-progress">
          <div class="progress-wrap">
            <div class="progress">
              <div class="progress-bar" style="width:${progress}%"></div>
            </div>
            <span class="progress-label">${progress}%</span>
          </div>
        </td>
        <td class="td-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-xs edit-project-btn" data-id="${p.id}" title="Edit">✏️</button>
          <button class="btn btn-ghost btn-xs delete-project-btn" data-id="${p.id}" title="Delete">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Health</th>
            <th>Owner</th>
            <th>Due Date</th>
            <th>Progress</th>
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

// ─── Kanban View ──────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { key: 'not_started',  label: 'Not Started',  statuses: ['not_started', 'not started', 'planned'] },
  { key: 'in_progress',  label: 'In Progress',   statuses: ['in_progress', 'in progress', 'active'] },
  { key: 'blocked',      label: 'Blocked',        statuses: ['blocked'] },
  { key: 'completed',    label: 'Completed',      statuses: ['completed', 'done', 'complete'] },
];

function renderKanbanView(projects) {
  const cols = KANBAN_COLS.map(col => {
    const colProjects = projects.filter(p =>
      col.statuses.includes(String(p.status ?? '').toLowerCase())
    );
    const cards = colProjects.length
      ? colProjects.map(p => renderKanbanCard(p)).join('')
      : `<div class="kanban-empty">No projects</div>`;

    return `
      <div class="kanban-col" data-col="${col.key}">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${col.label}</span>
          <span class="badge badge-gray">${colProjects.length}</span>
        </div>
        <div class="kanban-cards">
          ${cards}
        </div>
      </div>
    `;
  }).join('');

  return `<div class="kanban-board">${cols}</div>`;
}

function renderKanbanCard(p) {
  const progress = Number(p.progress ?? 0);
  return `
    <div class="kanban-card" data-id="${p.id}" role="button" tabindex="0">
      <div class="kanban-card-header">
        <span class="kanban-card-name">${escHtml(p.name)}</span>
        ${projectHealthDot(p.health)}
      </div>
      <div class="kanban-card-meta">
        ${priorityBadge(p.priority)}
      </div>
      ${p.owner ? `
        <div class="kanban-card-owner">
          ${avatarHtml(p.owner, 'xs')}
          <span class="owner-name">${escHtml(p.owner)}</span>
        </div>` : ''}
      ${p.due_date ? `
        <div class="kanban-card-due">📅 ${formatDate(p.due_date)}</div>` : ''}
      <div class="progress" style="margin-top:6px">
        <div class="progress-bar" style="width:${progress}%"></div>
      </div>
    </div>
  `;
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function bindEvents(container) {
  // View toggle
  container.querySelector('#view-table-btn')?.addEventListener('click', () => {
    _currentView = 'table';
    renderAll(container);
  });
  container.querySelector('#view-kanban-btn')?.addEventListener('click', () => {
    _currentView = 'kanban';
    renderAll(container);
  });

  // New project
  container.querySelector('#new-project-btn')?.addEventListener('click', () => openProjectForm(null, container));
  container.querySelector('#empty-new-project-btn')?.addEventListener('click', () => openProjectForm(null, container));

  // Table row clicks → detail modal
  container.querySelectorAll('.clickable-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const project = _projects.find(p => String(p.id) === String(id));
      if (project) openProjectDetail(project, container);
    });
  });

  // Edit buttons
  container.querySelectorAll('.edit-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const project = _projects.find(p => String(p.id) === String(btn.dataset.id));
      if (project) openProjectForm(project, container);
    });
  });

  // Delete buttons
  container.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const project = _projects.find(p => String(p.id) === String(btn.dataset.id));
      const confirmed = await confirmDialog(
        `Delete "${project?.name ?? 'this project'}"?`,
        'This action cannot be undone.'
      );
      if (!confirmed) return;
      try {
        await API.deleteProject(btn.dataset.id);
        toast('Project deleted.', 'success');
        _projects = _projects.filter(p => String(p.id) !== String(btn.dataset.id));
        renderAll(container);
      } catch (err) {
        toast(`Failed to delete: ${err.message}`, 'error');
      }
    });
  });

  // Kanban card clicks → detail modal
  container.querySelectorAll('.kanban-card').forEach(card => {
    const handler = () => {
      const project = _projects.find(p => String(p.id) === String(card.dataset.id));
      if (project) openProjectDetail(project, container);
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

// ─── Project Detail Modal ─────────────────────────────────────────────────────

async function openProjectDetail(project, container) {
  const modal = openModal(
    escHtml(project.name),
    `<div class="loading-spinner-wrap"><div class="loading-spinner"></div></div>`,
    `<button class="btn btn-primary" id="detail-add-update-btn">+ Add Update</button>
     <button class="btn btn-ghost" id="detail-edit-btn">✏️ Edit</button>
     <button class="btn btn-ghost" id="detail-close-btn">Close</button>`,
    { wide: true }
  );

  // Load full project data (includes updates)
  let fullProject = project;
  try {
    fullProject = await API.getProject(project.id);
  } catch {
    // Use cached data if fetch fails
  }

  const progress = Number(fullProject.progress ?? 0);
  const tags = Array.isArray(fullProject.tags) ? fullProject.tags : (fullProject.tags ? String(fullProject.tags).split(',') : []);
  const stakeholders = Array.isArray(fullProject.stakeholders) ? fullProject.stakeholders.join(', ') : (fullProject.stakeholders ?? '');
  const updates = Array.isArray(fullProject.project_updates) ? fullProject.project_updates : [];

  const bodyHtml = `
    <div class="project-detail">
      <div class="detail-grid">
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">Health</span>
            <span class="detail-value">
              ${projectHealthDot(fullProject.health)}
              <span>${escHtml(healthLabel(fullProject.health))}</span>
            </span>
          </div>
          ${fullProject.health_note ? `
          <div class="detail-row">
            <span class="detail-label">Health Note</span>
            <span class="detail-value">${escHtml(fullProject.health_note)}</span>
          </div>` : ''}
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value">${statusBadge(fullProject.status)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Priority</span>
            <span class="detail-value">${priorityBadge(fullProject.priority)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Owner</span>
            <span class="detail-value">
              ${fullProject.owner
                ? `${avatarHtml(fullProject.owner, 'sm')} ${escHtml(fullProject.owner)}`
                : '<span class="muted">—</span>'}
            </span>
          </div>
          ${stakeholders ? `
          <div class="detail-row">
            <span class="detail-label">Stakeholders</span>
            <span class="detail-value">${escHtml(stakeholders)}</span>
          </div>` : ''}
          <div class="detail-row">
            <span class="detail-label">Start Date</span>
            <span class="detail-value">${formatDate(fullProject.start_date)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Due Date</span>
            <span class="detail-value">${formatDate(fullProject.due_date)}</span>
          </div>
          ${tags.length ? `
          <div class="detail-row">
            <span class="detail-label">Tags</span>
            <span class="detail-value">
              ${tags.map(t => `<span class="badge badge-gray">${escHtml(t.trim())}</span>`).join(' ')}
            </span>
          </div>` : ''}
        </div>

        <div class="detail-section">
          ${fullProject.description ? `
          <div class="detail-desc">${escHtml(fullProject.description)}</div>` : ''}

          <div class="detail-progress-label">
            Progress — <strong>${progress}%</strong>
          </div>
          <div class="progress progress-lg">
            <div class="progress-bar" style="width:${progress}%"></div>
          </div>
        </div>
      </div>

      <div class="updates-section">
        <h3 class="updates-title">📋 Project Updates</h3>
        ${updates.length ? `
          <div class="updates-timeline">
            ${updates.map(u => renderUpdateItem(u)).join('')}
          </div>
        ` : `<div class="muted" style="padding:12px 0">No updates yet.</div>`}
      </div>
    </div>
  `;

  modal.querySelector('.modal-body').innerHTML = bodyHtml;

  modal.querySelector('#detail-add-update-btn')?.addEventListener('click', () => {
    closeModal();
    openAddUpdateModal(fullProject, container);
  });

  modal.querySelector('#detail-edit-btn')?.addEventListener('click', () => {
    closeModal();
    openProjectForm(fullProject, container);
  });

  modal.querySelector('#detail-close-btn')?.addEventListener('click', closeModal);
}

function renderUpdateItem(u) {
  const healthIndicator = u.health ? projectHealthDot(u.health) : '';
  return `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-body">
        <div class="timeline-meta">
          ${healthIndicator}
          <span class="timeline-date">${formatRelative(u.created_at || u.date)}</span>
          ${u.source ? `<span class="badge badge-gray">${escHtml(u.source)}</span>` : ''}
        </div>
        <div class="timeline-text">${escHtml(u.update_text || u.text || '')}</div>
      </div>
    </div>
  `;
}

// ─── Add/Edit Project Modal ───────────────────────────────────────────────────

function openProjectForm(project, container) {
  const isEdit = !!project;
  const title  = isEdit ? `Edit Project — ${project.name}` : 'New Project';

  const progress = Number(project?.progress ?? 0);
  const tags = Array.isArray(project?.tags)
    ? project.tags.join(', ')
    : (project?.tags ?? '');
  const stakeholders = Array.isArray(project?.stakeholders)
    ? project.stakeholders.join(', ')
    : (project?.stakeholders ?? '');

  const bodyHtml = `
    <form id="project-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Name <span class="required">*</span></label>
        <input class="form-input" id="pf-name" type="text" required
          value="${escHtml(project?.name ?? '')}"
          placeholder="e.g. SAP 2.0, Embed program in LATAM">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" id="pf-description" rows="3"
          placeholder="Brief description of the project">${escHtml(project?.description ?? '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="pf-status">
            ${['not_started','in_progress','blocked','completed'].map(s =>
              `<option value="${s}" ${project?.status === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select class="form-select" id="pf-priority">
            ${['critical','high','medium','low'].map(p2 =>
              `<option value="${p2}" ${project?.priority === p2 ? 'selected' : ''}>${p2.charAt(0).toUpperCase() + p2.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Owner</label>
          <input class="form-input" id="pf-owner" type="text"
            value="${escHtml(project?.owner ?? '')}"
            placeholder="e.g. Jane Smith">
        </div>
        <div class="form-group">
          <label class="form-label">Health</label>
          <select class="form-select" id="pf-health">
            <option value="">— select —</option>
            ${['green','yellow','red'].map(h =>
              `<option value="${h}" ${project?.health === h ? 'selected' : ''}>${h.charAt(0).toUpperCase() + h.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Health Note</label>
        <input class="form-input" id="pf-health-note" type="text"
          value="${escHtml(project?.health_note ?? '')}"
          placeholder="Why is health at this level?">
      </div>
      <div class="form-group">
        <label class="form-label">Stakeholders</label>
        <input class="form-input" id="pf-stakeholders" type="text"
          value="${escHtml(stakeholders)}"
          placeholder="Comma-separated names">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input class="form-input" id="pf-start-date" type="date"
            value="${project?.start_date ? project.start_date.slice(0,10) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input class="form-input" id="pf-due-date" type="date"
            value="${project?.due_date ? project.due_date.slice(0,10) : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Tags</label>
        <input class="form-input" id="pf-tags" type="text"
          value="${escHtml(tags)}"
          placeholder="e.g. q2, latam, partnership (comma-separated)">
      </div>
      <div class="form-group">
        <label class="form-label">Progress — <span id="pf-progress-val">${progress}</span>%</label>
        <input type="range" class="form-range" id="pf-progress" min="0" max="100"
          value="${progress}">
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-ghost" id="pf-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="pf-save-btn">${isEdit ? 'Save Changes' : 'Create Project'}</button>
  `;

  const modal = openModal(title, bodyHtml, footerHtml, { wide: true });

  // Live-update progress label
  modal.querySelector('#pf-progress').addEventListener('input', e => {
    modal.querySelector('#pf-progress-val').textContent = e.target.value;
  });

  modal.querySelector('#pf-cancel-btn').addEventListener('click', closeModal);

  modal.querySelector('#pf-save-btn').addEventListener('click', async () => {
    const name = modal.querySelector('#pf-name').value.trim();
    if (!name) {
      toast('Project name is required.', 'warning');
      modal.querySelector('#pf-name').focus();
      return;
    }

    const data = {
      name,
      description:  modal.querySelector('#pf-description').value.trim() || null,
      status:       modal.querySelector('#pf-status').value,
      priority:     modal.querySelector('#pf-priority').value,
      owner:        modal.querySelector('#pf-owner').value.trim() || null,
      health:       modal.querySelector('#pf-health').value || null,
      health_note:  modal.querySelector('#pf-health-note').value.trim() || null,
      stakeholders: modal.querySelector('#pf-stakeholders').value.trim() || null,
      start_date:   modal.querySelector('#pf-start-date').value || null,
      due_date:     modal.querySelector('#pf-due-date').value || null,
      tags:         modal.querySelector('#pf-tags').value.trim() || null,
      progress:     Number(modal.querySelector('#pf-progress').value),
    };

    const btn = modal.querySelector('#pf-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      let saved;
      if (isEdit) {
        saved = await API.updateProject(project.id, data);
        const idx = _projects.findIndex(p => String(p.id) === String(project.id));
        if (idx >= 0) _projects[idx] = { ..._projects[idx], ...saved };
        toast('Project updated.', 'success');
      } else {
        saved = await API.createProject(data);
        _projects.unshift(saved);
        toast('Project created.', 'success');
      }
      closeModal();
      renderAll(container);
    } catch (err) {
      toast(`Failed to save: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Create Project';
    }
  });
}

// ─── Add Update Modal ─────────────────────────────────────────────────────────

function openAddUpdateModal(project, container) {
  const bodyHtml = `
    <form id="update-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Update <span class="required">*</span></label>
        <textarea class="form-input" id="uf-text" rows="4" required
          placeholder="What's the latest on ${escHtml(project.name)}?"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Health</label>
          <select class="form-select" id="uf-health">
            <option value="">— unchanged —</option>
            <option value="green">🟢 On Track</option>
            <option value="yellow">🟡 At Risk</option>
            <option value="red">🔴 Off Track</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Source</label>
          <select class="form-select" id="uf-source">
            <option value="manual" selected>Manual</option>
            <option value="zoom">Zoom</option>
            <option value="gmail">Gmail</option>
            <option value="slack">Slack</option>
          </select>
        </div>
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-ghost" id="uf-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="uf-save-btn">Add Update</button>
  `;

  const modal = openModal(`Add Update — ${project.name}`, bodyHtml, footerHtml);

  modal.querySelector('#uf-cancel-btn').addEventListener('click', closeModal);

  modal.querySelector('#uf-save-btn').addEventListener('click', async () => {
    const updateText = modal.querySelector('#uf-text').value.trim();
    if (!updateText) {
      toast('Update text is required.', 'warning');
      modal.querySelector('#uf-text').focus();
      return;
    }

    const data = {
      update_text: updateText,
      health:      modal.querySelector('#uf-health').value || null,
      source:      modal.querySelector('#uf-source').value,
    };

    const btn = modal.querySelector('#uf-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await API.addProjectUpdate(project.id, data);
      // If health changed, patch local cache
      if (data.health) {
        const idx = _projects.findIndex(p => String(p.id) === String(project.id));
        if (idx >= 0) _projects[idx] = { ..._projects[idx], health: data.health };
      }
      toast('Update added.', 'success');
      closeModal();
      renderAll(container);
    } catch (err) {
      toast(`Failed to add update: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Add Update';
    }
  });
}
