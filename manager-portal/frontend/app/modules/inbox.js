import {
  registerModule, API, toast, openModal, closeModal, confirmDialog,
  escHtml, avatarHtml, formatDate, formatRelative, statusBadge, updateNavBadge
} from '../app.js';

// ─── Module Registration ──────────────────────────────────────────────────────

registerModule({
  id: 'inbox',
  label: 'Inbox',
  icon: '📥',
  section: null,
  order: 0,
  nav: true,
  render: renderInbox
});

// ─── State ────────────────────────────────────────────────────────────────────

// Tracks which sub-items (by composite key) have been handled locally
// key: `${queueItemId}:${itemType}:${itemIndex}` → 'approved' | 'dismissed'
const handledSubItems = new Map();

let currentFilter = 'pending';
let currentItems = [];

// ─── Main Render ──────────────────────────────────────────────────────────────

async function renderInbox(container) {
  container.innerHTML = `<div class="loading-spinner">Loading inbox…</div>`;

  // Respect filter from URL if present
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('status')) currentFilter = urlParams.get('status');

  try {
    const data = await API.get(`/api/inbox?status=${currentFilter}`);
    currentItems = Array.isArray(data) ? data : (data.items || []);
    renderAll(container);
  } catch (err) {
    container.innerHTML = `<div class="error-state">⚠️ Failed to load inbox: ${escHtml(err.message)}</div>`;
  }
}

function renderAll(container) {
  const pendingCount = countPendingSubItems();

  container.innerHTML = `
    ${renderPageHeader(pendingCount)}
    ${renderTabBar()}
    <div class="inbox-groups" id="inbox-groups">
      ${currentItems.length ? currentItems.map(item => renderGroup(item)).join('') : renderEmptyState()}
    </div>
  `;

  bindPageEvents(container);
  updateNavBadge('inbox', pendingCount);
}

// ─── Page Header ──────────────────────────────────────────────────────────────

