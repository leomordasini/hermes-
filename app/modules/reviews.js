/* ══════════════════════════════════════════════
   Performance Reviews Module
   Track review cycles, ratings, and feedback
   ══════════════════════════════════════════════ */

import { registerModule, db, openModal, closeModal, toast, confirm, escHtml, avatarHtml, formatDate, statusBadge } from '../app.js';

const STORE = 'reviews';
const STORE_MEMBERS = 'team_members';

/* ── Constants ── */
const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'delivered', label: 'Delivered' },
];

const RATING_OPTIONS = [
  { value: '5', label: '5 — Exceptional' },
  { value: '4', label: '4 — Exceeds Expectations' },
  { value: '3', label: '3 — Meets Expectations' },
  { value: '2', label: '2 — Needs Improvement' },
  { value: '1', label: '1 — Does Not Meet' },
  { value: 'exceeds', label: 'Exceeds' },
  { value: 'meets', label: 'Meets' },
  { value: 'needs_improvement', label: 'Needs Improvement' },
];

/* ── State ── */
let filterCycle = '';
let filterStatus = '';
let detailReviewId = null;

/* ── Helpers ── */
function generateCycleOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const cycles = [];
  for (let y = year - 1; y <= year + 1; y++) {
    cycles.push(`H1 ${y}`);
    cycles.push(`H2 ${y}`);
  }
  return cycles;
}

function ratingBadge(rating) {
  if (!rating) return '<span class="text-muted">—</span>';
  const numRating = Number(rating);
  if (!isNaN(numRating)) {
    const colorMap = { 5: 'success', 4: 'info', 3: 'warning', 2: 'orange', 1: 'danger' };
    const labelMap = { 5: 'Exceptional', 4: 'Exceeds', 3: 'Meets', 2: 'Needs Improvement', 1: 'Does Not Meet' };
    const color = colorMap[numRating] || 'neutral';
    return `<span class="badge badge-${color}" title="${labelMap[numRating] || ''}">${'★'.repeat(numRating)}${'☆'.repeat(5 - numRating)}</span>`;
  }
  const textMap = {
    exceeds: { color: 'success', label: 'Exceeds' },
    meets: { color: 'info', label: 'Meets' },
    needs_improvement: { color: 'warning', label: 'Needs Improvement' },
  };
  const info = textMap[rating] || { color: 'neutral', label: rating };
  return `<span class="badge badge-${info.color}">${escHtml(info.label)}</span>`;
}

function getCurrentCycle() {
  const now = new Date();
  const half = now.getMonth() < 6 ? 'H1' : 'H2';
  return `${half} ${now.getFullYear()}`;
}

/* ── Main Render ── */
async function renderReviews(container) {
  detailReviewId = null;
  container.innerHTML = '<div class="reviews-module" id="reviews-root"></div>';
  await renderList();
}

