/* ══════════════════════════════════════════════
   Dashboard Module — Home Overview
   ══════════════════════════════════════════════ */

import { registerModule, db, navigate, escHtml, formatDate, formatRelative, avatarHtml, statusBadge, priorityBadge, getCurrentQuarter } from '../app.js';

// ── Helpers ──

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function actionIcon(action) {
  const map = { add: '➕', update: '✏️', delete: '🗑️' };
  return map[action] || '📝';
}

function storeLabel(store) {
  const map = {
    team_members: 'Team Member',
    one_on_ones: '1:1 Meeting',
    goals: 'Goal',
    projects: 'Project',
    action_items: 'Action Item',
    notes: 'Note',
    reviews: 'Review',
    settings: 'Settings',
  };
  return map[store] || store;
}

function actionVerb(action) {
  const map = { add: 'added', update: 'updated', delete: 'removed' };
  return map[action] || action;
}

function snapshotName(entry) {
  const s = entry.snapshot || {};
  return s.name || s.title || s.subject || s.description?.slice(0, 40) || s.key || '—';
}

function daysFromNow(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  const now = new Date();
  // Reset time to compare dates only
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

// ── Main Render ──

async function renderDashboard(container) {
  // Show loading skeleton
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${getGreeting()} 👋</h1>
        <div class="page-subtitle">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
      </div>
    </div>
    <div class="stats-grid">
      ${Array(4).fill('<div class="stat-card" style="min-height:88px;opacity:0.3"></div>').join('')}
    </div>
    <div style="text-align:center;padding:48px;color:var(--text-muted);">Loading dashboard data…</div>`;

  // Fetch all data in parallel
  const [
    teamMembers,
    oneOnOnes,
    projects,
    actionItems,
    goals,
    auditLog,
  ] = await Promise.all([
    db.getAll('team_members'),
    db.getAll('one_on_ones', { sortBy: 'date', sortDir: 'asc' }),
    db.getAll('projects'),
    db.getAll('action_items'),
    db.getAll('goals'),
    db.getAuditLog(null, 10),
  ]);

  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  // Build a member lookup map for avatar/name rendering
  const memberMap = {};
  teamMembers.forEach(m => { memberMap[m.id] = m; });

  // ── Computed data ──
  const upcomingOneOnOnes = oneOnOnes.filter(o => {
    const d = new Date(o.date);
    return d >= new Date(now.toDateString()) && d <= in7Days;
  });

  const activeProjects = projects.filter(p =>
    p.status === 'active' || p.status === 'in_progress' || p.status === 'in-progress'
  );

  const openActions = actionItems.filter(a =>
    a.status === 'open' || a.status === 'pending' || a.status === 'in_progress' || a.status === 'in-progress'
  );

  const actionsDueSoon = actionItems.filter(a => {
    if (a.status === 'done' || a.status === 'completed' || a.status === 'closed') return false;
    const days = daysFromNow(a.dueDate);
    return days >= 0 && days <= 7;
  }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const next5OneOnOnes = oneOnOnes.filter(o => {
    return new Date(o.date) >= new Date(now.toDateString());
  }).slice(0, 5);

  const quarter = getCurrentQuarter();
  const quarterGoals = goals.filter(g => g.quarter === quarter);

  // Goal status breakdown
  const goalStatusCounts = { on_track: 0, at_risk: 0, behind: 0, completed: 0, not_started: 0 };
  quarterGoals.forEach(g => {
    const s = (g.status || 'not_started').replace(/-/g, '_');
    if (goalStatusCounts[s] !== undefined) goalStatusCounts[s]++;
    else goalStatusCounts.not_started++;
  });

  // ── Render full dashboard ──
  container.innerHTML = `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>${getGreeting()} 👋</h1>
        <div class="page-subtitle">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${quarter}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="dash-quick-add">➕ Quick Add</button>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="stats-grid">
      <div class="stat-card" data-nav="team" style="cursor:pointer">
        <div class="stat-icon purple">👥</div>
        <div class="stat-info">
          <div class="stat-value">${teamMembers.length}</div>
          <div class="stat-label">Team Members</div>
        </div>
      </div>
      <div class="stat-card" data-nav="one-on-ones" style="cursor:pointer">
        <div class="stat-icon blue">📅</div>
        <div class="stat-info">
          <div class="stat-value">${upcomingOneOnOnes.length}</div>
          <div class="stat-label">1:1s This Week</div>
        </div>
      </div>
      <div class="stat-card" data-nav="projects" style="cursor:pointer">
        <div class="stat-icon green">🚀</div>
        <div class="stat-info">
          <div class="stat-value">${activeProjects.length}</div>
          <div class="stat-label">Active Projects</div>
        </div>
      </div>
      <div class="stat-card" data-nav="action-items" style="cursor:pointer">
        <div class="stat-icon orange">☑️</div>
        <div class="stat-info">
          <div class="stat-value">${openActions.length}</div>
          <div class="stat-label">Open Action Items</div>
          ${actionsDueSoon.length > 0 ? `<div class="stat-trend down">⚠ ${actionsDueSoon.length} due soon</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Two-column layout: Activity + Upcoming 1:1s -->
    <div class="grid-2 mb-lg">
      <!-- Recent Activity -->
      <div class="card">
        <div class="card-header">
          <h3>🕑 Recent Activity</h3>
          <span class="text-xs text-muted">${auditLog.length > 0 ? 'Last ' + auditLog.length + ' entries' : ''}</span>
        </div>
        <div class="card-body">
          ${auditLog.length > 0 ? `
            <div class="timeline">
              ${auditLog.map(entry => `
                <div class="timeline-item">
                  <div class="tl-time">${formatRelative(entry.timestamp)}</div>
                  <div class="tl-text">
                    ${actionIcon(entry.action)}
                    ${escHtml(actionVerb(entry.action))} ${storeLabel(entry.store)}:
                    <strong>${escHtml(snapshotName(entry))}</strong>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">📭</div>
              <h3>No activity yet</h3>
              <p>Start by adding team members or projects</p>
            </div>
          `}
        </div>
      </div>

      <!-- Upcoming 1:1s -->
      <div class="card">
        <div class="card-header">
          <h3>📅 Upcoming 1:1s</h3>
          <button class="btn btn-ghost btn-sm" data-nav="one-on-ones">View All →</button>
        </div>
        <div class="card-body">
          ${next5OneOnOnes.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:12px;">
              ${next5OneOnOnes.map(o => {
                const member = memberMap[o.memberId];
                const memberName = member ? member.name : (o.memberId || 'Unknown');
                const days = daysFromNow(o.date);
                const urgencyClass = days === 0 ? 'badge-info' : days <= 1 ? 'badge-warning' : 'badge-neutral';
                const dayLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`;
                return `
                  <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);">
                    ${avatarHtml(memberName)}
                    <div style="flex:1;min-width:0;">
                      <div class="fw-600 truncate">${escHtml(memberName)}</div>
                      <div class="text-xs text-muted">${formatDate(o.date)}${o.time ? ' · ' + escHtml(o.time) : ''}</div>
                    </div>
                    <span class="badge ${urgencyClass}">${dayLabel}</span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">📅</div>
              <h3>No upcoming 1:1s</h3>
              <p>Schedule a check-in with your team</p>
              <button class="btn btn-primary btn-sm" data-nav="one-on-ones">Schedule 1:1</button>
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- Two-column layout: Action Items + Goals -->
    <div class="grid-2 mb-lg">
      <!-- Action Items Due Soon -->
      <div class="card">
        <div class="card-header">
          <h3>⚡ Action Items Due Soon</h3>
          <button class="btn btn-ghost btn-sm" data-nav="action-items">View All →</button>
        </div>
        <div class="card-body">
          ${actionsDueSoon.length > 0 ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                ${actionsDueSoon.slice(0, 6).map(a => {
                  const days = daysFromNow(a.dueDate);
                  const dueLabel = days === 0 ? '<span style="color:var(--red);font-weight:600;">Today</span>'
                    : days === 1 ? '<span style="color:var(--orange);font-weight:600;">Tomorrow</span>'
                    : `<span>${formatDate(a.dueDate)}</span>`;
                  return `
                    <tr>
                      <td><span class="truncate" style="max-width:180px;display:inline-block;">${escHtml(a.title || a.description || '—')}</span></td>
                      <td>
                        <div style="display:flex;align-items:center;gap:6px;">
                          ${avatarHtml(a.assignee || '?', 'sm')}
                          <span class="text-sm">${escHtml(a.assignee || '—')}</span>
                        </div>
                      </td>
                      <td>${dueLabel}</td>
                      <td>${a.priority ? priorityBadge(a.priority) : '<span class="text-muted">—</span>'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">✅</div>
              <h3>All clear!</h3>
              <p>No action items due in the next 7 days</p>
            </div>
          `}
        </div>
      </div>

      <!-- Goals Progress -->
      <div class="card">
        <div class="card-header">
          <h3>🎯 ${quarter} Goals</h3>
          <button class="btn btn-ghost btn-sm" data-nav="goals">View All →</button>
        </div>
        <div class="card-body">
          ${quarterGoals.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:18px;">
              <!-- Summary bar -->
              <div style="display:flex;gap:16px;flex-wrap:wrap;">
                <div style="text-align:center;">
                  <div style="font-size:1.4rem;font-weight:700;color:var(--green);">${goalStatusCounts.completed}</div>
                  <div class="text-xs text-muted">Completed</div>
                </div>
                <div style="text-align:center;">
                  <div style="font-size:1.4rem;font-weight:700;color:var(--blue);">${goalStatusCounts.on_track}</div>
                  <div class="text-xs text-muted">On Track</div>
                </div>
                <div style="text-align:center;">
                  <div style="font-size:1.4rem;font-weight:700;color:var(--yellow);">${goalStatusCounts.at_risk}</div>
                  <div class="text-xs text-muted">At Risk</div>
                </div>
                <div style="text-align:center;">
                  <div style="font-size:1.4rem;font-weight:700;color:var(--red);">${goalStatusCounts.behind}</div>
                  <div class="text-xs text-muted">Behind</div>
                </div>
                <div style="text-align:center;">
                  <div style="font-size:1.4rem;font-weight:700;color:var(--text-muted);">${goalStatusCounts.not_started}</div>
                  <div class="text-xs text-muted">Not Started</div>
                </div>
              </div>

              <!-- Overall progress bar -->
              ${(() => {
                const total = quarterGoals.length;
                const completedPct = total ? Math.round((goalStatusCounts.completed / total) * 100) : 0;
                const onTrackPct = total ? Math.round((goalStatusCounts.on_track / total) * 100) : 0;
                const atRiskPct = total ? Math.round((goalStatusCounts.at_risk / total) * 100) : 0;
                return `
                  <div>
                    <div class="flex-between mb-sm">
                      <span class="text-sm">Overall Progress</span>
                      <span class="text-sm fw-600">${completedPct}% completed</span>
                    </div>
                    <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;display:flex;">
                      <div style="width:${completedPct}%;background:var(--green);transition:width 0.5s ease;"></div>
                      <div style="width:${onTrackPct}%;background:var(--blue);transition:width 0.5s ease;"></div>
                      <div style="width:${atRiskPct}%;background:var(--yellow);transition:width 0.5s ease;"></div>
                    </div>
                  </div>
                `;
              })()}

              <!-- Individual goals -->
              ${quarterGoals.slice(0, 5).map(g => {
                const progress = g.progress || 0;
                const barColor = g.status === 'completed' ? 'green'
                  : g.status === 'on_track' || g.status === 'on-track' ? 'blue'
                  : g.status === 'at_risk' || g.status === 'at-risk' ? 'yellow'
                  : g.status === 'behind' ? 'red'
                  : 'purple';
                return `
                  <div>
                    <div class="flex-between" style="margin-bottom:6px;">
                      <span class="text-sm truncate" style="max-width:70%;">${escHtml(g.title || g.name || '—')}</span>
                      <span class="text-xs text-muted">${progress}%</span>
                    </div>
                    <div class="progress">
                      <div class="progress-bar ${barColor}" style="width:${progress}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">🎯</div>
              <h3>No ${quarter} goals yet</h3>
              <p>Set quarterly goals to track progress</p>
              <button class="btn btn-primary btn-sm" data-nav="goals">Add Goal</button>
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="card">
      <div class="card-header">
        <h3>⚡ Quick Actions</h3>
      </div>
      <div class="card-body" style="display:flex;flex-wrap:wrap;gap:10px;">
        <button class="btn btn-primary" data-nav="team">👥 Add Team Member</button>
        <button class="btn btn-secondary" data-nav="one-on-ones">📅 Schedule 1:1</button>
        <button class="btn btn-secondary" data-nav="projects">🚀 New Project</button>
        <button class="btn btn-secondary" data-nav="goals">🎯 Set Goal</button>
        <button class="btn btn-secondary" data-nav="action-items">☑️ Action Item</button>
        <button class="btn btn-secondary" data-nav="notes">📝 New Note</button>
        <button class="btn btn-secondary" data-nav="reviews">📊 Start Review</button>
      </div>
    </div>
  `;

  // ── Event Delegation ──
  container.addEventListener('click', (e) => {
    // Handle all data-nav buttons/elements
    const navEl = e.target.closest('[data-nav]');
    if (navEl) {
      e.preventDefault();
      navigate(navEl.dataset.nav);
    }
  });
}

// ── Register Module ──

registerModule({
  id: 'dashboard',
  label: 'Dashboard',
  icon: '📊',
  section: 'main',
  order: 1,
  render: renderDashboard
});