function renderPageHeader(pendingCount) {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1>📥 Inbox</h1>
        ${pendingCount > 0 ? `<span class="badge badge-warning">${pendingCount}</span>` : ''}
      </div>
      ${pendingCount > 0 ? `
        <div class="page-header-actions">
          <button class="btn btn-ghost btn-sm" id="mark-all-done-btn">
            ✓ Mark All Done
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function renderTabBar() {
  const tabs = [
    { key: 'all',       label: 'All' },
    { key: 'pending',   label: 'Pending' },
    { key: 'approved',  label: 'Approved' },
    { key: 'dismissed', label: 'Dismissed' },
  ];

  return `
    <div class="tab-bar">
      ${tabs.map(t => `
        <button class="tab${currentFilter === t.key ? ' tab-active' : ''}"
                data-filter="${t.key}">
          ${t.label}
        </button>
      `).join('')}
    </div>
  `;
}

// ─── Source Group ─────────────────────────────────────────────────────────────

function renderGroup(queueItem) {
  const proposed = queueItem.proposed_json || {};
  const meta = proposed._meta || {};

  const subItems = collectSubItems(proposed);
  const totalCount = subItems.length;
  const handledCount = subItems.filter(si =>
    handledSubItems.has(subItemKey(queueItem.id, si.itemType, si.index))
  ).length;
  const allHandled = totalCount > 0 && handledCount === totalCount;

  const sourceLabel = queueItem.source_label || meta.file_name || 'Unknown Source';
  const callDate = meta.call_date ? formatDate(meta.call_date) : '';
  const summary = buildSummaryTags(proposed);

  return `
    <div class="inbox-group${allHandled ? ' inbox-group-done' : ''}"
         data-queue-id="${escHtml(String(queueItem.id))}">
      <div class="inbox-group-header">
        <div class="inbox-group-title">
          <span class="inbox-group-icon">📹</span>
          <span class="inbox-group-name">${escHtml(sourceLabel)}</span>
          ${callDate ? `<span class="inbox-group-date">— ${escHtml(callDate)}</span>` : ''}
        </div>
        <div class="inbox-group-meta">
          ${summary}
        </div>
      </div>

      <div class="inbox-group-cards" id="group-cards-${escHtml(String(queueItem.id))}">
        ${subItems.map(si => renderSubItemCard(queueItem.id, si, proposed)).join('')}
      </div>

      ${totalCount > 1 ? `
        <div class="inbox-group-footer">
          <button class="btn btn-ghost btn-sm approve-all-btn"
                  data-queue-id="${escHtml(String(queueItem.id))}">
            ✓ Approve All from this source
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// Collect all sub-items from proposed_json into a flat list with type + index
function collectSubItems(proposed) {
  const items = [];

  (proposed.action_items || []).forEach((d, i) =>
    items.push({ itemType: 'action_item', index: i, data: d }));

  (proposed.achievements || []).forEach((d, i) =>
    items.push({ itemType: 'achievement', index: i, data: d }));

  (proposed.wellbeing_signals || []).forEach((d, i) =>
    items.push({ itemType: 'wellbeing_signal', index: i, data: d }));

  (proposed.project_updates || []).forEach((d, i) =>
    items.push({ itemType: 'project_update', index: i, data: d }));

  return items;
}

function subItemKey(queueId, itemType, index) {
  return `${queueId}:${itemType}:${index}`;
}

function buildSummaryTags(proposed) {
  const parts = [];
  const ai = (proposed.action_items || []).length;
  const ach = (proposed.achievements || []).length;
  const wb = (proposed.wellbeing_signals || []).length;
  const pu = (proposed.project_updates || []).length;
  if (ai)  parts.push(`${ai} action item${ai  !== 1 ? 's' : ''}`);
  if (ach) parts.push(`${ach} achievement${ach !== 1 ? 's' : ''}`);
  if (wb)  parts.push(`${wb} wellbeing signal${wb  !== 1 ? 's' : ''}`);
  if (pu)  parts.push(`${pu} project update${pu !== 1 ? 's' : ''}`);
  return parts.map(p => `<span class="inbox-summary-tag">${escHtml(p)}</span>`).join('');
}

// ─── Sub-Item Cards ───────────────────────────────────────────────────────────

function renderSubItemCard(queueId, si, proposed) {
  const key = subItemKey(queueId, si.itemType, si.index);
  const handled = handledSubItems.get(key);

  if (handled === 'approved') {
    return `<div class="inbox-item inbox-item-approved" data-sub-key="${escHtml(key)}">
              <span class="inbox-item-handled-label">✓ Approved</span>
            </div>`;
  }
  if (handled === 'dismissed') {
    return `<div class="inbox-item inbox-item-dismissed" data-sub-key="${escHtml(key)}">
              <span class="inbox-item-handled-label">✗ Dismissed</span>
            </div>`;
  }

  const cardId = `subitem-${escHtml(key.replace(/:/g, '-'))}`;

  return `
    <div class="inbox-item" id="${cardId}" data-sub-key="${escHtml(key)}"
         data-queue-id="${escHtml(String(queueId))}"
         data-item-type="${escHtml(si.itemType)}"
         data-item-index="${si.index}">
      <div class="inbox-item-header">
        ${renderTypeBadge(si.itemType)}
        <div class="inbox-item-actions-quick">
          <button class="btn btn-primary btn-sm approve-btn"  title="Approve">✓ Approve</button>
          <button class="btn btn-ghost   btn-sm edit-btn"     title="Edit">✏ Edit</button>
          <button class="btn btn-ghost   btn-sm dismiss-btn"  title="Dismiss">✗</button>
        </div>
      </div>
      <div class="inbox-item-body">
        ${renderSubItemBody(si.itemType, si.data)}
      </div>
    </div>
  `;
}

function renderTypeBadge(itemType) {
  const map = {
    action_item:      { label: 'Action Item',     cls: 'badge-action'    },
    achievement:      { label: 'Achievement',     cls: 'badge-achieve'   },
    wellbeing_signal: { label: 'Wellbeing',       cls: 'badge-wellbeing' },
    project_update:   { label: 'Project Update',  cls: 'badge-project'   },
  };
  const { label, cls } = map[itemType] || { label: itemType, cls: 'badge-default' };
  return `<span class="item-type-badge ${cls}">${escHtml(label)}</span>`;
}

function renderSubItemBody(itemType, data) {
  switch (itemType) {
    case 'action_item':      return renderActionItemBody(data);
    case 'achievement':      return renderAchievementBody(data);
    case 'wellbeing_signal': return renderWellbeingBody(data);
    case 'project_update':   return renderProjectUpdateBody(data);
    default: return `<pre>${escHtml(JSON.stringify(data, null, 2))}</pre>`;
  }
}

function renderActionItemBody(d) {
  const parts = [];
  if (d.due_date)   parts.push(`Due: ${escHtml(formatDate(d.due_date))}`);
  if (d.owed_to)    parts.push(`Owed to: ${escHtml(d.owed_to)}`);
  if (d.assigned_to) parts.push(`Assigned: ${escHtml(d.assigned_to)}`);
  if (d.priority)   parts.push(`Priority: <span class="priority-${escHtml((d.priority||'').toLowerCase())}">${escHtml(d.priority)}</span>`);

  return `
    <div class="inbox-item-title">${escHtml(d.title || d.description || '—')}</div>
    ${parts.length ? `<div class="inbox-item-meta">${parts.join(' · ')}</div>` : ''}
    ${d.context ? `<div class="inbox-item-context">&ldquo;${escHtml(d.context)}&rdquo;</div>` : ''}
  `;
}

function renderAchievementBody(d) {
  const tags = Array.isArray(d.tags) ? d.tags : (d.tags ? String(d.tags).split(',') : []);
  return `
    <div class="inbox-item-title">
      ${d.member_name ? `<strong>${escHtml(d.member_name)}</strong> — ` : ''}${escHtml(d.description || '—')}
    </div>
    <div class="inbox-item-meta">
      ${d.impact_level ? `Impact: ${escHtml(d.impact_level)}` : ''}
      ${tags.length ? ` · Tags: ${tags.map(t => `<span class="tag">${escHtml(t.trim())}</span>`).join(' ')}` : ''}
    </div>
  `;
}

function renderWellbeingBody(d) {
  const severityIcon = { red: '🔴', yellow: '🟡', green: '🟢' };
  const sev = (d.severity || '').toLowerCase();
  return `
    <div class="inbox-item-title">
      ${d.member_name ? `<strong>${escHtml(d.member_name)}</strong> — ` : ''}${escHtml(d.signal || d.description || '—')}
    </div>
    <div class="inbox-item-meta">
      ${d.severity ? `Severity: ${severityIcon[sev] || ''} ${escHtml(d.severity)}` : ''}
    </div>
    ${d.context ? `<div class="inbox-item-context">&ldquo;${escHtml(d.context)}&rdquo;</div>` : ''}
  `;
}

function renderProjectUpdateBody(d) {
  const healthIcon = { green: '🟢', yellow: '🟡', red: '🔴', at_risk: '🟡', on_track: '🟢' };
  const h = (d.health || '').toLowerCase().replace(/\s+/g, '_');
  return `
    <div class="inbox-item-title">
      ${d.project_name ? `<strong>${escHtml(d.project_name)}</strong> — ` : ''}${escHtml(d.update || '—')}
    </div>
    <div class="inbox-item-meta">
      ${d.health ? `Health: ${healthIcon[h] || ''} ${escHtml(d.health)}` : ''}
    </div>
  `;
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">✅</div>
      <h2>Inbox zero</h2>
      <p>You're all caught up. No ${currentFilter === 'all' ? '' : currentFilter + ' '}items here.</p>
    </div>
  `;
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function bindPageEvents(container) {
  // Filter tabs
  container.querySelectorAll('.tab[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      const url = new URL(window.location);
      url.searchParams.set('status', currentFilter);
      window.history.replaceState({}, '', url);
      renderInbox(container);
    });
  });

  // Mark all done
  const madBtn = container.querySelector('#mark-all-done-btn');
  if (madBtn) {
    madBtn.addEventListener('click', () => handleMarkAllDone(container));
  }

  // Delegated events on cards
  const groups = container.querySelector('#inbox-groups');
  if (groups) {
    groups.addEventListener('click', e => {
      const card = e.target.closest('.inbox-item[data-queue-id]');

      if (e.target.closest('.approve-btn') && card) {
        handleApprove(card, container);
      } else if (e.target.closest('.edit-btn') && card) {
        handleEdit(card, container);
      } else if (e.target.closest('.dismiss-btn') && card) {
        handleDismiss(card, container);
      } else if (e.target.closest('.approve-all-btn')) {
        const btn = e.target.closest('.approve-all-btn');
        handleApproveAll(btn.dataset.queueId, container);
      }
    });
  }
}

