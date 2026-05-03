/* ══════════════════════════════════════════════
   Notes Module
   General-purpose note-taking area with categories, tags, and pinning
   ══════════════════════════════════════════════ */

import { registerModule, db, openModal, closeModal, toast, confirm, escHtml, formatDate, formatRelative } from '../app.js';

const STORE = 'notes';

/* ── State ── */
let filterCategory = '';
let searchQuery = '';
let expandedNoteId = null;

/* ── Constants ── */
const CATEGORIES = [
  { value: 'meeting', label: 'Meeting', badge: 'info', icon: '📋' },
  { value: 'decision', label: 'Decision', badge: 'warning', icon: '⚖️' },
  { value: 'idea', label: 'Idea', badge: 'purple', icon: '💡' },
  { value: 'reference', label: 'Reference', badge: 'neutral', icon: '📌' },
  { value: 'feedback', label: 'Feedback', badge: 'success', icon: '💬' }
];

/* ── Helpers ── */
function categoryBadge(cat) {
  const c = CATEGORIES.find(c => c.value === cat);
  if (!c) return `<span class="badge badge-neutral">${escHtml(cat || 'uncategorized')}</span>`;
  return `<span class="badge badge-${c.badge}">${c.icon} ${c.label}</span>`;
}

function truncate(text, maxLen = 150) {
  if (!text) return '';
  const clean = text.replace(/\n+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trimEnd() + '…';
}

function renderContent(text) {
  if (!text) return '';
  // Simple markdown-like rendering
  let html = escHtml(text);
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code: `text`
  html = html.replace(/`(.+?)`/g, '<code style="background: var(--bg-secondary, #2a2a3e); padding: 0.15rem 0.35rem; border-radius: 3px; font-size: 0.85em;">$1</code>');
  // Headers: ### text
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size: 1.05rem; display: block; margin: 0.5rem 0 0.25rem;">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size: 1.1rem; display: block; margin: 0.5rem 0 0.25rem;">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size: 1.15rem; display: block; margin: 0.5rem 0 0.25rem;">$1</strong>');
  // Lists: - item
  html = html.replace(/^- (.+)$/gm, '<span style="display: block; padding-left: 1rem;">• $1</span>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

function parseTags(str) {
  if (!str) return [];
  return str.split(',').map(t => t.trim()).filter(Boolean);
}

function tagsToString(arr) {
  if (!arr || !Array.isArray(arr)) return '';
  return arr.join(', ');
}

/* ── Note Card ── */
function renderNoteCard(note) {
  const isExpanded = expandedNoteId === note.id;
  const preview = truncate(note.content);
  const tags = note.tags || [];

  return `
    <div class="card note-card" data-id="${note.id}" style="padding: 1.25rem; cursor: pointer; position: relative; transition: box-shadow 0.2s ease; ${note.pinned ? 'border-left: 3px solid var(--yellow, #ffd54f);' : ''}">
      ${note.pinned ? '<div style="position: absolute; top: 0.6rem; right: 0.6rem; font-size: 0.9rem;" title="Pinned">📌</div>' : ''}

      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
        <h3 style="margin: 0; font-size: 1rem; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: ${note.pinned ? '1.5rem' : '0'};">${escHtml(note.title || 'Untitled')}</h3>
      </div>

      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.65rem;">
        ${categoryBadge(note.category)}
        ${tags.map(t => `<span class="tag" style="font-size: 0.75rem; padding: 0.15rem 0.45rem; background: var(--bg-secondary, #2a2a3e); border-radius: 4px; color: var(--text-secondary);">#${escHtml(t)}</span>`).join('')}
      </div>

      <div class="note-content" style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; margin-bottom: 0.75rem; ${isExpanded ? '' : 'max-height: 4.5em; overflow: hidden;'}">
        ${isExpanded ? renderContent(note.content) : escHtml(preview)}
      </div>

      ${note.content && note.content.length > 150 ? `
        <button class="btn btn-ghost btn-expand" data-id="${note.id}" style="font-size: 0.8rem; padding: 0.15rem 0.4rem; margin-bottom: 0.5rem;">
          ${isExpanded ? '▲ Collapse' : '▼ Expand'}
        </button>
      ` : ''}

      <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border, #333); padding-top: 0.6rem; margin-top: 0.25rem;">
        <span style="font-size: 0.78rem; color: var(--text-secondary);">${formatRelative(note.updatedAt || note.createdAt)}</span>
        <div style="display: flex; gap: 0.25rem;">
          <button class="btn btn-ghost btn-icon btn-pin-note" data-id="${note.id}" title="${note.pinned ? 'Unpin' : 'Pin'}" style="font-size: 0.85rem;">${note.pinned ? '📌' : '📍'}</button>
          <button class="btn btn-ghost btn-icon btn-edit-note" data-id="${note.id}" title="Edit">✏️</button>
          <button class="btn btn-ghost btn-icon btn-delete-note" data-id="${note.id}" title="Delete">🗑️</button>
        </div>
      </div>
    </div>`;
}

/* ── Add/Edit Modal ── */
function openNoteModal(existing) {
  const isEdit = !!existing;
  const n = existing || {
    title: '',
    content: '',
    category: 'meeting',
    pinned: false,
    tags: []
  };

  const body = `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div class="form-group">
        <label class="form-label">Title *</label>
        <input id="modal-title" class="form-input" type="text" value="${escHtml(n.title)}" placeholder="Note title" required />
      </div>

      <div class="form-group">
        <label class="form-label">Content</label>
        <textarea id="modal-content" class="form-textarea" rows="8" placeholder="Write your note here... (supports **bold**, *italic*, \`code\`, # headings, - lists)">${escHtml(n.content)}</textarea>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="modal-category" class="form-select">
            ${CATEGORIES.map(c => `<option value="${c.value}" ${n.category === c.value ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tags</label>
          <input id="modal-tags" class="form-input" type="text" value="${escHtml(tagsToString(n.tags))}" placeholder="tag1, tag2, tag3" />
        </div>
      </div>

      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.9rem;">
          <input id="modal-pinned" type="checkbox" ${n.pinned ? 'checked' : ''} />
          📌 Pin this note to top
        </label>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">${isEdit ? 'Update Note' : 'Create Note'}</button>`;

  openModal(isEdit ? 'Edit Note' : 'New Note', body, footer);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('modal-save').addEventListener('click', async () => {
    const title = document.getElementById('modal-title').value.trim();
    if (!title) {
      toast('Title is required', 'warning');
      return;
    }

    const record = {
      title,
      content: document.getElementById('modal-content').value.trim(),
      category: document.getElementById('modal-category').value,
      pinned: document.getElementById('modal-pinned').checked,
      tags: parseTags(document.getElementById('modal-tags').value)
    };

    try {
      if (isEdit) {
        record.id = existing.id;
        record.createdAt = existing.createdAt;
        await db.update(STORE, record);
        toast('Note updated', 'success');
      } else {
        await db.add(STORE, record);
        toast('Note created', 'success');
      }
      closeModal();
      renderNotes(document.getElementById('app-content'));
    } catch (err) {
      console.error(err);
      toast('Error saving note: ' + err.message, 'error');
    }
  });
}

/* ── Delete Note ── */
async function deleteNote(id) {
  const ok = await confirm('Are you sure you want to delete this note?');
  if (!ok) return;

  try {
    await db.delete(STORE, id);
    toast('Note deleted', 'success');
    if (expandedNoteId === id) expandedNoteId = null;
    renderNotes(document.getElementById('app-content'));
  } catch (err) {
    console.error(err);
    toast('Error deleting note: ' + err.message, 'error');
  }
}

/* ── Toggle Pin ── */
async function togglePin(id) {
  try {
    const note = await db.get(STORE, id);
    if (!note) return;
    note.pinned = !note.pinned;
    await db.update(STORE, note);
    toast(note.pinned ? 'Note pinned' : 'Note unpinned', 'success');
    renderNotes(document.getElementById('app-content'));
  } catch (err) {
    console.error(err);
    toast('Error updating note: ' + err.message, 'error');
  }
}

/* ── Stats ── */
function renderStats(notes) {
  const total = notes.length;
  const pinned = notes.filter(n => n.pinned).length;
  const catCounts = {};
  for (const c of CATEGORIES) catCounts[c.value] = 0;
  for (const n of notes) {
    if (catCounts[n.category] !== undefined) catCounts[n.category]++;
  }

  // Find the most common category
  let topCat = '';
  let topCount = 0;
  for (const [cat, count] of Object.entries(catCounts)) {
    if (count > topCount) { topCat = cat; topCount = count; }
  }
  const topCatObj = CATEGORIES.find(c => c.value === topCat);

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${total}</div>
        <div class="stat-label">Total Notes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--yellow, #ffd54f);">${pinned}</div>
        <div class="stat-label">Pinned</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${topCatObj ? topCatObj.icon : '—'}</div>
        <div class="stat-label">Top: ${topCatObj ? topCatObj.label : '—'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${new Set(notes.flatMap(n => n.tags || [])).size}</div>
        <div class="stat-label">Unique Tags</div>
      </div>
    </div>`;
}

/* ── Main Render ── */
async function renderNotes(container) {
  const allNotes = await db.getAll(STORE, { sortBy: 'createdAt', sortDir: 'desc' });

  // Apply filters
  let notes = allNotes;
  if (filterCategory) {
    notes = notes.filter(n => n.category === filterCategory);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    notes = notes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  // Sort: pinned first, then by date
  notes.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });

  container.innerHTML = `
    <div class="page-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
      <div>
        <h1 style="margin: 0; font-size: 1.5rem;">🗒️ Notes</h1>
        <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.88rem;">Capture meetings, decisions, ideas, and references</p>
      </div>
      <button class="btn btn-primary" id="btn-add-note">+ New Note</button>
    </div>

    <!-- Filters -->
    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem; align-items: center;">
      <div style="position: relative; flex: 1; min-width: 200px; max-width: 350px;">
        <input id="filter-search" class="form-input" type="text" placeholder="🔍 Search notes..." value="${escHtml(searchQuery)}" style="width: 100%; padding-left: 0.75rem;" />
      </div>
      <select id="filter-category" class="form-select" style="min-width: 150px;">
        <option value="">All Categories</option>
        ${CATEGORIES.map(c => `<option value="${c.value}" ${filterCategory === c.value ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>

    <!-- Stats -->
    ${renderStats(allNotes)}

    <!-- Notes Grid -->
    <div id="notes-grid" style="margin-top: 1.25rem;">
      ${notes.length > 0
        ? `<div class="grid-2">${notes.map(n => renderNoteCard(n)).join('')}</div>`
        : `<div class="empty-state">
            <div class="empty-icon">🗒️</div>
            <h3>No notes found</h3>
            <p>${filterCategory || searchQuery ? 'Try adjusting your filters or search, or ' : ''}Create your first note to get started.</p>
            <button class="btn btn-primary" id="btn-empty-add">+ New Note</button>
          </div>`
      }
    </div>`;

  // ── Event Bindings ──

  // Add note buttons
  document.getElementById('btn-add-note').addEventListener('click', () => openNoteModal(null));
  const emptyAdd = document.getElementById('btn-empty-add');
  if (emptyAdd) emptyAdd.addEventListener('click', () => openNoteModal(null));

  // Filter: category
  document.getElementById('filter-category').addEventListener('change', (e) => {
    filterCategory = e.target.value;
    renderNotes(container);
  });

  // Filter: search (debounced)
  let searchTimeout;
  document.getElementById('filter-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderNotes(container);
    }, 250);
  });

  // Expand/Collapse
  container.querySelectorAll('.btn-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      expandedNoteId = expandedNoteId === id ? null : id;
      renderNotes(container);
    });
  });

  // Pin toggle
  container.querySelectorAll('.btn-pin-note').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(btn.dataset.id);
    });
  });

  // Edit note
  container.querySelectorAll('.btn-edit-note').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const note = await db.get(STORE, btn.dataset.id);
      if (note) openNoteModal(note);
    });
  });

  // Delete note
  container.querySelectorAll('.btn-delete-note').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(btn.dataset.id);
    });
  });
}

/* ── Register Module ── */
registerModule({
  id: 'notes',
  label: 'Notes',
  icon: '🗒️',
  section: 'work',
  order: 23,
  render: renderNotes
});
