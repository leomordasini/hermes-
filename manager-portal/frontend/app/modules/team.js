import {
  registerModule, API, toast, openModal, closeModal, confirmDialog,
  escHtml, avatarHtml, statusBadge, formatDate, formatRelative, pluralize
} from '../app.js';

// ---------------------------------------------------------------------------
// Module registration
// ---------------------------------------------------------------------------

registerModule({
  id: 'team',
  label: 'Team',
  icon: '👥',
  section: 'people',
  order: 10,
  render: renderTeam
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
];

function currentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calculate human-readable tenure from an ISO date string.
 * e.g. "2 years, 3 months"
 */
function calcTenure(startDate) {
  if (!startDate) return '—';
  const start = new Date(startDate);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  const parts = [];
  if (years > 0) parts.push(pluralize(years, 'year'));
  if (months > 0) parts.push(pluralize(months, 'month'));
  return parts.length ? parts.join(', ') : 'Less than a month';
}

function sentimentBadge(s) {
  const map = { positive: 'success', neutral: 'info', concerning: 'danger' };
  const cls = map[s] || 'secondary';
  return `<span class="badge badge-${cls}">${escHtml(s || '—')}</span>`;
}

function impactBadge(level) {
  const map = { low: 'secondary', medium: 'warning', high: 'success' };
  const cls = map[level] || 'secondary';
  return `<span class="badge badge-${cls}">${escHtml(level || '—')}</span>`;
}

function sourceBadge(source) {
  return `<span class="badge badge-info">${escHtml(source || 'peer')}</span>`;
}

function severityDot(severity) {
  const map = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444', critical: '#7c3aed' };
  const color = map[(severity || '').toLowerCase()] || '#6b7280';
  return `<span class="severity-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;margin-top:5px;"></span>`;
}

function tagPills(tags) {
  if (!tags || !tags.length) return '';
  const arr = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean);
  return arr.map(t => `<span class="badge badge-secondary" style="margin-right:4px;">${escHtml(t)}</span>`).join('');
}

// ---------------------------------------------------------------------------
// Main render entry-point
// ---------------------------------------------------------------------------

export async function renderTeam(container) {
  container.innerHTML = `<div class="loading-spinner">Loading team…</div>`;

  let members;
  try {
    members = await API.getTeamMembers();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load team members.</p></div>`;
    toast('Failed to load team members', 'error');
    return;
  }

  renderGrid(container, members);
}

// ---------------------------------------------------------------------------
// Grid view
// ---------------------------------------------------------------------------

function renderGrid(container, members) {
  const count = members.length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Team</h1>
        <span class="text-muted">${pluralize(count, 'member')}</span>
      </div>
      <button class="btn btn-primary" id="add-member-btn">+ Add Member</button>
    </div>

    <div class="grid-3" id="member-grid">
      ${count === 0
        ? `<div class="empty-state" style="grid-column:1/-1"><p>No team members yet. Add one to get started!</p></div>`
        : members.map(m => memberCardHtml(m)).join('')
      }
    </div>
  `;

  // Add Member
  container.querySelector('#add-member-btn').addEventListener('click', () => {
    openAddMemberModal(null, async () => {
      const fresh = await API.getTeamMembers();
      renderGrid(container, fresh);
    });
  });

  // Card actions
  container.querySelector('#member-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    const action = btn.dataset.action;
    const memberId = btn.dataset.id;
    const member = members.find(m => String(m.id) === String(memberId));
    if (!member) return;

    if (action === 'edit') {
      openAddMemberModal(member, async () => {
        const fresh = await API.getTeamMembers();
        renderGrid(container, fresh);
      });
    } else if (action === 'delete') {
      const ok = await confirmDialog(`Remove ${member.name} from the team?`);
      if (!ok) return;
      try {
        await API.deleteMember(member.id);
        toast(`${member.name} removed.`, 'success');
        const fresh = await API.getTeamMembers();
        renderGrid(container, fresh);
      } catch {
        toast('Failed to delete member.', 'error');
      }
    } else if (action === 'view-oneonones') {
      renderDetail(container, member, 'oneonones');
    } else if (action === 'view-achievements') {
      renderDetail(container, member, 'achievements');
    } else if (action === 'view-detail') {
      renderDetail(container, member, 'oneonones');
    }
  });

  // Clicking the card body (not a button) → detail
  container.querySelector('#member-grid').addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return;
    const card = e.target.closest('.member-card[data-id]');
    if (!card) return;
    const member = members.find(m => String(m.id) === String(card.dataset.id));
    if (member) renderDetail(container, member, 'oneonones');
  });
}

