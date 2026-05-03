/* ══════════════════════════════════════════════
   Team Members Module
   ══════════════════════════════════════════════ */

import { registerModule, db, navigate, openModal, closeModal, toast, confirm, escHtml, avatarHtml, formatDate, statusBadge } from '../app.js';

const STORE = 'team_members';
const STORE_1ON1 = 'one_on_ones';
const STORE_ACTIONS = 'action_items';

const TIMEZONES = [
  'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific',
  'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Australia/Sydney', 'America/Sao_Paulo', 'America/Toronto',
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on-leave', label: 'On Leave' },
  { value: 'pip', label: 'PIP' },
];

// ── State ──
let searchQuery = '';
let statusFilter = '';
let detailMemberId = null;

// ── Main Render ──
async function renderTeam(container) {
  detailMemberId = null;
  container.innerHTML = '<div class="team-module" id="team-root"></div>';
  await renderList();
}

async function renderList() {
  const root = document.getElementById('team-root');
  if (!root) return;

  const members = await db.getAll(STORE, { sortBy: 'name', sortDir: 'asc' });

  // Apply filters
  const filtered = members.filter(m => {
    if (statusFilter && m.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = `${m.name} ${m.role} ${m.email} ${(m.skills || []).join(' ')} ${m.timezone || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Fetch last 1:1 dates for each member
  const oneOnOnes = await db.getAll(STORE_1ON1, { sortBy: 'date', sortDir: 'desc' });
  const last1on1Map = {};
  for (const o of oneOnOnes) {
    if (o.memberId && !last1on1Map[o.memberId]) {
      last1on1Map[o.memberId] = o.date;
    }
  }

  const stats = buildStats(members);

  root.innerHTML = `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>👥 Team Members</h1>
        <div class="page-subtitle">${members.length} direct report${members.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="team-add-btn">+ Add Member</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="margin-bottom: 20px;">
      <div class="stat-card">
        <div class="stat-icon purple">👥</div>
        <div class="stat-info">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Members</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✓</div>
        <div class="stat-info">
          <div class="stat-value">${stats.active}</div>
          <div class="stat-label">Active</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon yellow">🏖</div>
        <div class="stat-info">
          <div class="stat-value">${stats.onLeave}</div>
          <div class="stat-label">On Leave</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">⚠</div>
        <div class="stat-info">
          <div class="stat-value">${stats.pip}</div>
          <div class="stat-label">PIP</div>
        </div>
      </div>
    </div>

    <!-- Filter/Search Bar -->
    <div class="card" style="margin-bottom: 20px; padding: 14px 20px;">
      <div class="flex gap-md" style="align-items: center; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px;">
          <input type="text" class="form-input" id="team-search"
            placeholder="Search by name, role, email, skills…"
            value="${escHtml(searchQuery)}" />
        </div>
        <div style="min-width: 160px;">
          <select class="form-select" id="team-status-filter">
            <option value="">All Statuses</option>
            ${STATUS_OPTIONS.map(s =>
              `<option value="${s.value}" ${statusFilter === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </select>
        </div>
        ${(searchQuery || statusFilter) ? `<button class="btn btn-ghost btn-sm" id="team-clear-filters">Clear</button>` : ''}
      </div>
    </div>

    <!-- Table / Empty -->
    <div class="card" style="padding: 0; overflow-x: auto;">
      ${filtered.length === 0 ? renderEmptyState(members.length === 0) : renderTable(filtered, last1on1Map)}
    </div>

    <!-- Detail panel placeholder -->
    <div id="team-detail-panel"></div>
  `;

  // ── Event Bindings ──
  document.getElementById('team-add-btn')?.addEventListener('click', () => openMemberModal());

  document.getElementById('team-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderList();
  });

  document.getElementById('team-status-filter')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    renderList();
  });

  document.getElementById('team-clear-filters')?.addEventListener('click', () => {
    searchQuery = '';
    statusFilter = '';
    renderList();
  });

  // Row clicks → detail view
  document.querySelectorAll('.team-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't trigger if clicking action buttons
      if (e.target.closest('.table-actions')) return;
      showMemberDetail(row.dataset.id);
    });
  });

  // Edit buttons
  document.querySelectorAll('.team-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMemberModal(btn.dataset.id);
    });
  });

  // Delete buttons
  document.querySelectorAll('.team-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMember(btn.dataset.id, btn.dataset.name);
    });
  });
}

