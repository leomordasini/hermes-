import API from './api.js';

// ─────────────────────────────────────────────
// Module Registry
// ─────────────────────────────────────────────

const modules = new Map();  // id -> config
const navItems = [];        // ordered nav entries

/**
 * Register a module with the app.
 * config: { id, label, icon, section, order, render(container, params), nav?, badge? }
 */
export function registerModule(config) {
  modules.set(config.id, config);
  if (config.nav !== false) {
    navItems.push(config);
    // Keep nav items sorted by order field (lower = higher up)
    navItems.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }
}

// ─────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────

let _currentModule = null;

/**
 * Navigate to a module by id, optionally passing params.
 * Updates the URL hash, highlights the active nav item,
 * shows a brief loading spinner, then calls mod.render().
 */
export function navigate(moduleId, params = {}) {
  const mod = modules.get(moduleId);
  if (!mod) {
    console.warn(`[app] navigate: unknown module "${moduleId}"`);
    return;
  }

  // Update hash without triggering the hashchange listener re-entrantly
  const expectedHash = `#${moduleId}`;
  if (window.location.hash !== expectedHash) {
    _suppressHashChange = true;
    window.location.hash = moduleId;
  }

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.moduleId === moduleId);
  });

  // Scroll main content to top
  const content = document.getElementById('app-content');
  if (content) content.scrollTop = 0;

  // Show loading spinner
  if (content) {
    content.innerHTML = `
      <div class="loading-spinner-wrap">
        <div class="loading-spinner"></div>
      </div>`;
  }

  _currentModule = moduleId;

  // Slight delay so the spinner is visible before potentially-heavy renders
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (content) {
        try {
          mod.render(content, params);
        } catch (err) {
          console.error(`[app] render error in module "${moduleId}":`, err);
          content.innerHTML = `
            <div class="error-state">
              <div class="error-icon">⚠️</div>
              <div class="error-title">Failed to load module</div>
              <div class="error-msg">${escHtml(err.message)}</div>
            </div>`;
        }
      }

      // Close mobile sidebar after navigation
      closeMobileSidebar();
    });
  });
}

export function getCurrentModule() {
  return _currentModule;
}

// ─────────────────────────────────────────────
// Toast System
// ─────────────────────────────────────────────

/**
 * Display a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration  ms before auto-dismiss
 */
export function toast(message, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️',
  };

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] ?? icons.info}</span>
    <span class="toast-message">${escHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss">×</button>`;

  container.appendChild(el);

  // Trigger enter animation on next frame
  requestAnimationFrame(() => el.classList.add('toast-visible'));

  const dismiss = () => {
    el.classList.remove('toast-visible');
    el.classList.add('toast-hiding');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    // Fallback removal in case transition doesn't fire
    setTimeout(() => el.remove(), 400);
  };

  el.querySelector('.toast-close').addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}

// ─────────────────────────────────────────────
// Modal System
// ─────────────────────────────────────────────

let _activeModal = null;
let _activeModalOnClose = null;

/**
 * Open a modal dialog.
 * @param {string}   title
 * @param {string}   bodyHtml
 * @param {string}   footerHtml
 * @param {object}   opts  { wide: bool, onClose: fn }
 * @returns {HTMLElement} the modal root element
 */
export function openModal(title, bodyHtml, footerHtml = '', opts = {}) {
  // Close any existing modal first
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = `modal-dialog${opts.wide ? ' modal-wide' : ''}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', title);

  dialog.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">${escHtml(title)}</h2>
      <button class="modal-close-btn" aria-label="Close modal">×</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}`;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  _activeModal = overlay;
  _activeModalOnClose = opts.onClose ?? null;

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // Close button
  dialog.querySelector('.modal-close-btn').addEventListener('click', closeModal);

  // Trap focus inside modal
  _trapFocus(dialog);

  return overlay;
}

/** Close the currently open modal (if any). */
export function closeModal() {
  if (!_activeModal) return;

  const overlay = _activeModal;
  _activeModal = null;

  overlay.classList.remove('modal-visible');
  overlay.classList.add('modal-hiding');
  overlay.addEventListener('transitionend', () => {
    overlay.remove();
    document.body.classList.remove('modal-open');
  }, { once: true });
  setTimeout(() => {
    overlay.remove();
    document.body.classList.remove('modal-open');
  }, 300);

  if (typeof _activeModalOnClose === 'function') {
    _activeModalOnClose();
    _activeModalOnClose = null;
  }
}

