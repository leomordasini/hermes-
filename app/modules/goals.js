/* ══════════════════════════════════════════════
   Goals & OKRs Module
   Track team/personal goals and key results by quarter
   ══════════════════════════════════════════════ */

import { registerModule, db, openModal, closeModal, toast, confirm, escHtml, statusBadge, priorityBadge, formatDate, getCurrentQuarter } from '../app.js';

const STORE = 'goals';

/* ── State ── */
let filterQuarter = '';
let filterCategory = '';
let filterStatus = '';

/* ── Helpers ── */
function generateQuarterOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const quarters = [];
  // Previous year Q3-Q4, current year all, next year Q1-Q2
  for (let y = year - 1; y <= year + 1; y++) {
    for (let q = 1; q <= 4; q++) {
      quarters.push(`Q${q} ${y}`);
    }
  }
  return quarters;
}

function progressColor(pct) {
  if (pct >= 75) return 'var(--green, #66bb6a)';
  if (pct >= 50) return 'var(--orange, #ff9800)';
  if (pct >= 25) return 'var(--yellow, #ffd54f)';
  return 'var(--red, #ef5350)';
}

function categoryTag(cat) {
  const colors = {
    team: 'info',
    personal: 'purple',
    org: 'warning'
  };
  return `<span class="tag badge-${colors[cat] || 'neutral'}">${escHtml(cat)}</span>`;
}

function computeKRProgress(keyResults) {
  if (!keyResults || keyResults.length === 0) return null;
  let totalPct = 0;
  for (const kr of keyResults) {
    const target = parseFloat(kr.target) || 1;
    const current = parseFloat(kr.current) || 0;
    totalPct += Math.min((current / target) * 100, 100);
  }
  return Math.round(totalPct / keyResults.length);
}

