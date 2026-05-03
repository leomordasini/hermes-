/* ══════════════════════════════════════════════
   1:1 Meetings Module
   Track 1-on-1 meetings with direct reports
   ══════════════════════════════════════════════ */

import { registerModule, db, openModal, closeModal, toast, confirm, escHtml, avatarHtml, formatDate, formatRelative } from '../app.js';

const STORE = 'one_on_ones';
const MEMBERS_STORE = 'team_members';

const MOODS = [
  { value: 'happy', emoji: '😀', label: 'Happy' },
  { value: 'neutral', emoji: '😐', label: 'Neutral' },
  { value: 'unhappy', emoji: '😟', label: 'Unhappy' },
];

/* ── State ── */
let filterMemberId = '';
let expandedId = null;

/* ── Helpers ── */
function moodEmoji(mood) {
  const m = MOODS.find(x => x.value === mood);
  return m ? m.emoji : '😐';
}

function moodScore(mood) {
  if (mood === 'happy') return 3;
  if (mood === 'neutral') return 2;
  if (mood === 'unhappy') return 1;
  return 2;
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

/* ── Stats Bar ── */
function renderStats(meetings) {
  const thisMonth = meetings.filter(m => isThisMonth(m.date));
  const totalThisMonth = thisMonth.length;
  const totalAll = meetings.length;

  let avgMoodLabel = '—';
  if (thisMonth.length > 0) {
    const avg = thisMonth.reduce((sum, m) => sum + moodScore(m.mood), 0) / thisMonth.length;
    if (avg >= 2.5) avgMoodLabel = '😀 Positive';
    else if (avg >= 1.5) avgMoodLabel = '😐 Neutral';
    else avgMoodLabel = '😟 Needs attention';
  }

  return `
    <div class="stats-row" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.8rem; font-weight: 700; color: var(--purple)">${totalThisMonth}</div>
        <div style="font-size: 0.82rem; color: var(--text-secondary);">1:1s This Month</div>
      </div>
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.8rem; font-weight: 700;">${avgMoodLabel}</div>
        <div style="font-size: 0.82rem; color: var(--text-secondary);">Avg Mood (This Month)</div>
      </div>
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.8rem; font-weight: 700; color: var(--purple)">${totalAll}</div>
        <div style="font-size: 0.82rem; color: var(--text-secondary);">Total Meetings</div>
      </div>
    </div>`;
}

/* ── Meeting Card ── */
function renderMeetingCard(meeting) {
  const isExpanded = expandedId === meeting.id;
  const moodDisplay = moodEmoji(meeting.mood);

  return `
    <div class="card" style="margin-bottom: 0.75rem; cursor: pointer; transition: box-shadow 0.15s;" data-meeting-id="${meeting.id}">
      <div class="meeting-header" data-toggle-id="${meeting.id}" style="display: flex; align-items: center; gap: 0.75rem; padding: 1rem;">
        ${avatarHtml(meeting.memberName || 'Unknown')}
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.95rem;">${escHtml(meeting.memberName || 'Unknown')}</div>
          <div style="font-size: 0.82rem; color: var(--text-secondary);">${formatDate(meeting.date)} · ${formatRelative(meeting.date)}</div>
        </div>
        <div style="font-size: 1.5rem; margin-right: 0.5rem;" title="${escHtml(meeting.mood || 'neutral')}">${moodDisplay}</div>
        <div style="display: flex; gap: 0.25rem;">
          <button class="btn btn-ghost btn-icon btn-edit-meeting" data-id="${meeting.id}" title="Edit">✏️</button>
          <button class="btn btn-ghost btn-icon btn-delete-meeting" data-id="${meeting.id}" title="Delete">🗑️</button>
        </div>
        <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.25rem;">${isExpanded ? '▲' : '▼'}</span>
      </div>
      ${isExpanded ? `
        <div style="border-top: 1px solid var(--border); padding: 1rem; animation: fadeIn 0.15s ease;">
          ${meeting.topics ? `
            <div style="margin-bottom: 0.75rem;">
              <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.25rem;">📋 Topics</div>
              <div style="white-space: pre-wrap; font-size: 0.9rem;">${escHtml(meeting.topics)}</div>
            </div>` : ''}
          ${meeting.notes ? `
            <div style="margin-bottom: 0.75rem;">
              <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.25rem;">📝 Notes</div>
              <div style="white-space: pre-wrap; font-size: 0.9rem;">${escHtml(meeting.notes)}</div>
            </div>` : ''}
          ${meeting.actionItems ? `
            <div style="margin-bottom: 0.75rem;">
              <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.25rem;">✅ Action Items</div>
              <div style="white-space: pre-wrap; font-size: 0.9rem;">${escHtml(meeting.actionItems)}</div>
            </div>` : ''}
          ${meeting.followUp ? `
            <div style="margin-bottom: 0;">
              <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.25rem;">🔄 Follow Up</div>
              <div style="white-space: pre-wrap; font-size: 0.9rem;">${escHtml(meeting.followUp)}</div>
            </div>` : ''}
          ${!meeting.topics && !meeting.notes && !meeting.actionItems && !meeting.followUp ? `
            <div style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem;">No details recorded.</div>` : ''}
        </div>` : ''}
    </div>`;
}

/* ── Add/Edit Modal ── */
async function openMeetingModal(existingMeeting) {
  const members = await db.getAll(MEMBERS_STORE, { sortBy: 'name', sortDir: 'asc' });
  const isEdit = !!existingMeeting;
  const m = existingMeeting || {};

  const memberOptions = members.map(mem =>
    `<option value="${mem.id}" ${m.memberId === mem.id ? 'selected' : ''}>${escHtml(mem.name)}</option>`
  ).join('');

  const today = new Date().toISOString().slice(0, 10);

  const body = `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Team Member *</label>
        <select id="modal-member" class="input" style="width: 100%;" required>
          <option value="">Select a team member…</option>
          ${memberOptions}
        </select>
      </div>
      <div>
        <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Date *</label>
        <input id="modal-date" type="date" class="input" style="width: 100%;" value="${m.date || today}" required />
      </div>
      <div>
        <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Mood</label>
        <div id="modal-mood" style="display: flex; gap: 0.5rem;">
          ${MOODS.map(mood => `
            <button type="button" class="btn mood-btn ${(m.mood || 'neutral') === mood.value ? 'mood-active' : ''}"
              data-mood="${mood.value}"
              style="font-size: 1.5rem; padding: 0.5rem 1rem; border-radius: 8px; border: 2px solid ${(m.mood || 'neutral') === mood.value ? 'var(--purple)' : 'var(--border)'}; background: ${(m.mood || 'neutral') === mood.value ? 'var(--purple-bg, rgba(99,44,166,0.12))' : 'transparent'}; cursor: pointer; transition: all 0.15s;">
              ${mood.emoji}
            </button>`).join('')}
        </div>
      </div>
      <div>
        <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Topics</label>
        <textarea id="modal-topics" class="input" rows="3" style="width: 100%; resize: vertical;" placeholder="What was discussed?">${escHtml(m.topics || '')}</textarea>
      </div>
      <div>
        <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Notes</label>
        <textarea id="modal-notes" class="input" rows="4" style="width: 100%; resize: vertical;" placeholder="Key takeaways, observations…">${escHtml(m.notes || '')}</textarea>
      </div>
      <div>
        <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Action Items</label>
        <textarea id="modal-action-items" class="input" rows="3" style="width: 100%; resize: vertical;" placeholder="Next steps, tasks to follow up on…">${escHtml(m.actionItems || '')}</textarea>
      </div>
      <div>
        <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Follow Up</label>
        <textarea id="modal-follow-up" class="input" rows="2" style="width: 100%; resize: vertical;" placeholder="Anything to revisit next time…">${escHtml(m.followUp || '')}</textarea>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">${isEdit ? 'Update' : 'Add'} 1:1</button>`;

  openModal(isEdit ? 'Edit 1:1 Meeting' : 'New 1:1 Meeting', body, footer);

  // Mood button toggling
  let selectedMood = m.mood || 'neutral';
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMood = btn.dataset.mood;
      document.querySelectorAll('.mood-btn').forEach(b => {
        const isActive = b.dataset.mood === selectedMood;
        b.style.border = `2px solid ${isActive ? 'var(--purple)' : 'var(--border)'}`;
        b.style.background = isActive ? 'rgba(99,44,166,0.12)' : 'transparent';
        b.classList.toggle('mood-active', isActive);
      });
    });
  });

  // Cancel
  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  // Save
  document.getElementById('modal-save').addEventListener('click', async () => {
    const memberId = document.getElementById('modal-member').value;
    const date = document.getElementById('modal-date').value;

    if (!memberId) { toast('Please select a team member', 'warning'); return; }
    if (!date) { toast('Please select a date', 'warning'); return; }

    // Look up member name
    const member = await db.get(MEMBERS_STORE, memberId);
    const memberName = member ? member.name : 'Unknown';

    const record = {
      memberId,
      memberName,
      date,
      mood: selectedMood,
      topics: document.getElementById('modal-topics').value.trim(),
      notes: document.getElementById('modal-notes').value.trim(),
      actionItems: document.getElementById('modal-action-items').value.trim(),
      followUp: document.getElementById('modal-follow-up').value.trim(),
    };

    try {
      if (isEdit) {
        record.id = existingMeeting.id;
        await db.update(STORE, record);
        toast('1:1 updated', 'success');
      } else {
        await db.add(STORE, record);
        toast('1:1 added', 'success');
      }
      closeModal();
      // Re-render
      const container = document.getElementById('app-content');
      if (container) renderOneOnOnes(container);
    } catch (err) {
      console.error('Failed to save 1:1:', err);
      toast('Failed to save: ' + err.message, 'error');
    }
  });
}

