import {
  registerModule, API, toast, navigate, escHtml, avatarHtml,
  statusBadge, priorityBadge, healthDot, formatDate, formatRelative,
  getCurrentQuarter, pluralize
} from '../app.js';

// ─── Module Registration ──────────────────────────────────────────────────────

registerModule({
  id: 'dashboard',
  label: 'Dashboard',
  icon: '📊',
  section: null,
  order: 1,
  render: renderDashboard
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function isOverdue(dueDateStr) {
  if (!dueDateStr) return false;
  return new Date(dueDateStr) < new Date(new Date().toDateString());
}

function formatFullDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function skeletonHtml() {
  return `
    <div class="page-header skeleton-box" style="height:80px;border-radius:8px;margin-bottom:24px;"></div>
    <div class="stats-grid" style="margin-bottom:24px;">
      ${Array(4).fill('<div class="stat-card skeleton-box" style="height:100px;border-radius:8px;"></div>').join('')}
    </div>
    <div class="grid-2" style="margin-bottom:24px;">
      <div class="card skeleton-box" style="height:280px;border-radius:8px;"></div>
      <div class="card skeleton-box" style="height:280px;border-radius:8px;"></div>
    </div>
    <div class="card skeleton-box" style="height:140px;border-radius:8px;margin-bottom:24px;"></div>
    <div class="stats-grid skeleton-box" style="height:56px;border-radius:8px;"></div>
  `;
}

// ─── Section Renderers ────────────────────────────────────────────────────────

function renderPageHeader() {
  const now = new Date();
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">${getGreeting()}, Leo 👋</h1>
        <p class="page-subtitle">
          ${formatFullDate(now)}
          <span class="badge badge-outline" style="margin-left:8px;">${escHtml(getCurrentQuarter())}</span>
        </p>
      </div>
    </div>
  `;
}

function renderStats(members, actionCounts, activeProjects, inboxCount) {
  const overdueCount = actionCounts?.overdue ?? 0;
  const openCount    = actionCounts?.open    ?? 0;
  const memberCount  = Array.isArray(members) ? members.length : (members?.total ?? 0);
  const projectCount = Array.isArray(activeProjects)
    ? activeProjects.length
    : (activeProjects?.total ?? 0);
  const pendingCount = inboxCount?.pending ?? inboxCount?.total ?? inboxCount ?? 0;

  const actionCardColor = overdueCount > 0 ? 'red' : 'yellow';
  const actionSubtitle  = overdueCount > 0
    ? `<span style="color:var(--color-red,#ef4444);">⚠ ${pluralize(overdueCount, 'overdue')}</span>`
    : `${pluralize(openCount, 'open item')}`;

  return `
    <div class="stats-grid">

      <div class="stat-card stat-card--purple">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${memberCount}</div>
        <div class="stat-label">Team Members</div>
      </div>

      <div class="stat-card stat-card--blue" style="cursor:pointer;" data-nav="inbox" role="button" tabindex="0">
        <div class="stat-icon">📥</div>
        <div class="stat-value">${pendingCount}</div>
        <div class="stat-label">Inbox Pending</div>
      </div>

      <div class="stat-card stat-card--green">
        <div class="stat-icon">🗂</div>
        <div class="stat-value">${projectCount}</div>
        <div class="stat-label">Active Projects</div>
      </div>

      <div class="stat-card stat-card--${actionCardColor}">
        <div class="stat-icon">${overdueCount > 0 ? '🔴' : '✅'}</div>
        <div class="stat-value">${openCount}</div>
        <div class="stat-label">Open Action Items</div>
        <div class="stat-sub">${actionSubtitle}</div>
      </div>

    </div>
  `;
}

function renderUpcomingActions(openActions) {
  const items = [...(openActions ?? [])]
    .filter(a => a.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  const rowsHtml = items.length === 0
    ? `<tr><td colspan="3"><div class="empty-state">No upcoming action items 🎉</div></td></tr>`
    : items.map(item => {
        const overdue = isOverdue(item.due_date);
        const dateStyle = overdue ? 'color:var(--color-red,#ef4444);font-weight:600;' : '';
        const owedTo = item.owed_to
          ? `<span class="text-muted">${escHtml(item.owed_to)}</span>`
          : '<span class="text-muted">—</span>';
        return `
          <tr>
            <td>
              ${priorityBadge ? priorityBadge(item.priority) + ' ' : ''}
              ${escHtml(item.title ?? item.name ?? '')}
            </td>
            <td>${owedTo}</td>
            <td style="${dateStyle}">
              ${overdue ? '⚠ ' : ''}${formatDate(item.due_date)}
            </td>
          </tr>
        `;
      }).join('');

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">📋 Upcoming Action Items</h2>
        <a class="btn btn-sm btn-ghost" data-nav="actions" href="#" style="font-size:.85rem;">View all →</a>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Owed To</th>
            <th>Due Date</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function renderProjectsHealth(allProjects) {
  const projects = allProjects ?? [];

  const cardsHtml = projects.length === 0
    ? `<div class="empty-state">No projects yet</div>`
    : projects.map(project => {
        const progress = project.progress ?? 0;
        const barColor = progress >= 80
          ? 'var(--color-green,#22c55e)'
          : progress >= 40
            ? 'var(--color-yellow,#eab308)'
            : 'var(--color-red,#ef4444)';

        return `
          <div class="project-health-row" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color,#e5e7eb);">
            ${healthDot(project.health ?? project.status)}
            <span style="flex:1;font-size:.9rem;font-weight:500;">${escHtml(project.name ?? project.title ?? '')}</span>
            ${statusBadge(project.status)}
            <div style="width:80px;">
              <div class="progress" style="height:6px;border-radius:3px;background:var(--color-border,#e5e7eb);overflow:hidden;">
                <div class="progress-bar" style="width:${progress}%;height:100%;background:${barColor};border-radius:3px;transition:width .3s;"></div>
              </div>
              <div style="font-size:.7rem;color:var(--color-muted,#6b7280);text-align:right;margin-top:2px;">${progress}%</div>
            </div>
          </div>
        `;
      }).join('');

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">🏗 Projects Health</h2>
        <a class="btn btn-sm btn-ghost" data-nav="projects" href="#" style="font-size:.85rem;">View all →</a>
      </div>
      <div style="padding:4px 0;">${cardsHtml}</div>
    </div>
  `;
}

function renderRecentInbox(inboxItems) {
  const items = [...(inboxItems ?? [])]
    .filter(i => (i.status ?? 'pending') === 'pending')
    .slice(-3)
    .reverse(); // most recent first

  if (items.length === 0) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">📨 Recent Inbox</h2>
          <a class="btn btn-sm btn-ghost" data-nav="inbox" href="#" style="font-size:.85rem;">View all →</a>
        </div>
        <div class="empty-state">Inbox is clear — nice work! 📭</div>
      </div>
    `;
  }

  const rowsHtml = items.map(item => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color,#e5e7eb);">
      <div style="font-size:1.5rem;">📩</div>
      <div style="flex:1;">
        <div style="font-weight:500;">${escHtml(item.source_label ?? item.source ?? 'Unknown Source')}</div>
        <div style="font-size:.82rem;color:var(--color-muted,#6b7280);">
          ${pluralize(item.item_count ?? 1, 'item')}
          ${item.received_at ? '· ' + formatRelative(item.received_at) : ''}
        </div>
      </div>
      <button class="btn btn-sm btn-outline" data-nav="inbox">Review →</button>
    </div>
  `).join('');

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">📨 Recent Inbox</h2>
        <a class="btn btn-sm btn-ghost" data-nav="inbox" href="#" style="font-size:.85rem;">View all →</a>
      </div>
      <div style="padding:4px 0;">${rowsHtml}</div>
    </div>
  `;
}

function renderQuickActions(container) {
  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">⚡ Quick Actions</h2>
      </div>
      <div class="stats-grid" style="gap:12px;padding-top:4px;">
        <button class="btn btn-primary" data-nav="team" style="justify-content:center;">
          + Team Member
        </button>
        <button class="btn btn-primary" data-nav="actions" style="justify-content:center;">
          + Action Item
        </button>
        <button class="btn btn-primary" data-nav="projects" style="justify-content:center;">
          + Project
        </button>
        <button class="btn btn-outline" id="sync-zoom-btn" style="justify-content:center;">
          🔄 Sync Zoom
        </button>
      </div>
    </div>
  `;
}

// ─── Main Render ──────────────────────────────────────────────────────────────

async function renderDashboard(container) {
  // Show skeleton immediately
  container.innerHTML = skeletonHtml();

  let members, actionCounts, activeProjects, inboxCount, openActions, allProjects;

  try {
    [members, actionCounts, activeProjects, inboxCount, openActions, allProjects] =
      await Promise.all([
        API.getMembers(),
        API.getActionCounts(),
        API.getProjects({ status: 'active' }),
        API.getInboxCount(),
        API.getActions({ status: 'open' }),
        API.getProjects({})
      ]);
  } catch (err) {
    console.error('[Dashboard] Failed to load data:', err);
    container.innerHTML = `
      <div class="empty-state" style="padding:60px 20px;text-align:center;">
        <div style="font-size:2.5rem;margin-bottom:12px;">⚠️</div>
        <h2>Failed to load dashboard</h2>
        <p style="color:var(--color-muted,#6b7280);margin-top:6px;">${escHtml(err?.message ?? 'An unexpected error occurred.')}</p>
        <button class="btn btn-primary" style="margin-top:18px;" id="dash-retry-btn">Retry</button>
      </div>
    `;
    container.querySelector('#dash-retry-btn')?.addEventListener('click', () => renderDashboard(container));
    return;
  }

  // ── Compose full HTML ──
  container.innerHTML = `
    ${renderPageHeader()}
    ${renderStats(members, actionCounts, activeProjects, inboxCount)}
    <div class="grid-2" style="margin-bottom:24px;">
      ${renderUpcomingActions(openActions)}
      ${renderProjectsHealth(allProjects)}
    </div>
    ${renderRecentInbox(inboxCount?.items ?? openActions /* fallback */ ?? [])}
    <div style="margin-top:24px;">
      ${renderQuickActions()}
    </div>
  `;

  // ── Event delegation ──

  // Stat card: Inbox click
  container.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const target = el.dataset.nav;
      if (target) navigate(target);
    });
    // Keyboard accessibility for role=button divs
    if (el.getAttribute('role') === 'button') {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(el.dataset.nav);
        }
      });
    }
  });

  // Sync Zoom
  const syncBtn = container.querySelector('#sync-zoom-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = '🔄 Syncing…';
      try {
        const result = await API.syncZoom();
        toast(result?.message ?? 'Zoom synced successfully!', 'success');
      } catch (err) {
        toast(err?.message ?? 'Zoom sync failed.', 'error');
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔄 Sync Zoom';
      }
    });
  }
}
