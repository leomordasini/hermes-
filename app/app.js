/* ══════════════════════════════════════════════
   app.js — Module System, Router, UI Helpers
   ══════════════════════════════════════════════ */

import db from './db.js';

// ── Module Registry ──
const modules = new Map();
const navItems = [];

export function registerModule(config) {
  modules.set(config.id, config);
  if (config.nav !== false) {
    navItems.push({
      id: config.id,
      icon: config.icon,
      label: config.label,
      section: config.section || 'main',
      order: config.order || 99,
      badge: config.badge || null
    });
  }
}

// ── Router ──
let currentModule = null;

export function navigate(moduleId) {
  const mod = modules.get(moduleId);
  if (!mod) return;

  currentModule = moduleId;
  window.location.hash = moduleId;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.module === moduleId);
  });

  // Render module
  const container = document.getElementById('app-content');
  container.innerHTML = '';
  try {
    mod.render(container);
  } catch (e) {
    console.error(`Error rendering module "${moduleId}":`, e);
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading module</h3><p>${e.message}</p></div>`;
  }
}

// ── Toast System ──
let toastContainer;

export function toast(message, type = 'info', duration = 3000) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span> ${escHtml(message)}`;
  toastContainer.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    el.style.transition = '0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── Modal System ──
let modalOverlay;

export function openModal(title, bodyHtml, footerHtml) {
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
          <button class="btn btn-ghost btn-icon modal-close">✕</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer"></div>
      </div>`;
    document.body.appendChild(modalOverlay);
    modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  modalOverlay.querySelector('.modal-title').textContent = title;
  modalOverlay.querySelector('.modal-body').innerHTML = bodyHtml;
  modalOverlay.querySelector('.modal-footer').innerHTML = footerHtml || '';
  modalOverlay.classList.add('active');

  // Focus first input
  setTimeout(() => {
    const firstInput = modalOverlay.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
  }, 100);

  return modalOverlay;
}

export function closeModal() {
  if (modalOverlay) modalOverlay.classList.remove('active');
}

// ── Confirm Dialog ──
export function confirm(message) {
  return new Promise((resolve) => {
    const body = `<p style="font-size: 0.95rem;">${escHtml(message)}</p>`;
    const footer = `
      <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
      <button class="btn btn-danger" id="confirm-ok">Confirm</button>`;
    openModal('Confirm', body, footer);
    document.getElementById('confirm-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
    document.getElementById('confirm-ok').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

// ── HTML Helpers ──
export function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export function avatarHtml(name, size = '') {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#632ca6', '#4fc3f7', '#66bb6a', '#ff9800', '#ef5350', '#ffd54f', '#7b4dff', '#e91e63'];
  const hash = name ? name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const bg = colors[hash % colors.length];
  const cls = size ? `avatar avatar-${size}` : 'avatar';
  return `<div class="${cls}" style="background:${bg}">${initials}</div>`;
}

export function priorityBadge(priority) {
  const map = {
    critical: 'danger', high: 'orange', medium: 'warning', low: 'success'
  };
  return `<span class="badge badge-${map[priority] || 'neutral'}">${escHtml(priority)}</span>`;
}

export function statusBadge(status) {
  const map = {
    active: 'success', 'in_progress': 'info', 'in-progress': 'info',
    completed: 'success', done: 'success', closed: 'neutral',
    blocked: 'danger', 'at_risk': 'warning', 'at-risk': 'warning',
    'not_started': 'neutral', 'not-started': 'neutral',
    pending: 'warning', open: 'info', cancelled: 'neutral',
    'on_track': 'success', 'on-track': 'success',
    behind: 'warning', overdue: 'danger'
  };
  const label = status.replace(/[_-]/g, ' ');
  return `<span class="badge badge-${map[status] || 'neutral'}">${escHtml(label)}</span>`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export function getCurrentQuarter() {
  const now = new Date();
  return `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
}

// ── Render Sidebar ──
function renderSidebar() {
  const sections = {};
  navItems.sort((a, b) => a.order - b.order);

  for (const item of navItems) {
    const sec = item.section;
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(item);
  }

  const sectionLabels = {
    main: '',
    people: 'People',
    work: 'Work',
    system: 'System'
  };

  let html = '';
  for (const [sec, items] of Object.entries(sections)) {
    if (sectionLabels[sec]) {
      html += `<div class="nav-section-title">${sectionLabels[sec]}</div>`;
    }
    for (const item of items) {
      html += `
        <div class="nav-item" data-module="${item.id}">
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
          ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
        </div>`;
    }
  }

  document.getElementById('sidebar-nav').innerHTML = html;

  // Click handlers
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.module));
  });
}

// ── Render Shell ──
function renderApp() {
  document.getElementById('app').innerHTML = `
    <button class="mobile-toggle" id="mobile-toggle">☰</button>
    <div class="mobile-backdrop" id="mobile-backdrop"></div>
    <div class="app-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">🐕</div>
          <div>
            <div class="logo-text">Manager Portal</div>
            <div class="logo-sub">Datadog · Leo M.</div>
          </div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
      </aside>
      <div class="main-content" id="app-content"></div>
    </div>`;

  // Mobile sidebar toggle
  document.getElementById('mobile-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('mobile-backdrop').classList.toggle('active');
  });
  document.getElementById('mobile-backdrop').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('mobile-backdrop').classList.remove('active');
  });
}

// ── Boot ──
export async function boot() {
  await db.init();
  renderApp();
  renderSidebar();

  // Route from hash
  const hash = window.location.hash.slice(1);
  const target = hash && modules.has(hash) ? hash : 'dashboard';
  navigate(target);

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.slice(1);
    if (h && modules.has(h) && h !== currentModule) navigate(h);
  });

  // Keyboard shortcut: Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── Re-export db for modules ──
export { db };