async function renderList() {
  const root = document.getElementById('reviews-root');
  if (!root) return;

  const reviews = await db.getAll(STORE, { sortBy: 'updatedAt', sortDir: 'desc' });
  const members = await db.getAll(STORE_MEMBERS, { sortBy: 'name', sortDir: 'asc' });

  // Apply filters
  const filtered = reviews.filter(r => {
    if (filterCycle && r.cycle !== filterCycle) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  // Get unique cycles from data
  const allCycles = [...new Set(reviews.map(r => r.cycle).filter(Boolean))];
  const cycleOptions = [...new Set([...generateCycleOptions(), ...allCycles])].sort();

  const stats = buildStats(reviews);

  // Group filtered reviews by cycle
  const byCycle = {};
  for (const r of filtered) {
    const cycle = r.cycle || 'Uncategorized';
    if (!byCycle[cycle]) byCycle[cycle] = [];
    byCycle[cycle].push(r);
  }

  // Sort cycles in reverse chronological order
  const sortedCycles = Object.keys(byCycle).sort((a, b) => {
    // Parse H1/H2 YYYY for ordering
    const parse = (c) => {
      const m = c.match(/(H[12])\s*(\d{4})/);
      if (!m) return 0;
      return parseInt(m[2]) * 10 + (m[1] === 'H2' ? 1 : 0);
    };
    return parse(b) - parse(a);
  });

  root.innerHTML = `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>📝 Performance Reviews</h1>
        <div class="page-subtitle">${reviews.length} review${reviews.length !== 1 ? 's' : ''} across ${allCycles.length} cycle${allCycles.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="review-add-btn">+ New Review</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="margin-bottom: 20px;">
      <div class="stat-card">
        <div class="stat-icon purple">📝</div>
        <div class="stat-info">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Reviews</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">📤</div>
        <div class="stat-info">
          <div class="stat-value" style="color: var(--blue, #4fc3f7)">${stats.submittedPct}%</div>
          <div class="stat-label">Submitted</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✓</div>
        <div class="stat-info">
          <div class="stat-value" style="color: var(--green, #66bb6a)">${stats.deliveredPct}%</div>
          <div class="stat-label">Delivered</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon yellow">⏳</div>
        <div class="stat-info">
          <div class="stat-value">${stats.drafts}</div>
          <div class="stat-label">In Draft</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="card" style="margin-bottom: 20px; padding: 14px 20px;">
      <div class="flex gap-md" style="align-items: center; flex-wrap: wrap;">
        <div style="min-width: 160px;">
          <select class="form-select" id="review-cycle-filter">
            <option value="">All Cycles</option>
            ${cycleOptions.map(c =>
              `<option value="${escHtml(c)}" ${filterCycle === c ? 'selected' : ''}>${escHtml(c)}</option>`
            ).join('')}
          </select>
        </div>
        <div style="min-width: 160px;">
          <select class="form-select" id="review-status-filter">
            <option value="">All Statuses</option>
            ${STATUS_OPTIONS.map(s =>
              `<option value="${s.value}" ${filterStatus === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </select>
        </div>
        ${(filterCycle || filterStatus) ? `<button class="btn btn-ghost btn-sm" id="review-clear-filters">Clear</button>` : ''}
      </div>
    </div>

    <!-- Reviews by Cycle -->
    <div id="reviews-list">
      ${filtered.length === 0 ? renderEmptyState(reviews.length === 0) : sortedCycles.map(cycle => renderCycleGroup(cycle, byCycle[cycle])).join('')}
    </div>

    <!-- Detail panel placeholder -->
    <div id="review-detail-panel"></div>
  `;

  // ── Event Bindings ──
  document.getElementById('review-add-btn')?.addEventListener('click', () => openReviewModal());

  document.getElementById('review-cycle-filter')?.addEventListener('change', (e) => {
    filterCycle = e.target.value;
    renderList();
  });

  document.getElementById('review-status-filter')?.addEventListener('change', (e) => {
    filterStatus = e.target.value;
    renderList();
  });

  document.getElementById('review-clear-filters')?.addEventListener('click', () => {
    filterCycle = '';
    filterStatus = '';
    renderList();
  });

  // Row clicks → detail view
  document.querySelectorAll('.review-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.table-actions')) return;
      showReviewDetail(row.dataset.id);
    });
  });

  // Edit buttons
  document.querySelectorAll('.review-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openReviewModal(btn.dataset.id);
    });
  });

  // Delete buttons
  document.querySelectorAll('.review-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteReview(btn.dataset.id, btn.dataset.name);
    });
  });
}

/* ── Stats ── */
function buildStats(reviews) {
  const total = reviews.length;
  const submitted = reviews.filter(r => r.status === 'submitted' || r.status === 'delivered').length;
  const delivered = reviews.filter(r => r.status === 'delivered').length;
  const drafts = reviews.filter(r => r.status === 'draft').length;

  return {
    total,
    submittedPct: total ? Math.round((submitted / total) * 100) : 0,
    deliveredPct: total ? Math.round((delivered / total) * 100) : 0,
    drafts,
  };
}

/* ── Render Cycle Group ── */
function renderCycleGroup(cycle, reviews) {
  const submitted = reviews.filter(r => r.status === 'submitted' || r.status === 'delivered').length;
  const delivered = reviews.filter(r => r.status === 'delivered').length;

  return `
    <div class="card" style="margin-bottom: 16px; padding: 0; overflow-x: auto;">
      <div style="padding: 14px 20px; border-bottom: 1px solid var(--border, #e0e0e0); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="font-size: 1rem; font-weight: 700; margin: 0;">${escHtml(cycle)}</h3>
          <span class="text-xs text-muted">${reviews.length} review${reviews.length !== 1 ? 's' : ''} · ${submitted} submitted · ${delivered} delivered</span>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 40px;"></th>
            <th>Team Member</th>
            <th>Status</th>
            <th>Rating</th>
            <th>Updated</th>
            <th style="width: 100px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${reviews.map(r => `
            <tr class="review-row" data-id="${r.id}" style="cursor: pointer;">
              <td>${avatarHtml(r.memberName || 'Unknown')}</td>
              <td>
                <div class="fw-600">${escHtml(r.memberName || 'Unknown')}</div>
              </td>
              <td>${statusBadge(r.status || 'not_started')}</td>
              <td>${ratingBadge(r.rating)}</td>
              <td>${formatDate(r.updatedAt)}</td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-ghost btn-sm btn-icon review-edit-btn" data-id="${r.id}" title="Edit">✏️</button>
                  <button class="btn btn-ghost btn-sm btn-icon review-delete-btn" data-id="${r.id}" data-name="${escHtml(r.memberName || 'this review')}" title="Delete">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ── Empty State ── */
function renderEmptyState(isNew) {
  if (isNew) {
    return `
      <div class="card">
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h3>No performance reviews yet</h3>
          <p>Create your first performance review to start tracking team feedback and growth.</p>
          <button class="btn btn-primary" onclick="document.getElementById('review-add-btn').click()">+ New Review</button>
        </div>
      </div>`;
  }
  return `
    <div class="card">
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>No reviews match your filters</h3>
        <p>Try adjusting your cycle or status filters.</p>
      </div>
    </div>`;
}

/* ── Add / Edit Modal ── */
async function openReviewModal(reviewId) {
  let review = null;
  if (reviewId) {
    review = await db.get(STORE, reviewId);
  }

  const isEdit = !!review;
  const title = isEdit ? `Edit Review — ${review.memberName}` : 'New Performance Review';

  const members = await db.getAll(STORE_MEMBERS, { sortBy: 'name', sortDir: 'asc' });
  const cycles = generateCycleOptions();
  const currentCycle = getCurrentCycle();

  const body = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Team Member *</label>
        <select class="form-select" id="review-memberId" ${isEdit ? 'disabled' : ''}>
          <option value="">Select a team member…</option>
          ${members.map(m =>
            `<option value="${m.id}" ${review?.memberId === m.id ? 'selected' : ''}>${escHtml(m.name)}</option>`
          ).join('')}
        </select>
        ${isEdit ? `<input type="hidden" id="review-memberId-hidden" value="${escHtml(review.memberId)}" />` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Review Cycle *</label>
        <select class="form-select" id="review-cycle">
          <option value="">Select cycle…</option>
          ${cycles.map(c =>
            `<option value="${escHtml(c)}" ${(review?.cycle || currentCycle) === c ? 'selected' : ''}>${escHtml(c)}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="review-status">
          ${STATUS_OPTIONS.map(s =>
            `<option value="${s.value}" ${(review?.status || 'not_started') === s.value ? 'selected' : ''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Rating</label>
        <select class="form-select" id="review-rating">
          <option value="">No rating yet</option>
          ${RATING_OPTIONS.map(r =>
            `<option value="${r.value}" ${review?.rating === r.value ? 'selected' : ''}>${r.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Strengths</label>
      <textarea class="form-textarea" id="review-strengths" rows="3"
        placeholder="Key strengths demonstrated during this period…">${escHtml(review?.strengths || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Areas for Growth</label>
      <textarea class="form-textarea" id="review-areasForGrowth" rows="3"
        placeholder="Areas where improvement is needed…">${escHtml(review?.areasForGrowth || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Goals</label>
      <textarea class="form-textarea" id="review-goals" rows="3"
        placeholder="Goals for the next review period…">${escHtml(review?.goals || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="review-notes" rows="3"
        placeholder="Additional private notes…">${escHtml(review?.notes || '')}</textarea>
    </div>
  `;

  const footer = `
    <button class="btn btn-ghost" id="review-modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="review-modal-save">${isEdit ? 'Save Changes' : 'Create Review'}</button>
  `;

  openModal(title, body, footer);

  document.getElementById('review-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('review-modal-save').addEventListener('click', () => saveReview(reviewId));
}

async function saveReview(existingId) {
  const memberIdEl = document.getElementById('review-memberId');
  const memberIdHidden = document.getElementById('review-memberId-hidden');
  const memberId = (memberIdEl?.disabled ? memberIdHidden?.value : memberIdEl?.value) || '';
  const cycle = document.getElementById('review-cycle')?.value || '';
  const status = document.getElementById('review-status')?.value || 'not_started';
  const rating = document.getElementById('review-rating')?.value || '';
  const strengths = document.getElementById('review-strengths')?.value.trim() || '';
  const areasForGrowth = document.getElementById('review-areasForGrowth')?.value.trim() || '';
  const goals = document.getElementById('review-goals')?.value.trim() || '';
  const notes = document.getElementById('review-notes')?.value.trim() || '';

  if (!memberId) {
    toast('Please select a team member', 'error');
    document.getElementById('review-memberId')?.focus();
    return;
  }

  if (!cycle) {
    toast('Please select a review cycle', 'error');
    document.getElementById('review-cycle')?.focus();
    return;
  }

  // Look up memberName from team_members store
  let memberName = 'Unknown';
  try {
    const member = await db.get(STORE_MEMBERS, memberId);
    if (member) {
      memberName = member.name;
    }
  } catch (e) {
    console.warn('Could not look up member name:', e);
  }

  const record = { memberId, memberName, cycle, status, rating, strengths, areasForGrowth, goals, notes };

  try {
    if (existingId) {
      record.id = existingId;
      await db.update(STORE, record);
      toast(`Review for ${memberName} updated`, 'success');
    } else {
      await db.add(STORE, record);
      toast(`Review for ${memberName} created`, 'success');
    }
    closeModal();
    await renderList();

    // If detail panel was open for this review, refresh it
    if (detailReviewId === existingId) {
      showReviewDetail(existingId);
    }
  } catch (err) {
    console.error('Save review error:', err);
    toast('Failed to save: ' + err.message, 'error');
  }
}

/* ── Delete ── */
async function deleteReview(id, name) {
  const ok = await confirm(`Delete the review for "${name}"? This action cannot be undone.`);
  if (!ok) return;

  try {
    await db.delete(STORE, id);
    toast('Review deleted', 'success');

    if (detailReviewId === id) {
      detailReviewId = null;
    }

    await renderList();
  } catch (err) {
    console.error('Delete review error:', err);
    toast('Failed to delete: ' + err.message, 'error');
  }
}

/* ── Review Detail View ── */
async function showReviewDetail(reviewId) {
  detailReviewId = reviewId;
  const panel = document.getElementById('review-detail-panel');
  if (!panel) return;

  const review = await db.get(STORE, reviewId);
  if (!review) {
    panel.innerHTML = '';
    return;
  }

  const sections = [
    { label: 'Strengths', field: 'strengths', icon: '💪' },
    { label: 'Areas for Growth', field: 'areasForGrowth', icon: '🌱' },
    { label: 'Goals', field: 'goals', icon: '🎯' },
    { label: 'Notes', field: 'notes', icon: '📌' },
  ];

  panel.innerHTML = `
    <div class="card" style="margin-top: 20px; position: relative;">
      <button class="btn btn-ghost btn-icon" id="detail-close"
        style="position: absolute; top: 12px; right: 12px;" title="Close">✕</button>

      <!-- Profile Header -->
      <div class="flex gap-lg" style="align-items: flex-start; margin-bottom: 20px;">
        ${avatarHtml(review.memberName || 'Unknown', 'lg')}
        <div style="flex: 1;">
          <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: 4px;">${escHtml(review.memberName || 'Unknown')}</h2>
          <div class="text-muted" style="margin-bottom: 6px;">${escHtml(review.cycle)} Performance Review</div>
          <div class="flex gap-sm" style="flex-wrap: wrap; align-items: center;">
            ${statusBadge(review.status || 'not_started')}
            ${ratingBadge(review.rating)}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm detail-edit-btn" data-id="${review.id}">✏️ Edit</button>
        </div>
      </div>

      <!-- Info Grid -->
      <div class="grid-3" style="margin-bottom: 20px;">
        <div>
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Cycle</div>
          <div style="font-size: 0.88rem;">${escHtml(review.cycle)}</div>
        </div>
        <div>
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Status</div>
          <div style="font-size: 0.88rem;">${statusBadge(review.status || 'not_started')}</div>
        </div>
        <div>
          <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Rating</div>
          <div style="font-size: 0.88rem;">${ratingBadge(review.rating)}</div>
        </div>
      </div>

      <hr class="section-divider" />

      <!-- Content Sections -->
      ${sections.map(s => {
        const content = review[s.field];
        if (!content) return '';
        return `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
              ${s.icon} ${s.label}
            </div>
            <div style="font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; color: var(--text-primary);">${escHtml(content)}</div>
          </div>
        `;
      }).join('')}

      ${!review.strengths && !review.areasForGrowth && !review.goals && !review.notes ? `
        <div class="empty-state" style="padding: 30px 0;">
          <div class="empty-icon">📝</div>
          <p class="text-muted">No content yet. Edit this review to add strengths, areas for growth, goals, or notes.</p>
        </div>
      ` : ''}

      <!-- Metadata Footer -->
      <hr class="section-divider" />
      <div class="flex gap-lg text-xs text-muted">
        <span>Created: ${formatDate(review.createdAt)}</span>
        <span>Updated: ${formatDate(review.updatedAt)}</span>
      </div>
    </div>
  `;

  // Event bindings
  document.getElementById('detail-close')?.addEventListener('click', () => {
    detailReviewId = null;
    panel.innerHTML = '';
  });

  panel.querySelector('.detail-edit-btn')?.addEventListener('click', () => {
    openReviewModal(review.id);
  });

  // Scroll into view
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Register Module ── */
registerModule({
  id: 'reviews',
  label: 'Reviews',
  icon: '📝',
  section: 'people',
  order: 12,
  render: renderReviews
});