/* ── Main Render ── */
async function renderOneOnOnes(container) {
  const [meetings, members] = await Promise.all([
    db.getAll(STORE, { sortBy: 'date', sortDir: 'desc' }),
    db.getAll(MEMBERS_STORE, { sortBy: 'name', sortDir: 'asc' }),
  ]);

  // Apply filter
  const filtered = filterMemberId
    ? meetings.filter(m => m.memberId === filterMemberId)
    : meetings;

  // Member filter dropdown
  const memberOptions = members.map(mem =>
    `<option value="${mem.id}" ${filterMemberId === mem.id ? 'selected' : ''}>${escHtml(mem.name)}</option>`
  ).join('');

  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto; padding: 1.5rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 700; margin: 0;">🤝 1:1 Meetings</h1>
          <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.25rem 0 0;">Track meetings and conversations with your direct reports</p>
        </div>
        <button class="btn btn-primary" id="btn-add-meeting">+ New 1:1</button>
      </div>

      ${renderStats(meetings)}

      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap;">
        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Filter by:</label>
        <select id="filter-member" class="input" style="min-width: 200px;">
          <option value="">All Members</option>
          ${memberOptions}
        </select>
      </div>

      <div id="meetings-list">
        ${filtered.length === 0
          ? `<div class="empty-state" style="text-align: center; padding: 3rem 1rem;">
               <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🤝</div>
               <h3 style="margin: 0 0 0.25rem;">No 1:1 meetings yet</h3>
               <p style="color: var(--text-secondary); font-size: 0.9rem;">Click <strong>+ New 1:1</strong> to log your first meeting.</p>
             </div>`
          : filtered.map(m => renderMeetingCard(m)).join('')
        }
      </div>
    </div>`;

  // ── Event Listeners ──

  // Add button
  document.getElementById('btn-add-meeting').addEventListener('click', () => openMeetingModal(null));

  // Filter dropdown
  document.getElementById('filter-member').addEventListener('change', (e) => {
    filterMemberId = e.target.value;
    renderOneOnOnes(container);
  });

  // Toggle expand / edit / delete on cards
  container.querySelectorAll('[data-toggle-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      // Don't toggle if clicking edit/delete buttons
      if (e.target.closest('.btn-edit-meeting') || e.target.closest('.btn-delete-meeting')) return;

      const id = el.dataset.toggleId;
      expandedId = expandedId === id ? null : id;
      renderOneOnOnes(container);
    });
  });

  container.querySelectorAll('.btn-edit-meeting').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const meeting = await db.get(STORE, btn.dataset.id);
      if (meeting) openMeetingModal(meeting);
    });
  });

  container.querySelectorAll('.btn-delete-meeting').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirm('Delete this 1:1 meeting? This action cannot be undone.');
      if (!ok) return;
      try {
        await db.delete(STORE, btn.dataset.id);
        toast('1:1 deleted', 'success');
        if (expandedId === btn.dataset.id) expandedId = null;
        renderOneOnOnes(container);
      } catch (err) {
        toast('Failed to delete: ' + err.message, 'error');
      }
    });
  });
}

/* ── Register Module ── */
registerModule({
  id: 'one-on-ones',
  label: '1:1 Meetings',
  icon: '🤝',
  section: 'people',
  order: 11,
  render: renderOneOnOnes
});