/**
 * Show a confirm dialog.
 * @param {string} message
 * @param {object} opts  { confirmText, cancelText, danger }
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
  return new Promise(resolve => {
    const confirmText = opts.confirmText ?? 'Confirm';
    const cancelText  = opts.cancelText  ?? 'Cancel';
    const dangerClass = opts.danger ? ' btn-danger' : ' btn-primary';

    const footerHtml = `
      <button class="btn btn-secondary" id="confirm-cancel">${escHtml(cancelText)}</button>
      <button class="btn${dangerClass}" id="confirm-ok">${escHtml(confirmText)}</button>`;

    const modal = openModal('Confirm', `<p class="confirm-message">${escHtml(message)}</p>`, footerHtml, {
      onClose: () => resolve(false),
    });

    modal.querySelector('#confirm-ok').addEventListener('click', () => {
      _activeModalOnClose = null; // prevent double-resolve via onClose
      closeModal();
      resolve(true);
    });

    modal.querySelector('#confirm-cancel').addEventListener('click', () => {
      _activeModalOnClose = null;
      closeModal();
      resolve(false);
    });
  });
}

// Focus trap helper
function _trapFocus(el) {
  const focusable = el.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  first.focus();

  el.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  });
}

// ─────────────────────────────────────────────
// HTML Helpers
// ─────────────────────────────────────────────

/** Escape a string for safe insertion into HTML. */
export function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/** Generate a colored avatar circle with initials. */
export function avatarHtml(name, size = '') {
  if (!name) return '';
  const initials = name
    .trim()
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  // Deterministic color from name string
  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#0ea5e9', '#3b82f6',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = colors[hash % colors.length];

  const sizeClass = size ? ` avatar-${size}` : '';
  return `<div class="avatar${sizeClass}" style="background:${color}" title="${escHtml(name)}">${initials}</div>`;
}

const STATUS_COLORS = {
  active:      'badge-green',
  inactive:    'badge-gray',
  pending:     'badge-yellow',
  approved:    'badge-green',
  rejected:    'badge-red',
  open:        'badge-blue',
  closed:      'badge-gray',
  resolved:    'badge-green',
  'in-progress': 'badge-blue',
  on_track:    'badge-green',
  at_risk:     'badge-yellow',
  off_track:   'badge-red',
  draft:       'badge-gray',
  review:      'badge-yellow',
  done:        'badge-green',
  blocked:     'badge-red',
};

/** Return a colored status badge span. */
export function statusBadge(status) {
  const key   = String(status ?? '').toLowerCase().replace(/\s+/g, '_');
  const cls   = STATUS_COLORS[key] ?? 'badge-gray';
  const label = String(status ?? '').replace(/_/g, ' ');
  return `<span class="badge ${cls}">${escHtml(label)}</span>`;
}

const PRIORITY_COLORS = {
  critical: 'badge-red',
  high:     'badge-orange',
  medium:   'badge-yellow',
  low:      'badge-blue',
  none:     'badge-gray',
};

/** Return a colored priority badge span. */
export function priorityBadge(priority) {
  const key = String(priority ?? 'none').toLowerCase();
  const cls = PRIORITY_COLORS[key] ?? 'badge-gray';
  return `<span class="badge ${cls}">${escHtml(priority ?? 'None')}</span>`;
}

/** Return a colored health indicator dot. */
export function healthDot(health) {
  const map = {
    healthy:  'dot-green',
    good:     'dot-green',
    warning:  'dot-yellow',
    degraded: 'dot-yellow',
    critical: 'dot-red',
    down:     'dot-red',
    unknown:  'dot-gray',
  };
  const key = String(health ?? 'unknown').toLowerCase();
  const cls = map[key] ?? 'dot-gray';
  return `<span class="health-dot ${cls}" title="${escHtml(health)}"></span>`;
}

/** Format an ISO date string as 'May 3, 2026'. */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Format a date string as a relative time string: '2h ago', '3d ago', etc. */
export function formatRelative(dateStr) {
  if (!dateStr) return '—';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const abs  = Math.abs(diff);
    const future = diff < 0;
    const suffix = future ? 'from now' : 'ago';

    const mins  = Math.floor(abs / 60_000);
    const hours = Math.floor(abs / 3_600_000);
    const days  = Math.floor(abs / 86_400_000);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (abs < 60_000)       return 'just now';
    if (mins  < 60)         return `${mins}m ${suffix}`;
    if (hours < 24)         return `${hours}h ${suffix}`;
    if (days  < 7)          return `${days}d ${suffix}`;
    if (weeks < 5)          return `${weeks}w ${suffix}`;
    if (months < 12)        return `${months}mo ${suffix}`;
    return formatDate(dateStr);
  } catch {
    return dateStr;
  }
}

/** Return the current quarter label, e.g. 'Q2 2026'. */
export function getCurrentQuarter() {
  const now = new Date();
  const q   = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

/** '1 item' / '3 items'. Handles irregular plurals via optional plural form. */
export function pluralize(n, word, plural) {
  const count = Number(n);
  if (count === 1) return `1 ${word}`;
  return `${count} ${plural ?? word + 's'}`;
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────

const SECTION_LABELS = {
  people: 'People',
  work:   'Work',
  system: 'System',
};

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  // Group nav items by section
  const groups = new Map();
  for (const item of navItems) {
    const section = item.section ?? '';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(item);
  }

  let html = '';

  // Render null/'' section first (no heading), then named sections in order
  const sectionOrder = ['', 'people', 'work', 'system'];
  const seenSections = new Set();

  for (const section of sectionOrder) {
    if (groups.has(section)) {
      seenSections.add(section);
      html += renderNavSection(section, groups.get(section));
    }
  }

  // Render any sections not in the predefined order
  for (const [section, items] of groups) {
    if (!seenSections.has(section)) {
      html += renderNavSection(section, items);
    }
  }

  nav.innerHTML = html;

  // Attach click handlers
  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.moduleId));
  });
}