// ─── Approve ──────────────────────────────────────────────────────────────────

async function handleApprove(card, container, overrideData = null) {
  const queueId  = card.dataset.queueId;
  const itemType = card.dataset.itemType;
  const index    = parseInt(card.dataset.itemIndex, 10);
  const key      = subItemKey(queueId, itemType, index);

  // Find item data from currentItems
  const queueItem = currentItems.find(qi => String(qi.id) === String(queueId));
  if (!queueItem) return;

  const proposed = queueItem.proposed_json || {};
  const typeKey  = itemTypeToArrayKey(itemType);
  const itemData = overrideData || (proposed[typeKey] || [])[index];
  if (!itemData) return;

  const btn = card.querySelector('.approve-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    await API.post(`/api/inbox/${queueId}/approve`, { item_type: itemType, item_data: itemData });
    handledSubItems.set(key, 'approved');
    toast('Saved!', 'success');
    animateCardOut(card, 'approved');
    checkGroupCompletion(queueId, container);
    decrementBadge(container);
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Approve'; }
  }
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

function handleEdit(card, container) {
  const queueId  = card.dataset.queueId;
  const itemType = card.dataset.itemType;
  const index    = parseInt(card.dataset.itemIndex, 10);

  const queueItem = currentItems.find(qi => String(qi.id) === String(queueId));
  if (!queueItem) return;

  const proposed = queueItem.proposed_json || {};
  const typeKey  = itemTypeToArrayKey(itemType);
  const itemData = JSON.parse(JSON.stringify((proposed[typeKey] || [])[index] || {}));

  const fields   = buildEditFields(itemType, itemData);
  const modalId  = `edit-modal-${queueId}-${itemType}-${index}`;

  openModal(modalId, {
    title: `Edit ${humanItemType(itemType)}`,
    body: `
      <form class="edit-form" id="form-${modalId}">
        ${fields.map(f => renderEditField(f)).join('')}
      </form>
    `,
    footer: `
      <button class="btn btn-ghost btn-sm"   id="${modalId}-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="${modalId}-save">Save & Approve</button>
    `
  });

  document.getElementById(`${modalId}-cancel`)?.addEventListener('click', () => closeModal(modalId));

  document.getElementById(`${modalId}-save`)?.addEventListener('click', async () => {
    const form = document.getElementById(`form-${modalId}`);
    if (!form) return;

    const edited = { ...itemData };
    form.querySelectorAll('[data-field]').forEach(input => {
      const field = input.dataset.field;
      let value = input.type === 'checkbox' ? input.checked : input.value.trim();
      // Handle tags (comma-separated → array)
      if (field === 'tags' && typeof value === 'string') {
        value = value.split(',').map(t => t.trim()).filter(Boolean);
      }
      edited[field] = value || null;
    });

    closeModal(modalId);
    // Patch the local data so approve sends the edited version
    if (proposed[typeKey]) proposed[typeKey][index] = edited;
    await handleApprove(card, container, edited);
  });
}

function buildEditFields(itemType, data) {
  switch (itemType) {
    case 'action_item':
      return [
        { key: 'title',       label: 'Title',       type: 'text',     value: data.title },
        { key: 'description', label: 'Description', type: 'textarea', value: data.description },
        { key: 'due_date',    label: 'Due Date',    type: 'date',     value: data.due_date },
        { key: 'owed_to',     label: 'Owed To',     type: 'text',     value: data.owed_to },
        { key: 'assigned_to', label: 'Assigned To', type: 'text',     value: data.assigned_to },
        { key: 'priority',    label: 'Priority',    type: 'select',   value: data.priority,
          options: ['Low', 'Medium', 'High'] },
        { key: 'context',     label: 'Context',     type: 'textarea', value: data.context },
      ];
    case 'achievement':
      return [
        { key: 'member_name',  label: 'Member',      type: 'text',     value: data.member_name },
        { key: 'description',  label: 'Description', type: 'textarea', value: data.description },
        { key: 'impact_level', label: 'Impact',      type: 'select',   value: data.impact_level,
          options: ['Low', 'Medium', 'High'] },
        { key: 'tags',         label: 'Tags (comma-separated)', type: 'text',
          value: Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '') },
      ];
    case 'wellbeing_signal':
      return [
        { key: 'member_name', label: 'Member',   type: 'text',     value: data.member_name },
        { key: 'signal',      label: 'Signal',   type: 'textarea', value: data.signal },
        { key: 'severity',    label: 'Severity', type: 'select',   value: data.severity,
          options: ['Green', 'Yellow', 'Red'] },
        { key: 'context',     label: 'Context',  type: 'textarea', value: data.context },
      ];
    case 'project_update':
      return [
        { key: 'project_name', label: 'Project', type: 'text',     value: data.project_name },
        { key: 'update',       label: 'Update',  type: 'textarea', value: data.update },
        { key: 'health',       label: 'Health',  type: 'select',   value: data.health,
          options: ['On Track', 'At Risk', 'Blocked'] },
      ];
    default:
      return Object.keys(data).map(k => ({ key: k, label: k, type: 'text', value: data[k] }));
  }
}