// ── Stats ──
function buildStats(members) {
  return {
    total: members.length,
    active: members.filter(m => m.status === 'active').length,
    onLeave: members.filter(m => m.status === 'on-leave').length,
    pip: members.filter(m => m.status === 'pip').length,
  };
}

// ── Render Table ──
function renderTable(members, last1on1Map) {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 40px;"></th>
          <th>Name</th>
          <th>Role / Title</th>
          <th>Start Date</th>
          <th>Status</th>
          <th>Last 1:1</th>
          <th style="width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${members.map(m => {
          const last1on1 = last1on1Map[m.id];
          const oneOnOneWarning = getOneOnOneWarning(last1on1);
          return `
            <tr class="team-row" data-id="${m.id}" style="cursor: pointer;">
              <td>${avatarHtml(m.name)}</td>
              <td>
                <div class="fw-600">${escHtml(m.name)}</div>
                <div class="text-xs text-muted">${escHtml(m.email || '')}</div>
              </td>
              <td>${escHtml(m.role || '—')}</td>
              <td>${formatDate(m.startDate)}</td>
              <td>${statusBadge(m.status || 'active')}</td>
              <td>
                <span ${oneOnOneWarning ? 'style="color: var(--red);"' : ''}>
                  ${last1on1 ? formatDate(last1on1) : '<span class="text-muted">None</span>'}
                </span>
                ${oneOnOneWarning ? '<span style="font-size:0.72rem; color:var(--red);"> ⚠ overdue</span>' : ''}
              </td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-ghost btn-sm btn-icon team-edit-btn" data-id="${m.id}" title="Edit">✏️</button>
                  <button class="btn btn-ghost btn-sm btn-icon team-delete-btn" data-id="${m.id}" data-name="${escHtml(m.name)}" title="Delete">🗑️</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function getOneOnOneWarning(lastDate) {
  if (!lastDate) return false;
  const d = new Date(lastDate);
  const now = new Date();
  const diffDays = (now - d) / (1000 * 60 * 60 * 24);
  return diffDays > 14; // Warn if no 1:1 in 2+ weeks
}

// ── Empty State ──
function renderEmptyState(isNew) {
  if (isNew) {
    return `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>No team members yet</h3>
        <p>Add your first direct report to get started.</p>
        <button class="btn btn-primary" onclick="document.getElementById('team-add-btn').click()">+ Add Member</button>
      </div>`;
  }
  return `
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <h3>No results found</h3>
      <p>Try adjusting your search or filters.</p>
    </div>`;
}

// ── Add / Edit Modal ──
async function openMemberModal(memberId) {
  let member = null;
  if (memberId) {
    member = await db.get(STORE, memberId);
  }

  const isEdit = !!member;
  const title = isEdit ? `Edit ${member.name}` : 'Add Team Member';

  const body = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" class="form-input" id="member-name"
          value="${escHtml(member?.name || '')}" placeholder="Full name" required />
      </div>
      <div class="form-group">
        <label class="form-label">Role / Title</label>
        <input type="text" class="form-input" id="member-role"
          value="${escHtml(member?.role || '')}" placeholder="e.g. Senior Engineer" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" id="member-email"
          value="${escHtml(member?.email || '')}" placeholder="name@datadog.com" />
      </div>
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input type="date" class="form-input" id="member-startDate"
          value="${member?.startDate || ''}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="member-status">
          ${STATUS_OPTIONS.map(s =>
            `<option value="${s.value}" ${(member?.status || 'active') === s.value ? 'selected' : ''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Timezone</label>
        <select class="form-select" id="member-timezone">
          <option value="">Select timezone…</option>
          ${TIMEZONES.map(tz =>
            `<option value="${tz}" ${member?.timezone === tz ? 'selected' : ''}>${tz}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Skills</label>
      <input type="text" class="form-input" id="member-skills"
        value="${escHtml((member?.skills || []).join(', '))}" placeholder="Go, Python, Kubernetes, observability…" />
      <div class="form-hint">Comma-separated list of skills</div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="member-notes" rows="3"
        placeholder="Private notes about this team member…">${escHtml(member?.notes || '')}</textarea>
    </div>
  `;

  const footer = `
    <button class="btn btn-ghost" id="member-modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="member-modal-save">${isEdit ? 'Save Changes' : 'Add Member'}</button>
  `;

  openModal(title, body, footer);

  document.getElementById('member-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('member-modal-save').addEventListener('click', () => saveMember(memberId));
}

async function saveMember(existingId) {
  const name = document.getElementById('member-name')?.value.trim();
  const role = document.getElementById('member-role')?.value.trim();
  const email = document.getElementById('member-email')?.value.trim();
  const startDate = document.getElementById('member-startDate')?.value || '';
  const status = document.getElementById('member-status')?.value || 'active';
  const timezone = document.getElementById('member-timezone')?.value || '';
  const skillsRaw = document.getElementById('member-skills')?.value || '';
  const notes = document.getElementById('member-notes')?.value.trim();

  if (!name) {
    toast('Name is required', 'error');
    document.getElementById('member-name')?.focus();
    return;
  }

  const skills = skillsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const record = { name, role, email, startDate, status, timezone, skills, notes };

  try {
    if (existingId) {
      record.id = existingId;
      await db.update(STORE, record);
      toast(`${name} updated`, 'success');
    } else {
      await db.add(STORE, record);
      toast(`${name} added to team`, 'success');
    }
    closeModal();
    await renderList();

    // If detail panel is open for this member, refresh it
    if (detailMemberId === existingId) {
      showMemberDetail(existingId);
    }
  } catch (err) {
    console.error('Save member error:', err);
    toast('Failed to save: ' + err.message, 'error');
  }
}

// ── Delete ──
async function deleteMember(id, name) {
  const ok = await confirm(`Remove "${name}" from your team? This action cannot be undone.`);
  if (!ok) return;

  try {
    await db.delete(STORE, id);
    toast(`${name} removed`, 'success');

    // Close detail if it was open for this member
    if (detailMemberId === id) {
      detailMemberId = null;
    }

    await renderList();
  } catch (err) {
    console.error('Delete member error:', err);
    toast('Failed to delete: ' + err.message, 'error');
  }
}

// ── Member Detail View ──
async function showMemberDetail(memberId) {
  detailMemberId = memberId;
  const panel = document.getElementById('team-detail-panel');
  if (!panel) return;

  const member = await db.get(STORE, memberId);
  if (!member) {
    panel.innerHTML = '';
    return;
  }

  // Fetch 1:1s for this member
  const oneOnOnes = await db.getAll(STORE_1ON1, {
    filter: (r) => r.memberId === memberId,
    sortBy: 'date',
    sortDir: 'desc',
  });

  // Fetch action items assigned to this member
  const actionItems = await db.getAll(STORE_ACTIONS, {
    filter: (r) => r.assignee === memberId || r.assignee === member.name,
    sortBy: 'dueDate',
    sortDir: 'asc',
  });

  const tenure = member.startDate ? getTenure(member.startDate) : '—';

  panel.innerHTML = `
    <div class="card" style="margin-top: 20px; position: relative;">
      <button class="btn btn-ghost btn-icon" id="detail-close"
        style="position: absolute; top: 12px; right: 12px;" title="Close">✕</button>

      <!-- Profile Header -->
      <div class="flex gap-lg" style="align-items: flex-start; margin-bottom: 20px;">
        ${avatarHtml(member.name, 'lg')}
        <div style="flex: 1;">
          <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: 4px;">${escHtml(member.name)}</h2>
          <div class="text-muted" style="margin-bottom: 6px;">${escHtml(member.role || 'No role set')}</div>
          <div class="flex gap-sm" style="flex-wrap: wrap; align-items: center;">
            ${statusBadge(member.status || 'active')}
            ${member.timezone ? `<span class="badge badge-neutral">🕐 ${escHtml(member.timezone)}</span>` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm detail-edit-btn" data-id="${member.id}">✏️ Edit</button>
        </div>
      </div>

      <!-- Info Grid -->
      <div class="grid-3" style="margin-bottom: 20px;">
        <div>
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Email</div>
          <div style="font-size: 0.88rem;">${member.email ? `<a href="mailto:${escHtml(member.email)}">${escHtml(member.email)}</a>` : '<span class="text-muted">—</span>'}</div>
        </div>
        <div>
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Start Date</div>
          <div style="font-size: 0.88rem;">${formatDate(member.startDate)} <span class="text-muted text-xs">(${tenure})</span></div>
        </div>
        <div>
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Last 1:1</div>
          <div style="font-size: 0.88rem;">${oneOnOnes.length > 0 ? formatDate(oneOnOnes[0].date) : '<span class="text-muted">None yet</span>'}</div>
        </div>
      </div>

      <!-- Skills -->
      ${member.skills && member.skills.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Skills</div>
          <div class="flex gap-xs" style="flex-wrap: wrap;">
            ${member.skills.map(s => `<span class="tag">${escHtml(s)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Notes -->
      ${member.notes ? `
        <div style="margin-bottom: 20px;">
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Notes</div>
          <div style="font-size: 0.88rem; color: var(--text-muted); white-space: pre-wrap;">${escHtml(member.notes)}</div>
        </div>
      ` : ''}

      <hr class="section-divider" />

      <!-- 1:1 History & Action Items Side by Side -->
      <div class="grid-2">
        <!-- 1:1 History -->
        <div>
          <div class="flex-between mb-sm">
            <h3 style="font-size: 1rem; font-weight: 600;">📅 1:1 History</h3>
            <span class="text-xs text-muted">${oneOnOnes.length} session${oneOnOnes.length !== 1 ? 's' : ''}</span>
          </div>
          ${oneOnOnes.length === 0
            ? '<div class="text-muted text-sm" style="padding: 12px 0;">No 1:1s recorded yet.</div>'
            : `<div class="timeline">
                ${oneOnOnes.slice(0, 10).map(o => `
                  <div class="timeline-item">
                    <div class="tl-time">${formatDate(o.date)}</div>
                    <div class="tl-text">${escHtml(o.title || o.summary || 'Untitled 1:1')}</div>
                  </div>
                `).join('')}
                ${oneOnOnes.length > 10 ? `<div class="text-xs text-muted">+ ${oneOnOnes.length - 10} more</div>` : ''}
              </div>`
          }
        </div>

        <!-- Action Items -->
        <div>
          <div class="flex-between mb-sm">
            <h3 style="font-size: 1rem; font-weight: 600;">✅ Action Items</h3>
            <span class="text-xs text-muted">${actionItems.length} item${actionItems.length !== 1 ? 's' : ''}</span>
          </div>
          ${actionItems.length === 0
            ? '<div class="text-muted text-sm" style="padding: 12px 0;">No action items assigned.</div>'
            : `<div style="display: flex; flex-direction: column; gap: 8px;">
                ${actionItems.slice(0, 10).map(ai => `
                  <div class="flex gap-sm" style="align-items: flex-start; font-size: 0.88rem; padding: 8px; background: var(--bg); border-radius: var(--radius-sm);">
                    <span style="flex-shrink: 0;">${ai.status === 'done' || ai.status === 'completed' ? '☑' : '☐'}</span>
                    <div style="flex: 1;">
                      <div ${ai.status === 'done' || ai.status === 'completed' ? 'style="text-decoration: line-through; opacity: 0.6;"' : ''}>${escHtml(ai.title || ai.text || 'Untitled')}</div>
                      ${ai.dueDate ? `<div class="text-xs text-muted">Due ${formatDate(ai.dueDate)}</div>` : ''}
                    </div>
                    ${ai.status ? statusBadge(ai.status) : ''}
                  </div>
                `).join('')}
                ${actionItems.length > 10 ? `<div class="text-xs text-muted">+ ${actionItems.length - 10} more</div>` : ''}
              </div>`
          }
        </div>
      </div>
    </div>
  `;

  // Scroll detail into view
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Event bindings for detail panel
  document.getElementById('detail-close')?.addEventListener('click', () => {
    detailMemberId = null;
    panel.innerHTML = '';
  });

  panel.querySelector('.detail-edit-btn')?.addEventListener('click', () => {
    openMemberModal(memberId);
  });
}

// ── Helpers ──
function getTenure(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now - start;
  if (diffMs < 0) return 'starts soon';

  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);

  if (years > 0 && months > 0) return `${years}y ${months}m`;
  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}m`;
  if (totalDays > 0) return `${totalDays}d`;
  return 'today';
}

// ── Register ──
registerModule({
  id: 'team',
  label: 'Team',
  icon: '👥',
  section: 'people',
  order: 10,
  render: renderTeam
});