function renderNavSection(section, items) {
  const heading = SECTION_LABELS[section]
    ? `<div class="nav-section-heading">${SECTION_LABELS[section]}</div>`
    : '';

  const itemsHtml = items.map(item => {
    const badge = item.badge
      ? `<span class="nav-badge" id="nav-badge-${escHtml(item.id)}">${item.badge}</span>`
      : `<span class="nav-badge nav-badge-hidden" id="nav-badge-${escHtml(item.id)}"></span>`;

    return `
      <button class="nav-item" data-module-id="${escHtml(item.id)}" type="button">
        <span class="nav-icon">${item.icon ?? ''}</span>
        <span class="nav-label">${escHtml(item.label)}</span>
        ${badge}
      </button>`;
  }).join('');

  return `<div class="nav-section">${heading}${itemsHtml}</div>`;
}

/**
 * Update the badge count on a nav item.
 * Passing 0 or null hides the badge.
 */
export function updateNavBadge(moduleId, count) {
  const el = document.getElementById(`nav-badge-${moduleId}`);
  if (!el) return;
  if (count && count > 0) {
    el.textContent = count > 99 ? '99+' : String(count);
    el.classList.remove('nav-badge-hidden');
  } else {
    el.textContent = '';
    el.classList.add('nav-badge-hidden');
  }
}

// ─────────────────────────────────────────────
// Mobile sidebar
// ─────────────────────────────────────────────

function initMobileSidebar() {
  const toggle   = document.getElementById('mobile-toggle');
  const backdrop = document.getElementById('mobile-backdrop');
  const sidebar  = document.getElementById('sidebar');
  if (!toggle || !backdrop || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar-open');
    backdrop.classList.toggle('backdrop-visible');
  });

  backdrop.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('sidebar-open');
  document.getElementById('mobile-backdrop')?.classList.remove('backdrop-visible');
}

// ─────────────────────────────────────────────
// App Shell
// ─────────────────────────────────────────────

function renderShell() {
  document.body.innerHTML = `
    <button class="mobile-toggle" id="mobile-toggle">☰</button>
    <div class="mobile-backdrop" id="mobile-backdrop"></div>
    <div class="app-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">🐕</div>
          <div>
            <div class="logo-name">Manager Portal</div>
            <div class="logo-sub">Datadog</div>
          </div>
        </div>
        <nav id="sidebar-nav" class="sidebar-nav"></nav>
      </aside>
      <main class="main-content" id="app-content"></main>
    </div>`;
}

// ─────────────────────────────────────────────
// Hash change guard
// ─────────────────────────────────────────────

let _suppressHashChange = false;

function handleHashChange() {
  if (_suppressHashChange) {
    _suppressHashChange = false;
    return;
  }
  const hash = window.location.hash.replace(/^#/, '').split('?')[0];
  if (hash && modules.has(hash)) {
    navigate(hash);
  }
}

// ─────────────────────────────────────────────
// Inbox poll
// ─────────────────────────────────────────────

async function pollInboxCount() {
  try {
    const data = await API.getInboxCount();
    const count = data?.pending ?? data?.count ?? 0;
    updateNavBadge('inbox', count);
  } catch {
    // Non-critical — silently ignore
  }
}

// ─────────────────────────────────────────────
// Boot Sequence
// ─────────────────────────────────────────────

export async function boot() {
  // 1. Check API health
  try {
    await API.health();
  } catch (err) {
    document.body.innerHTML = `
      <div class="boot-error">
        <div class="boot-error-icon">🐕</div>
        <h1>Manager Portal</h1>
        <p class="boot-error-msg">Cannot reach the backend. Please try again later.</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
    throw new Error(`API health check failed: ${err.message}`);
  }

  // 2. Render app shell
  renderShell();

  // 3. Build sidebar nav
  buildSidebar();

  // 4. Init mobile sidebar toggle
  initMobileSidebar();

  // 5. Navigate to hash or default
  const initialHash = window.location.hash.replace(/^#/, '').split('?')[0];
  const initialModule = (initialHash && modules.has(initialHash)) ? initialHash : 'dashboard';
  navigate(initialModule);

  // 6. Poll inbox count immediately, then every 60 s
  pollInboxCount();
  setInterval(pollInboxCount, 60_000);

  // 7. Hash change listener
  window.addEventListener('hashchange', handleHashChange);

  // 8. Escape key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _activeModal) closeModal();
  });
}

// ─────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────

export { API };