function memberCardHtml(m) {
  return `
    <div class="card member-card" data-id="${m.id}" style="cursor:pointer;">
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:12px;">
        <div class="avatar-lg">${avatarHtml(m.name, 'lg')}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(m.name)}</div>
          <div class="text-muted" style="font-size:0.85rem;margin-bottom:4px;">${escHtml(m.role || '—')}</div>
          ${statusBadge(m.status)}
        </div>
      </div>

      <div style="font-size:0.85rem;color:var(--text-muted, #6b7280);margin-bottom:4px;">
        📧 ${escHtml(m.email || '—')}
      </div>
      <div style="font-size:0.85rem;color:var(--text-muted, #6b7280);margin-bottom:4px;">
        🌐 ${escHtml(m.timezone || '—')}
      </div>
      <div style="font-size:0.85rem;color:var(--text-muted, #6b7280);margin-bottom:12px;">
        📅 Tenure: ${calcTenure(m.start_date)}
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-secondary" data-action="view-oneonones" data-id="${m.id}">🤝 View 1:1s</button>
        <button class="btn btn-sm btn-secondary" data-action="view-achievements" data-id="${m.id}">🏆 Achievements</button>
        <button class="btn btn-sm btn-outline" data-action="edit" data-id="${m.id}">✏️ Edit</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

async function renderDetail(container, member, initialTab = 'oneonones') {
  container.innerHTML = `<div class="loading-spinner">Loading…</div>`;

  let oneonones = [], achievements = [], wellbeing = [], feedback = [];
  try {
    [oneonones, achievements, wellbeing, feedback] = await Promise.all([
      API.getMemberOneOnOnes(member.id).catch(() => []),
      API.getMemberAchievements(member.id).catch(() => []),
      API.getMemberWellbeing(member.id).catch(() => []),
      API.getMemberFeedback(member.id).catch(() => []),
    ]);
  } catch {
    toast('Some data failed to load.', 'warning');
  }

  const tabs = [
    { id: 'oneonones', label: '🤝 1:1s' },
    { id: 'achievements', label: '🏆 Achievements' },
    { id: 'wellbeing', label: '💚 Wellbeing' },
    { id: 'feedback', label: '💬 Feedback' },
  ];

  container.innerHTML = `
    <div class="page-header" style="margin-bottom:20px;">
      <button class="btn btn-outline" id="back-btn">← Back to Team</button>
    </div>

    <!-- Profile header -->
    <div class="card" style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
      <div class="avatar-lg" style="flex-shrink:0;">${avatarHtml(member.name, 'lg')}</div>
      <div style="flex:1;min-width:200px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
          <h2 style="margin:0;">${escHtml(member.name)}</h2>
          ${statusBadge(member.status)}
        </div>
        <div class="text-muted" style="margin-bottom:6px;">${escHtml(member.role || '—')}</div>
        <div style="font-size:0.9rem;display:flex;flex-direction:column;gap:3px;">
          <span>📧 ${escHtml(member.email || '—')}</span>
          <span>🌐 ${escHtml(member.timezone || '—')}</span>
          <span>📅 Started: ${member.start_date ? formatDate(member.start_date) : '—'} &nbsp;·&nbsp; ${calcTenure(member.start_date)}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-self:flex-start;flex-wrap:wrap;">
        <button class="btn btn-outline" data-action="edit-member">✏️ Edit</button>
        <button class="btn btn-danger-outline" data-action="delete-member">🗑 Remove</button>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="tab-bar" id="detail-tabs">
      ${tabs.map(t => `
        <button class="tab${t.id === initialTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>
      `).join('')}
    </div>

    <!-- Tab panels -->
    <div id="tab-content" style="margin-top:20px;"></div>
  `;

  const tabContent = container.querySelector('#tab-content');

  function showTab(tabId) {
    container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    switch (tabId) {
      case 'oneonones':   renderOneOnOnesTab(tabContent, member, oneonones, refreshOneonones); break;
      case 'achievements': renderAchievementsTab(tabContent, member, achievements, refreshAchievements); break;
      case 'wellbeing':   renderWellbeingTab(tabContent, wellbeing); break;
      case 'feedback':    renderFeedbackTab(tabContent, feedback); break;
    }
  }

  async function refreshOneonones() {
    oneonones = await API.getMemberOneOnOnes(member.id).catch(() => []);
    showTab('oneonones');
  }

  async function refreshAchievements() {
    achievements = await API.getMemberAchievements(member.id).catch(() => []);
    showTab('achievements');
  }

  showTab(initialTab);

  container.querySelector('#detail-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab[data-tab]');
    if (btn) showTab(btn.dataset.tab);
  });

  container.querySelector('#back-btn').addEventListener('click', async () => {
    const members = await API.getTeamMembers().catch(() => []);
    renderGrid(container, members);
  });

  container.querySelector('[data-action="edit-member"]').addEventListener('click', () => {
    openAddMemberModal(member, async () => {
      const updated = await API.getTeamMember(member.id).catch(() => member);
      renderDetail(container, updated, initialTab);
    });
  });

  container.querySelector('[data-action="delete-member"]').addEventListener('click', async () => {
    const ok = await confirmDialog(`Remove ${member.name} from the team? This cannot be undone.`);
    if (!ok) return;
    try {
      await API.deleteMember(member.id);
      toast(`${member.name} removed.`, 'success');
      const members = await API.getTeamMembers().catch(() => []);
      renderGrid(container, members);
    } catch {
      toast('Failed to delete member.', 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Tab: 1:1s
// ---------------------------------------------------------------------------

function renderOneOnOnesTab(container, member, oneonones, onRefresh) {
  oneonones = [...oneonones].sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <h3 style="margin:0;">1:1 History <span class="text-muted" style="font-size:0.9rem;">(${pluralize(oneonones.length, 'session')})</span></h3>
      <button class="btn btn-primary" id="log-oneonone-btn">+ Log 1:1</button>
    </div>

    ${oneonones.length === 0
      ? `<div class="empty-state"><p>No 1:1s logged yet.</p></div>`
      : `<div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sentiment</th>
                <th>Topics</th>
                <th>Summary</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${oneonones.map(o => `
                <tr>
                  <td style="white-space:nowrap;">${formatDate(o.date)}<br><span class="text-muted" style="font-size:0.78rem;">${formatRelative(o.date)}</span></td>
                  <td>${sentimentBadge(o.sentiment)}</td>
                  <td style="font-size:0.85rem;">${topicPills(o.topics)}</td>
                  <td style="font-size:0.88rem;max-width:220px;">${escHtml(o.summary || '—')}</td>
                  <td style="font-size:0.85rem;max-width:180px;color:var(--text-muted);">${escHtml(o.raw_notes || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`
    }
  `;

  container.querySelector('#log-oneonone-btn').addEventListener('click', () => {
    openLogOneOnOneModal(member.id, onRefresh);
  });
}

function topicPills(topics) {
  if (!topics) return '—';
  const arr = Array.isArray(topics) ? topics : String(topics).split(',').map(t => t.trim()).filter(Boolean);
  if (!arr.length) return '—';
  return arr.map(t => `<span class="badge badge-info" style="margin-right:3px;">${escHtml(t)}</span>`).join('');
}

// ---------------------------------------------------------------------------
// Tab: Achievements
// ---------------------------------------------------------------------------

function renderAchievementsTab(container, member, achievements, onRefresh) {
  achievements = [...achievements].sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <h3 style="margin:0;">Achievements <span class="text-muted" style="font-size:0.9rem;">(${achievements.length})</span></h3>
      <button class="btn btn-primary" id="add-achievement-btn">+ Add Achievement</button>
    </div>

    ${achievements.length === 0
      ? `<div class="empty-state"><p>No achievements recorded yet.</p></div>`
      : `<div style="display:flex;flex-direction:column;gap:12px;">
          ${achievements.map(a => `
            <div class="card" style="padding:14px 16px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  ${impactBadge(a.impact_level)}
                  <span class="badge badge-secondary">${escHtml(a.quarter || '—')}</span>
                  <span class="text-muted" style="font-size:0.82rem;">${formatDate(a.date)}</span>
                </div>
              </div>
              <p style="margin:0 0 8px;font-size:0.95rem;">${escHtml(a.description || '—')}</p>
              <div>${tagPills(a.tags)}</div>
            </div>
          `).join('')}
        </div>`
    }
  `;

  container.querySelector('#add-achievement-btn').addEventListener('click', () => {
    openAddAchievementModal(member.id, onRefresh);
  });
}

// ---------------------------------------------------------------------------
// Tab: Wellbeing
// ---------------------------------------------------------------------------

function renderWellbeingTab(container, signals) {
  signals = [...signals].sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="margin:0;">Wellbeing Signals <span class="text-muted" style="font-size:0.9rem;">(${pluralize(signals.length, 'signal')})</span></h3>
    </div>

    ${signals.length === 0
      ? `<div class="empty-state"><p>No wellbeing signals recorded.</p></div>`
      : `<div class="timeline">
          ${signals.map(s => `
            <div class="timeline-item" style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border-color,#e5e7eb);">
              ${severityDot(s.severity)}
              <div style="flex:1;">
                <div style="font-size:0.92rem;margin-bottom:3px;">${escHtml(s.signal || s.text || '—')}</div>
                <div class="text-muted" style="font-size:0.8rem;">
                  ${s.severity ? `<span class="badge badge-secondary" style="margin-right:6px;">${escHtml(s.severity)}</span>` : ''}
                  ${formatDate(s.date)} · ${formatRelative(s.date)}
                </div>
              </div>
            </div>
          `).join('')}
        </div>`
    }
  `;
}

// ---------------------------------------------------------------------------
// Tab: Feedback
// ---------------------------------------------------------------------------

function renderFeedbackTab(container, feedback) {
  feedback = [...feedback].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="margin:0;">Feedback <span class="text-muted" style="font-size:0.9rem;">(${pluralize(feedback.length, 'entry', 'entries')})</span></h3>
    </div>

    ${feedback.length === 0
      ? `<div class="empty-state"><p>No feedback recorded yet.</p></div>`
      : `<div style="display:flex;flex-direction:column;gap:12px;">
          ${feedback.map(f => `
            <div class="card" style="padding:14px 16px;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                ${f.score != null ? `<span class="badge badge-${scoreBadgeClass(f.score)}" style="font-size:1rem;padding:4px 10px;">${f.score}</span>` : ''}
                ${sourceBadge(f.source)}
                <span style="font-size:0.85rem;font-weight:500;">${escHtml(f.from_name || 'Anonymous')}</span>
                ${f.from_role ? `<span class="text-muted" style="font-size:0.82rem;">· ${escHtml(f.from_role)}</span>` : ''}
                ${f.date ? `<span class="text-muted" style="font-size:0.8rem;margin-left:auto;">${formatDate(f.date)}</span>` : ''}
              </div>
              <p style="margin:0;font-size:0.92rem;line-height:1.55;">${escHtml(f.text || f.body || '—')}</p>
            </div>
          `).join('')}
        </div>`
    }
  `;
}

function scoreBadgeClass(score) {
  if (score >= 8) return 'success';
  if (score >= 5) return 'warning';
  return 'danger';
}

// ---------------------------------------------------------------------------
// Modal: Add / Edit Member
// ---------------------------------------------------------------------------

function openAddMemberModal(member, onSuccess) {
  const isEdit = !!member;
  const title = isEdit ? `Edit Member — ${escHtml(member.name)}` : 'Add Team Member';

  const tzOptions = TIMEZONES.map(tz =>
    `<option value="${tz}" ${member?.timezone === tz ? 'selected' : ''}>${tz}</option>`
  ).join('');

  openModal({
    title,
    size: 'md',
    body: `
      <form id="member-form" novalidate>
        <input type="hidden" name="id" value="${member?.id ?? ''}">

        <div class="form-group">
          <label class="form-label">Name <span style="color:red">*</span></label>
          <input class="form-input" name="name" type="text" required placeholder="Full name"
                 value="${escHtml(member?.name ?? '')}">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Role</label>
            <input class="form-input" name="role" type="text" placeholder="e.g. Senior Engineer"
                   value="${escHtml(member?.role ?? '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" name="status">
              <option value="active"    ${(member?.status ?? 'active') === 'active'    ? 'selected' : ''}>Active</option>
              <option value="on-leave"  ${member?.status === 'on-leave'  ? 'selected' : ''}>On Leave</option>
              <option value="pip"       ${member?.status === 'pip'       ? 'selected' : ''}>PIP</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" name="email" type="email" placeholder="name@example.com"
                   value="${escHtml(member?.email ?? '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input class="form-input" name="start_date" type="date"
                   value="${member?.start_date ? member.start_date.slice(0, 10) : ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Timezone</label>
          <select class="form-select" name="timezone">
            <option value="">— Select timezone —</option>
            ${tzOptions}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-input" name="notes" rows="3"
                    placeholder="Any additional context…">${escHtml(member?.notes ?? '')}</textarea>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-outline" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="save-member-btn">${isEdit ? 'Save Changes' : 'Add Member'}</button>
    `,
    onOpen(modalEl) {
      modalEl.querySelector('#save-member-btn').addEventListener('click', async () => {
        const form = modalEl.querySelector('#member-form');
        const data = Object.fromEntries(new FormData(form));

        if (!data.name.trim()) {
          toast('Name is required.', 'error');
          form.querySelector('[name="name"]').focus();
          return;
        }

        const btn = modalEl.querySelector('#save-member-btn');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        try {
          if (isEdit) {
            await API.updateMember(member.id, data);
            toast('Member updated.', 'success');
          } else {
            await API.createMember(data);
            toast('Member added.', 'success');
          }
          closeModal();
          await onSuccess();
        } catch (err) {
          toast(`Failed to save: ${err.message || err}`, 'error');
          btn.disabled = false;
          btn.textContent = isEdit ? 'Save Changes' : 'Add Member';
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Modal: Log 1:1
// ---------------------------------------------------------------------------

function openLogOneOnOneModal(memberId, onSuccess) {
  openModal({
    title: 'Log 1:1 Session',
    size: 'md',
    body: `
      <form id="oneonone-form" novalidate>
        <input type="hidden" name="member_id" value="${memberId}">

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-input" name="date" type="date" value="${todayStr()}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Sentiment</label>
            <select class="form-select" name="sentiment">
              <option value="positive">😊 Positive</option>
              <option value="neutral" selected>😐 Neutral</option>
              <option value="concerning">😟 Concerning</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Topics <span class="text-muted" style="font-size:0.82rem;">(comma-separated)</span></label>
          <textarea class="form-input" name="topics" rows="2"
                    placeholder="e.g. career goals, project blockers, team dynamics"></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Raw Notes</label>
          <textarea class="form-input" name="raw_notes" rows="4"
                    placeholder="Unfiltered notes from the session…"></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Summary</label>
          <textarea class="form-input" name="summary" rows="3"
                    placeholder="Key takeaways and action items…"></textarea>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-outline" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="save-oneonone-btn">Log 1:1</button>
    `,
    onOpen(modalEl) {
      modalEl.querySelector('#save-oneonone-btn').addEventListener('click', async () => {
        const form = modalEl.querySelector('#oneonone-form');
        const data = Object.fromEntries(new FormData(form));

        if (!data.date) {
          toast('Date is required.', 'error');
          return;
        }

        const btn = modalEl.querySelector('#save-oneonone-btn');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        try {
          await API.createOneOnOne(data);
          toast('1:1 logged.', 'success');
          closeModal();
          await onSuccess();
        } catch (err) {
          toast(`Failed to save: ${err.message || err}`, 'error');
          btn.disabled = false;
          btn.textContent = 'Log 1:1';
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Modal: Add Achievement
// ---------------------------------------------------------------------------

function openAddAchievementModal(memberId, onSuccess) {
  openModal({
    title: 'Add Achievement',
    size: 'md',
    body: `
      <form id="achievement-form" novalidate>
        <input type="hidden" name="member_id" value="${memberId}">

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-input" name="date" type="date" value="${todayStr()}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Impact Level</label>
            <select class="form-select" name="impact_level">
              <option value="low">🔵 Low</option>
              <option value="medium" selected>🟡 Medium</option>
              <option value="high">🟢 High</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quarter</label>
            <input class="form-input" name="quarter" type="text"
                   placeholder="e.g. Q2 2026" value="${currentQuarter()}">
          </div>
          <div class="form-group">
            <label class="form-label">Tags <span class="text-muted" style="font-size:0.82rem;">(comma-separated)</span></label>
            <input class="form-input" name="tags" type="text"
                   placeholder="e.g. reliability, shipping, mentorship">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Description <span style="color:red">*</span></label>
          <textarea class="form-input" name="description" rows="4" required
                    placeholder="Describe the achievement and its impact…"></textarea>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-outline" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="save-achievement-btn">Add Achievement</button>
    `,
    onOpen(modalEl) {
      modalEl.querySelector('#save-achievement-btn').addEventListener('click', async () => {
        const form = modalEl.querySelector('#achievement-form');
        const data = Object.fromEntries(new FormData(form));

        if (!data.description?.trim()) {
          toast('Description is required.', 'error');
          form.querySelector('[name="description"]').focus();
          return;
        }

        const btn = modalEl.querySelector('#save-achievement-btn');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        try {
          await API.createAchievement(data);
          toast('Achievement added.', 'success');
          closeModal();
          await onSuccess();
        } catch (err) {
          toast(`Failed to save: ${err.message || err}`, 'error');
          btn.disabled = false;
          btn.textContent = 'Add Achievement';
        }
      });
    }
  });
}