/* ── Stats Bar ── */
function renderStats(goals) {
  const total = goals.length;
  const onTrack = goals.filter(g => g.status === 'on_track').length;
  const completed = goals.filter(g => g.status === 'completed').length;
  const pctOnTrack = total ? Math.round((onTrack / total) * 100) : 0;
  const pctCompleted = total ? Math.round((completed / total) * 100) : 0;
  const avgProgress = total ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / total) : 0;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${total}</div>
        <div class="stat-label">Total Goals</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--green, #66bb6a)">${pctOnTrack}%</div>
        <div class="stat-label">On Track</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--purple, #632ca6)">${pctCompleted}%</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${avgProgress}%</div>
        <div class="stat-label">Avg Progress</div>
      </div>
    </div>`;
}

/* ── Goal Card ── */
function renderGoalCard(goal) {
  const progress = goal.progress || 0;
  const krs = goal.keyResults || [];
  const krProgress = computeKRProgress(krs);

  return `
    <div class="card" style="margin-bottom: 1rem; padding: 1.25rem;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem;">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600;">${escHtml(goal.title)}</h3>
            ${categoryTag(goal.category)}
            ${priorityBadge(goal.priority)}
            ${statusBadge(goal.status)}
          </div>
          ${goal.description ? `<p style="margin: 0.25rem 0 0; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.4;">${escHtml(goal.description)}</p>` : ''}
        </div>
        <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
          <button class="btn btn-ghost btn-icon btn-edit-goal" data-id="${goal.id}" title="Edit">✏️</button>
          <button class="btn btn-ghost btn-icon btn-delete-goal" data-id="${goal.id}" title="Delete">🗑️</button>
        </div>
      </div>

      <!-- Progress Bar -->
      <div style="margin-bottom: 0.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
          <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary);">Progress</span>
          <span style="font-size: 0.82rem; font-weight: 700;">${progress}%</span>
        </div>
        <div class="progress">
          <div class="progress-bar" style="width: ${progress}%; background: ${progressColor(progress)};"></div>
        </div>
      </div>

      <!-- Key Results -->
      ${krs.length > 0 ? `
        <div style="margin-top: 0.5rem;">
          <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem;">
            🔑 Key Results (${krProgress !== null ? krProgress + '% avg' : '—'})
          </div>
          ${krs.map((kr, i) => {
            const target = parseFloat(kr.target) || 1;
            const current = parseFloat(kr.current) || 0;
            const pct = Math.min(Math.round((current / target) * 100), 100);
            return `
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.4rem; font-size: 0.88rem;">
                <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(kr.title)}</span>
                <span style="flex-shrink: 0; font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap;">${current} / ${kr.target}</span>
                <div class="progress" style="width: 80px; flex-shrink: 0; height: 6px;">
                  <div class="progress-bar" style="width: ${pct}%; background: ${progressColor(pct)};"></div>
                </div>
              </div>`;
          }).join('')}
        </div>` : ''}

      <!-- Footer meta -->
      <div style="display: flex; gap: 1rem; margin-top: 0.75rem; font-size: 0.78rem; color: var(--text-secondary);">
        <span>📅 ${escHtml(goal.quarter)}</span>
        ${goal.dueDate ? `<span>Due: ${formatDate(goal.dueDate)}</span>` : ''}
      </div>
    </div>`;
}

/* ── Add/Edit Modal ── */
function openGoalModal(existing) {
  const isEdit = !!existing;
  const g = existing || {
    title: '',
    description: '',
    category: 'team',
    status: 'not_started',
    priority: 'medium',
    quarter: getCurrentQuarter(),
    progress: 0,
    keyResults: [],
    dueDate: ''
  };

  const quarters = generateQuarterOptions();
  const krs = g.keyResults && g.keyResults.length > 0 ? g.keyResults : [];

  const body = `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div class="form-group">
        <label class="form-label">Title *</label>
        <input id="modal-title" class="form-input" type="text" value="${escHtml(g.title)}" placeholder="Goal title" required />
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="modal-description" class="form-textarea" rows="3" placeholder="Describe the goal...">${escHtml(g.description)}</textarea>
      </div>

      <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="modal-category" class="form-select">
            <option value="team" ${g.category === 'team' ? 'selected' : ''}>Team</option>
            <option value="personal" ${g.category === 'personal' ? 'selected' : ''}>Personal</option>
            <option value="org" ${g.category === 'org' ? 'selected' : ''}>Org</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="modal-status" class="form-select">
            <option value="not_started" ${g.status === 'not_started' ? 'selected' : ''}>Not Started</option>
            <option value="in_progress" ${g.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="on_track" ${g.status === 'on_track' ? 'selected' : ''}>On Track</option>
            <option value="at_risk" ${g.status === 'at_risk' ? 'selected' : ''}>At Risk</option>
            <option value="completed" ${g.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select id="modal-priority" class="form-select">
            <option value="critical" ${g.priority === 'critical' ? 'selected' : ''}>Critical</option>
            <option value="high" ${g.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${g.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="low" ${g.priority === 'low' ? 'selected' : ''}>Low</option>
          </select>
        </div>
      </div>

      <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Quarter</label>
          <select id="modal-quarter" class="form-select">
            ${quarters.map(q => `<option value="${q}" ${g.quarter === q ? 'selected' : ''}>${q}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Progress (%)</label>
          <input id="modal-progress" class="form-input" type="number" min="0" max="100" value="${g.progress || 0}" />
        </div>
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input id="modal-dueDate" class="form-input" type="date" value="${g.dueDate || ''}" />
        </div>
      </div>

      <!-- Key Results Section -->
      <div class="form-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <label class="form-label" style="margin-bottom: 0;">🔑 Key Results</label>
          <button type="button" class="btn btn-ghost" id="btn-add-kr" style="font-size: 0.85rem; padding: 0.25rem 0.5rem;">+ Add KR</button>
        </div>
        <div id="kr-container">
          ${krs.map((kr, i) => krRowHtml(i, kr)).join('')}
        </div>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">${isEdit ? 'Update Goal' : 'Create Goal'}</button>`;

  openModal(isEdit ? 'Edit Goal' : 'New Goal', body, footer);

  // KR counter for unique IDs
  let krCount = krs.length;

  // Add KR row handler
  document.getElementById('btn-add-kr').addEventListener('click', () => {
    const container = document.getElementById('kr-container');
    const div = document.createElement('div');
    div.innerHTML = krRowHtml(krCount, { title: '', target: '', current: '' });
    container.appendChild(div.firstElementChild);
    krCount++;
  });

  // Remove KR row handler (delegated)
  document.getElementById('kr-container').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove-kr');
    if (btn) {
      btn.closest('.kr-row').remove();
    }
  });

  // Cancel
  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  // Save
  document.getElementById('modal-save').addEventListener('click', async () => {
    const title = document.getElementById('modal-title').value.trim();
    if (!title) {
      toast('Title is required', 'warning');
      return;
    }

    // Gather key results from DOM
    const keyResults = [];
    document.querySelectorAll('.kr-row').forEach(row => {
      const krTitle = row.querySelector('.kr-title').value.trim();
      const krTarget = row.querySelector('.kr-target').value.trim();
      const krCurrent = row.querySelector('.kr-current').value.trim();
      if (krTitle) {
        keyResults.push({ title: krTitle, target: krTarget, current: krCurrent });
      }
    });

    const record = {
      title,
      description: document.getElementById('modal-description').value.trim(),
      category: document.getElementById('modal-category').value,
      status: document.getElementById('modal-status').value,
      priority: document.getElementById('modal-priority').value,
      quarter: document.getElementById('modal-quarter').value,
      progress: parseInt(document.getElementById('modal-progress').value, 10) || 0,
      dueDate: document.getElementById('modal-dueDate').value || null,
      keyResults
    };

    try {
      if (isEdit) {
        record.id = existing.id;
        await db.update(STORE, record);
        toast('Goal updated', 'success');
      } else {
        await db.add(STORE, record);
        toast('Goal created', 'success');
      }
      closeModal();
      renderGoals(document.getElementById('app-content'));
    } catch (err) {
      console.error(err);
      toast('Error saving goal: ' + err.message, 'error');
    }
  });
}

function krRowHtml(index, kr) {
  return `
    <div class="kr-row" style="display: grid; grid-template-columns: 1fr 80px 80px 32px; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
      <input class="form-input kr-title" type="text" placeholder="Key Result title" value="${escHtml(kr.title || '')}" />
      <input class="form-input kr-target" type="text" placeholder="Target" value="${escHtml(kr.target || '')}" />
      <input class="form-input kr-current" type="text" placeholder="Current" value="${escHtml(kr.current || '')}" />
      <button type="button" class="btn btn-ghost btn-icon btn-remove-kr" title="Remove" style="color: var(--red, #ef5350); padding: 0.2rem;">✕</button>
    </div>`;
}

/* ── Delete Goal ── */
async function deleteGoal(id) {
  const ok = await confirm('Are you sure you want to delete this goal?');
  if (!ok) return;

  try {
    await db.delete(STORE, id);
    toast('Goal deleted', 'success');
    renderGoals(document.getElementById('app-content'));
  } catch (err) {
    console.error(err);
    toast('Error deleting goal: ' + err.message, 'error');
  }
}

/* ── Main Render ── */
async function renderGoals(container) {
  // Set default quarter filter on first load
  if (!filterQuarter) {
    filterQuarter = getCurrentQuarter();
  }

  const allGoals = await db.getAll(STORE, { sortBy: 'createdAt', sortDir: 'desc' });

  // Apply filters
  let goals = allGoals;
  if (filterQuarter) {
    goals = goals.filter(g => g.quarter === filterQuarter);
  }
  if (filterCategory) {
    goals = goals.filter(g => g.category === filterCategory);
  }
  if (filterStatus) {
    goals = goals.filter(g => g.status === filterStatus);
  }

  // Collect all unique quarters for the dropdown
  const allQuarters = [...new Set(allGoals.map(g => g.quarter).filter(Boolean))];
  const quarterOptions = generateQuarterOptions();
  // Merge any existing quarters not in the generated list
  for (const q of allQuarters) {
    if (!quarterOptions.includes(q)) quarterOptions.push(q);
  }

  container.innerHTML = `
    <div class="page-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
      <div>
        <h1 style="margin: 0; font-size: 1.5rem;">🎯 Goals & OKRs</h1>
        <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.88rem;">Track and manage team and personal objectives</p>
      </div>
      <button class="btn btn-primary" id="btn-add-goal">+ New Goal</button>
    </div>

    <!-- Filters -->
    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
      <select id="filter-quarter" class="form-select" style="min-width: 140px;">
        <option value="">All Quarters</option>
        ${quarterOptions.map(q => `<option value="${q}" ${filterQuarter === q ? 'selected' : ''}>${q}</option>`).join('')}
      </select>
      <select id="filter-category" class="form-select" style="min-width: 130px;">
        <option value="">All Categories</option>
        <option value="team" ${filterCategory === 'team' ? 'selected' : ''}>Team</option>
        <option value="personal" ${filterCategory === 'personal' ? 'selected' : ''}>Personal</option>
        <option value="org" ${filterCategory === 'org' ? 'selected' : ''}>Org</option>
      </select>
      <select id="filter-status" class="form-select" style="min-width: 140px;">
        <option value="">All Statuses</option>
        <option value="not_started" ${filterStatus === 'not_started' ? 'selected' : ''}>Not Started</option>
        <option value="in_progress" ${filterStatus === 'in_progress' ? 'selected' : ''}>In Progress</option>
        <option value="on_track" ${filterStatus === 'on_track' ? 'selected' : ''}>On Track</option>
        <option value="at_risk" ${filterStatus === 'at_risk' ? 'selected' : ''}>At Risk</option>
        <option value="completed" ${filterStatus === 'completed' ? 'selected' : ''}>Completed</option>
      </select>
    </div>

    <!-- Stats -->
    ${renderStats(goals)}

    <!-- Goals List -->
    <div id="goals-list" style="margin-top: 1.25rem;">
      ${goals.length > 0
        ? goals.map(g => renderGoalCard(g)).join('')
        : `<div class="empty-state">
            <div class="empty-icon">🎯</div>
            <h3>No goals found</h3>
            <p>${filterQuarter || filterCategory || filterStatus ? 'Try adjusting your filters or ' : ''}Create your first goal to get started.</p>
            <button class="btn btn-primary" id="btn-empty-add">+ New Goal</button>
          </div>`
      }
    </div>`;

  // ── Event Bindings ──

  // Add goal buttons
  document.getElementById('btn-add-goal').addEventListener('click', () => openGoalModal(null));
  const emptyAdd = document.getElementById('btn-empty-add');
  if (emptyAdd) emptyAdd.addEventListener('click', () => openGoalModal(null));

  // Filter changes
  document.getElementById('filter-quarter').addEventListener('change', (e) => {
    filterQuarter = e.target.value;
    renderGoals(container);
  });
  document.getElementById('filter-category').addEventListener('change', (e) => {
    filterCategory = e.target.value;
    renderGoals(container);
  });
  document.getElementById('filter-status').addEventListener('change', (e) => {
    filterStatus = e.target.value;
    renderGoals(container);
  });

  // Edit goal (delegated)
  container.querySelectorAll('.btn-edit-goal').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const goal = await db.get(STORE, id);
      if (goal) openGoalModal(goal);
    });
  });

  // Delete goal (delegated)
  container.querySelectorAll('.btn-delete-goal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGoal(btn.dataset.id);
    });
  });
}

/* ── Register Module ── */
registerModule({
  id: 'goals',
  label: 'Goals & OKRs',
  icon: '🎯',
  section: 'work',
  order: 20,
  render: renderGoals
});