function renderEditField(f) {
  const val = f.value != null ? escHtml(String(f.value)) : '';
  const id  = `field-${f.key}`;

  if (f.type === 'textarea') {
    return `
      <div class="form-group">
        <label for="${id}">${escHtml(f.label)}</label>
        <textarea id="${id}" data-field="${escHtml(f.key)}" rows="3">${val}</textarea>
      </div>`;
  }
  if (f.type === 'select') {
    const opts = (f.options || []).map(o =>
      `<option value="${escHtml(o)}"${o === f.value ? ' selected' : ''}>${escHtml(o)}</option>`
    ).join('');
    return `
      <div class="form-group">
        <label for="${id}">${escHtml(f.label)}</label>
        <select id="${id}" data-field="${escHtml(f.key)}">${opts}</select>
      </div>`;
  }
  return `
    <div class="form-group">
      <label for="${id}">${escHtml(f.label)}</label>
      <input id="${id}" type="${escHtml(f.type)}" data-field="${escHtml(f.key)}" value="${val}" />
    </div>`;
}

// ─── Dismiss ──────────────────────────────────────────────────────────────────

async function handleDismiss(card, container) {
  const queueId  = card.dataset.queueId;
  const itemType = card.dataset.itemType;
  const index    = parseInt(card.dataset.itemIndex, 10);
  const key      = subItemKey(queueId, itemType, index);

  try {
    await API.post(`/api/inbox/${queueId}/dismiss`);
    handledSubItems.set(key, 'dismissed');
    animateCardOut(card, 'dismissed');
    checkGroupCompletion(queueId, container);
    decrementBadge(container);
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  }
}

// ─── Approve All ──────────────────────────────────────────────────────────────

async function handleApproveAll(queueId, container) {
  const group = container.querySelector(`.inbox-group[data-queue-id="${CSS.escape(queueId)}"]`);
  if (!group) return;

  const btn = group.querySelector('.approve-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    await API.post(`/api/inbox/${queueId}/approve-all`);
    toast('All items approved!', 'success');

    // Mark all sub-items as approved locally
    const queueItem = currentItems.find(qi => String(qi.id) === String(queueId));
    if (queueItem) {
      const proposed = queueItem.proposed_json || {};
      collectSubItems(proposed).forEach(si => {
        handledSubItems.set(subItemKey(queueId, si.itemType, si.index), 'approved');
      });
    }

    // Re-render just this group
    await reloadGroup(queueId, container);
    decrementBadge(container);
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Approve All from this source'; }
  }
}

// ─── Mark All Done ────────────────────────────────────────────────────────────

async function handleMarkAllDone(container) {
  // Approve all pending queue items sequentially
  const pending = currentItems.filter(qi => {
    const proposed = qi.proposed_json || {};
    const subs = collectSubItems(proposed);
    return subs.some(si =>
      !handledSubItems.has(subItemKey(qi.id, si.itemType, si.index))
    );
  });

  if (!pending.length) return;

  const btn = container.querySelector('#mark-all-done-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  let successCount = 0;
  for (const qi of pending) {
    try {
      await API.post(`/api/inbox/${qi.id}/approve-all`);
      const proposed = qi.proposed_json || {};
      collectSubItems(proposed).forEach(si => {
        handledSubItems.set(subItemKey(qi.id, si.itemType, si.index), 'approved');
      });
      successCount++;
    } catch (err) {
      console.warn(`Failed to approve queue item ${qi.id}:`, err);
    }
  }

  toast(`${successCount} source${successCount !== 1 ? 's' : ''} approved`, 'success');
  renderAll(container);
}

// ─── Group Completion Check ───────────────────────────────────────────────────

function checkGroupCompletion(queueId, container) {
  const queueItem = currentItems.find(qi => String(qi.id) === String(queueId));
  if (!queueItem) return;

  const proposed = queueItem.proposed_json || {};
  const subItems = collectSubItems(proposed);
  const allDone  = subItems.length > 0 && subItems.every(si =>
    handledSubItems.has(subItemKey(queueId, si.itemType, si.index))
  );

  if (allDone) {
    const group = container.querySelector(`.inbox-group[data-queue-id="${CSS.escape(queueId)}"]`);
    if (group) group.classList.add('inbox-group-done');

    // Check if everything is done → show empty state
    const allGroupsDone = currentItems.every(qi => {
      const p = qi.proposed_json || {};
      const subs = collectSubItems(p);
      return subs.length === 0 || subs.every(si =>
        handledSubItems.has(subItemKey(qi.id, si.itemType, si.index))
      );
    });

    if (allGroupsDone && currentFilter === 'pending') {
      const groupsContainer = container.querySelector('#inbox-groups');
      if (groupsContainer) {
        groupsContainer.innerHTML = renderEmptyState();
      }
      updateNavBadge('inbox', 0);
      // Hide mark-all-done button
      const madBtn = container.querySelector('#mark-all-done-btn');
      if (madBtn) madBtn.style.display = 'none';
      const badge = container.querySelector('.page-header .badge');
      if (badge) badge.style.display = 'none';
    }
  }
}

// ─── Reload Group ─────────────────────────────────────────────────────────────

async function reloadGroup(queueId, container) {
  try {
    const data = await API.get(`/api/inbox?status=${currentFilter}`);
    currentItems = Array.isArray(data) ? data : (data.items || []);

    const queueItem = currentItems.find(qi => String(qi.id) === String(queueId));
    const group = container.querySelector(`.inbox-group[data-queue-id="${CSS.escape(queueId)}"]`);
    if (!group) return;

    if (queueItem) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderGroup(queueItem);
      const newGroup = tmp.firstElementChild;
      group.replaceWith(newGroup);
    } else {
      group.remove();
    }

    // If no groups left, show empty state
    const groupsEl = container.querySelector('#inbox-groups');
    if (groupsEl && !groupsEl.querySelector('.inbox-group')) {
      groupsEl.innerHTML = renderEmptyState();
    }
  } catch (err) {
    console.warn('Failed to reload group:', err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemTypeToArrayKey(itemType) {
  const map = {
    action_item:      'action_items',
    achievement:      'achievements',
    wellbeing_signal: 'wellbeing_signals',
    project_update:   'project_updates',
  };
  return map[itemType] || itemType;
}

function humanItemType(itemType) {
  return {
    action_item:      'Action Item',
    achievement:      'Achievement',
    wellbeing_signal: 'Wellbeing Signal',
    project_update:   'Project Update',
  }[itemType] || itemType;
}

function countPendingSubItems() {
  let count = 0;
  for (const qi of currentItems) {
    const proposed = qi.proposed_json || {};
    const subs = collectSubItems(proposed);
    subs.forEach(si => {
      if (!handledSubItems.has(subItemKey(qi.id, si.itemType, si.index))) {
        count++;
      }
    });
  }
  return count;
}

function decrementBadge(container) {
  const badge = container.querySelector('.page-header .badge');
  if (badge) {
    const current = parseInt(badge.textContent, 10);
    if (!isNaN(current)) {
      const next = Math.max(0, current - 1);
      badge.textContent = next;
      if (next === 0) badge.style.display = 'none';
      updateNavBadge('inbox', next);
    }
  }
}

function animateCardOut(card, state) {
  card.classList.add(`inbox-item-${state}`, 'inbox-item-fade-out');
  card.style.transition = 'opacity 0.25s ease, max-height 0.3s ease, margin 0.3s ease';
  card.style.opacity = '0';
  card.style.maxHeight = card.offsetHeight + 'px';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.style.maxHeight = '0';
      card.style.marginBottom = '0';
      card.style.overflow = 'hidden';
    });
  });

  setTimeout(() => {
    // Replace with a slim handled indicator instead of removing entirely
    const key = card.dataset.subKey;
    card.innerHTML = `
      <div class="inbox-item-handled-row">
        <span class="inbox-item-handled-label ${state === 'approved' ? 'text-success' : 'text-muted'}">
          ${state === 'approved' ? '✓ Approved' : '✗ Dismissed'}
        </span>
      </div>`;
    card.style.opacity = '0.5';
    card.style.maxHeight = '';
    card.style.overflow = '';
  }, 320);
}
