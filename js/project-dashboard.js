/* =====================================================
   WAVESTONE CR MASTER – project-dashboard.js
   Tableau de bord consolidé par projet :
   - KPIs globaux
   - Équipe projet (participants récurrents + photos)
   - Suivi des actions consolidées
   - Suivi des échéances
   ===================================================== */

/* =====================================================
   AFFICHER LE TABLEAU DE BORD PROJET
   ===================================================== */
function showProjectDashboardView() {
  if (!STATE.currentProjectId) return;
  renderProjectDashboard(STATE.currentProjectId);
  showView('viewProjectDashboard');
  const project = STATE.projects.find(p => p.id === STATE.currentProjectId);
  const name    = project ? project.name : 'Projet';
  setBreadcrumb([name, 'Tableau de bord']);
}

function showProjectCRsFromDashboard() {
  if (!STATE.currentProjectId) return;
  showProjectCRs(STATE.currentProjectId);
}

window.showProjectDashboardView    = showProjectDashboardView;
window.showProjectCRsFromDashboard = showProjectCRsFromDashboard;
window.renderPdCollabMembers       = renderPdCollabMembers;

/* =====================================================
   RENDU PRINCIPAL
   ===================================================== */
function renderProjectDashboard(projectId) {
  const project  = STATE.projects.find(p => p.id === projectId);
  const reports  = STATE.reports.filter(r => r.project_id === projectId);

  // Titre
  const pdTitle = document.getElementById('pdTitle');
  const pdSub   = document.getElementById('pdSubtitle');
  if (pdTitle) pdTitle.textContent = project ? project.name : 'Tableau de bord';

  // Sous-titre + badge "partagé"
  let subText = `${reports.length} compte${reports.length > 1 ? 's' : ''}-rendu${reports.length > 1 ? 's' : ''}`;
  if (project && project._shared) {
    const roleLabel = project._myRole === 'editor' ? 'Éditeur' : 'Lecteur';
    subText += ` · <span class="pd-shared-badge"><i class="fa-solid fa-user-group"></i> Partagé · ${roleLabel}</span>`;
  }
  if (pdSub) pdSub.innerHTML = subText;

  // Bouton "Quitter le projet" visible seulement pour les membres (pas propriétaires)
  const btnLeave = document.getElementById('btnLeaveProject');
  if (btnLeave) {
    if (project && project._shared) {
      btnLeave.style.display = 'inline-flex';
      btnLeave.onclick = () => {
        if (typeof leaveProject === 'function') leaveProject(projectId);
      };
    } else {
      btnLeave.style.display = 'none';
    }
  }

  // Bouton nouveau CR depuis dashboard
  const btnNew = document.getElementById('btnNewCRFromDashboard');
  if (btnNew) btnNew.onclick = () => {
    STATE.currentProjectId = projectId;
    openNewReport(projectId);
  };

  renderPdKPIs(reports);
  renderPdCollabMembers(projectId);
  renderPdParticipants(projectId, reports);
  renderPdActions(reports);
  renderPdDeadlines(reports);

  // Mettre à jour le compteur collaborateurs dans le bouton
  _updateCollabMembersCount(projectId);
}

/* =====================================================
   COLLABORATEURS DU PROJET (grille mini-cartes)
   ===================================================== */
async function renderPdCollabMembers(projectId) {
  const grid = document.getElementById('pdCollabMembersGrid');
  if (!grid) return;

  grid.innerHTML = '<span style="font-size:.8rem;color:var(--gray-400)"><i class="fa-solid fa-spinner fa-spin"></i></span>';

  try {
    const all     = await apiGet('project_members');
    const members = all.filter(m => m.project_id === projectId && m.status !== 'declined');

    if (members.length === 0) {
      grid.innerHTML = `
        <div class="pd-collab-empty">
          <i class="fa-solid fa-user-plus"></i>
          Aucun collaborateur — <a href="#" onclick="openCollabModal('${projectId}');return false;">Inviter un collègue</a>
        </div>`;
      return;
    }

    // Propriétaire
    const ownerProfile = STATE.userProfile;
    let html = '';

    if (ownerProfile) {
      const name = `${ownerProfile.first_name||''} ${ownerProfile.last_name||''}`.trim() || 'Moi';
      const initials = _pdCollabInitials(name);
      const color    = ownerProfile.avatar_color || '#002D72';
      html += `
        <div class="pd-collab-card" title="${_pdEsc(name)} (Propriétaire)">
          <div class="pd-collab-avatar" style="background:${_pdEsc(color)}">${_pdEsc(initials)}</div>
          <div class="pd-collab-name">${_pdEsc(name)}</div>
          <div class="pd-collab-role owner">Propriétaire</div>
        </div>`;
    }

    for (const m of members) {
      const name     = m.member_display_name || m.member_username || '—';
      const initials = _pdCollabInitials(name);
      const color    = _pdCollabColor(m.member_user_id);
      const roleLabel = m.role === 'editor' ? 'Éditeur' : 'Lecteur';
      const statusClass = m.status === 'accepted' ? 'accepted' : 'pending';
      html += `
        <div class="pd-collab-card ${statusClass}" title="${_pdEsc(name)} · ${roleLabel}${m.status==='pending' ? ' (en attente)' : ''}">
          <div class="pd-collab-avatar" style="background:${color};${m.status==='pending'?'opacity:.6':''}">
            ${_pdEsc(initials)}
            ${m.status === 'pending' ? '<span class="pd-collab-pending-dot"></span>' : ''}
          </div>
          <div class="pd-collab-name">${_pdEsc(name)}</div>
          <div class="pd-collab-role ${m.role}">${roleLabel}${m.status==='pending' ? ' <span class="pd-collab-pending-label">·&nbsp;En attente</span>' : ''}</div>
        </div>`;
    }

    // Bouton "+" pour ajouter
    html += `
      <div class="pd-collab-add-card" onclick="openCollabModal('${_pdEsc(projectId)}')" title="Inviter un collaborateur">
        <div class="pd-collab-add-icon"><i class="fa-solid fa-user-plus"></i></div>
        <div class="pd-collab-name" style="font-size:.7rem;">Inviter</div>
      </div>`;

    grid.innerHTML = html;
  } catch(e) {
    grid.innerHTML = `<span style="font-size:.8rem;color:var(--gray-400)">${t('pd_load_error')}</span>`;
    console.error('[Collab] renderPdCollabMembers error:', e);
  }
}

async function _updateCollabMembersCount(projectId) {
  try {
    const all     = await apiGet('project_members');
    const accepted = all.filter(m => m.project_id === projectId && m.status === 'accepted');
    const count    = accepted.length + 1; // +1 pour le propriétaire
    const badge    = document.getElementById('collabMembersCount');
    if (badge && count > 1) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else if (badge) {
      badge.style.display = 'none';
    }
  } catch(e) { /* silencieux */ }
}

function _pdCollabInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  return (parts[0] || '?').substring(0,2).toUpperCase();
}

function _pdCollabColor(userId) {
  if (!userId) return '#94A3B8';
  const colors = ['#002D72','#E8007D','#0066CC','#00A676','#F59E0B','#7C3AED','#DC2626','#0891B2'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) & 0xFFFFFFFF;
  return colors[Math.abs(hash) % colors.length];
}

function _pdEsc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* =====================================================
   KPIs
   ===================================================== */
function renderPdKPIs(reports) {
  const grid = document.getElementById('pdKpiGrid');
  if (!grid) return;

  const total    = reports.length;
  const draft    = reports.filter(r => r.status === 'draft').length;
  const final    = reports.filter(r => r.status === 'final').length;
  const archived = reports.filter(r => r.status === 'archived').length;

  // Collecter toutes les actions
  const allActions = reports.flatMap(r => {
    try { return JSON.parse(r.actions || '[]'); } catch { return []; }
  });
  const totalActions   = allActions.length;
  const doneActions    = allActions.filter(a => a.status === 'done').length;
  const todoActions    = allActions.filter(a => a.status === 'todo').length;
  const wipActions     = allActions.filter(a => a.status === 'wip').length;
  const blockedActions = allActions.filter(a => a.status === 'blocked').length;

  // Participants uniques
  const allParticipants = reports.flatMap(r => {
    try { return JSON.parse(r.participants || '[]'); } catch { return []; }
  });
  const uniqueParticipants = new Set(allParticipants.map(p => normalizeParticipantName(p.name))).size;

  // Taux de complétion actions
  const completionRate = totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0;

  // Dernière réunion
  const sortedDates = reports
    .filter(r => r.meeting_date)
    .map(r => r.meeting_date)
    .sort()
    .reverse();
  const lastMeeting = sortedDates[0] ? formatDate(sortedDates[0]) : '–';

  // Actions en retard
  const today      = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueActions = allActions.filter(a => {
    if (a.status === 'done' || !a.due) return false;
    const due = new Date(a.due);
    return due < today;
  }).length;

  grid.innerHTML = `
    ${pdKpiCard('fa-file-lines',      t('kpi_label_total'),        total,             'var(--primary)',  '')}
    ${pdKpiCard('fa-circle-check',    t('kpi_label_final'),        final,             '#059669',        total > 0 ? `${Math.round(final/total*100)}%` : '')}
    ${pdKpiCard('fa-pen-to-square',   t('kpi_label_draft'),        draft,             '#D97706',        '')}
    ${pdKpiCard('fa-list-check',      t('kpi_label_actions'),      totalActions,      '#6366F1',        `${doneActions} ${t('done').toLowerCase()}`)}
    ${pdKpiCard('fa-percent',         t('kpi_label_completion'),   completionRate+'%','#0EA5E9',        `${doneActions}/${totalActions}`)}
    ${pdKpiCard('fa-triangle-exclamation', t('kpi_label_overdue'), overdueActions,    overdueActions > 0 ? '#EF4444' : '#059669', '')}
    ${pdKpiCard('fa-users',           t('kpi_label_participants2'),uniqueParticipants,'#8B5CF6',       '')}
    ${pdKpiCard('fa-calendar',        t('kpi_label_last'),         lastMeeting,       'var(--accent)',   '')}
  `;

  // Mini barre de progression pour les actions
  if (totalActions > 0) {
    const progressBar = `
      <div class="pd-progress-card">
        <div class="pd-progress-title">${t('kpi_progress')}</div>
        <div class="pd-progress-bar-wrap">
          <div class="pd-progress-bar-inner" style="width:${completionRate}%;background:var(--success)"></div>
        </div>
        <div class="pd-progress-legend">
          <span class="pd-leg todo"><span class="dot" style="background:#F59E0B"></span> ${t('kpi_todo')} : ${todoActions}</span>
          <span class="pd-leg wip"><span class="dot" style="background:#3B82F6"></span> ${t('kpi_wip')} : ${wipActions}</span>
          <span class="pd-leg done"><span class="dot" style="background:#059669"></span> ${t('kpi_done2')} : ${doneActions}</span>
          <span class="pd-leg blocked"><span class="dot" style="background:#EF4444"></span> ${t('kpi_blocked2')} : ${blockedActions}</span>
        </div>
      </div>`;
    grid.insertAdjacentHTML('beforeend', progressBar);
  }
}

function pdKpiCard(icon, label, value, color, sub) {
  return `
    <div class="pd-kpi-card">
      <div class="pd-kpi-icon" style="color:${color}"><i class="fa-solid ${icon}"></i></div>
      <div class="pd-kpi-value" style="color:${color}">${value}</div>
      <div class="pd-kpi-label">${label}</div>
      ${sub ? `<div class="pd-kpi-sub">${sub}</div>` : ''}
    </div>`;
}

/* =====================================================
   ÉQUIPE PROJET (participants récurrents + profils)
   ===================================================== */
async function renderPdParticipants(projectId, reports) {
  const grid = document.getElementById('pdParticipantsGrid');
  if (!grid) return;

  // Construire la liste consolidée des participants
  const participantMap = new Map(); // name_normalized → { count, roles, companies, photo, color }

  reports.forEach(r => {
    let parts = [];
    try { parts = JSON.parse(r.participants || '[]'); } catch {}
    parts.forEach(p => {
      if (!p.name) return;
      const key = normalizeParticipantName(p.name);
      if (!participantMap.has(key)) {
        participantMap.set(key, {
          name:      p.name,
          count:     0,
          roles:     new Set(),
          companies: new Set(),
          photo:     null,
          color:     null,
        });
      }
      const entry = participantMap.get(key);
      entry.count++;
      if (p.role)    entry.roles.add(p.role);
      if (p.company) entry.companies.add(p.company);
      if (p.photo)   entry.photo = p.photo;
      if (p.color)   entry.color = p.color;
    });
  });

  // Essayer de charger les profils participants depuis la table
  try {
    const storedProfiles = await apiGet('participant_profiles');
    const userProfiles   = storedProfiles.filter(p => p.user_id === STATE.userId);
    userProfiles.forEach(prof => {
      const key = normalizeParticipantName(prof.name);
      if (participantMap.has(key)) {
        const entry = participantMap.get(key);
        if (prof.photo)        entry.photo = prof.photo;
        if (prof.avatar_color) entry.color = prof.avatar_color;
        if (prof.role)         entry.roles.add(prof.role);
        if (prof.company)      entry.companies.add(prof.company);
      }
    });
  } catch(e) { /* table optionnelle */ }

  // Trier par fréquence d'apparition
  const sorted = [...participantMap.entries()]
    .map(([key, v]) => ({ ...v, key }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    grid.innerHTML = `<div class="pd-empty">${t('pd_no_participants')}</div>`;
    return;
  }

  const totalCRs = reports.length;

  grid.innerHTML = sorted.map(p => {
    const initials  = getInitials(p.name);
    const color     = p.color || stringToColor(p.name);
    const roleStr   = [...p.roles].filter(Boolean).join(', ') || '';
    const compStr   = [...p.companies].filter(Boolean).join(', ') || '';
    const presence  = totalCRs > 0 ? Math.round((p.count / totalCRs) * 100) : 0;
    const avatarHtml = p.photo
      ? `<img src="${p.photo}" alt="${_pdEscHtml(p.name)}" class="pd-participant-photo" />`
      : `<div class="pd-participant-avatar" style="background:${color};">${initials}</div>`;

    return `
      <div class="pd-participant-card" data-key="${_pdEscAttr(p.key)}" data-project="${_pdEscAttr(STATE.currentProjectId)}">
        <div class="pd-participant-avatar-wrap">
          ${avatarHtml}
          <span class="pd-participant-count" title="${p.count} CR(s)">${p.count}</span>
        </div>
        <div class="pd-participant-name">${_pdEscHtml(p.name)}</div>
        ${roleStr    ? `<div class="pd-participant-role">${_pdEscHtml(roleStr)}</div>`    : ''}
        ${compStr    ? `<div class="pd-participant-company">${_pdEscHtml(compStr)}</div>` : ''}
        <div class="pd-participant-presence">
          <div class="pd-presence-bar" style="width:${presence}%"></div>
        </div>
        <div class="pd-participant-actions">
          <button class="pd-btn-sm" title="Modifier le profil" onclick="editParticipantProfile('${_pdEscAttr(p.key)}','${_pdEscAttr(p.name)}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="pd-btn-sm" title="Ajouter aux participants du prochain CR" onclick="addParticipantToCurrentCR('${_pdEscAttr(p.name)}','${_pdEscAttr([...p.roles][0]||'')}','${_pdEscAttr([...p.companies][0]||'')}')">
            <i class="fa-solid fa-user-plus"></i>
          </button>
          <button class="pd-btn-sm pd-btn-danger" title="Retirer ce participant de tous les CRs du projet" onclick="removeParticipantFromProject('${_pdEscAttr(p.key)}','${_pdEscAttr(p.name)}','${_pdEscAttr(STATE.currentProjectId)}')">
            <i class="fa-solid fa-user-minus"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

/* =====================================================
   SUIVI DES ACTIONS CONSOLIDÉES
   ===================================================== */
let _allPdActions = []; // cache pour le filtrage

function renderPdActions(reports) {
  _allPdActions = [];

  reports.forEach(r => {
    let actions = [];
    try { actions = JSON.parse(r.actions || '[]'); } catch {}
    actions.forEach((a, idx) => {
      if (!a.action) return;
      _allPdActions.push({
        ...a,
        meetingName:  r.meeting_name || r.name || 'Réunion',
        meetingDate:  r.meeting_date || '',
        reportId:     r.id,
        actionIndex:  idx,
      });
    });
  });

  // Trier : en retard d'abord, puis todo, wip, blocked, done
  _allPdActions.sort((a, b) => {
    const order = { todo: 1, wip: 2, blocked: 3, done: 4 };
    const overA = isOverdue(a) ? 0 : (order[a.status] || 1);
    const overB = isOverdue(b) ? 0 : (order[b.status] || 1);
    return overA - overB;
  });

  renderPdActionsTable('all');
}

function filterPdActions(filter, btn) {
  document.querySelectorAll('.pd-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPdActionsTable(filter);
}
window.filterPdActions = filterPdActions;

function renderPdActionsTable(filter) {
  const tbody = document.getElementById('pdActionsBody');
  if (!tbody) return;

  const filtered = filter === 'all'
    ? _allPdActions
    : _allPdActions.filter(a => a.status === filter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--gray-400);font-style:italic;">${t('pd_no_actions')}${filter !== 'all' ? ' ' + t('pd_with_status') : ''}.</td></tr>`;
    return;
  }

  const statusLabel = { todo: t('todo'), wip: t('in_progress'), done: t('done'), blocked: t('blocked') };
  const statusClass = { todo:'pd-badge-todo', wip:'pd-badge-wip', done:'pd-badge-done', blocked:'pd-badge-blocked' };

  tbody.innerHTML = filtered.map(a => {
    const overdue = isOverdue(a);
    return `
      <tr class="${overdue ? 'pd-row-overdue' : ''}">
        <td>${_pdEscHtml(a.action)}</td>
        <td>${_pdEscHtml(a.owner || '–')}</td>
        <td style="white-space:nowrap;font-size:.78rem;color:var(--gray-500);">${_pdEscHtml(a.meetingName)}${a.meetingDate ? ` <small>(${formatDate(a.meetingDate)})</small>` : ''}</td>
        <td style="white-space:nowrap;">${a.due ? `<span class="${overdue ? 'pd-overdue-date' : ''}">${formatDate(a.due)}</span>` : '–'}</td>
        <td style="white-space:nowrap;">
          <select class="pd-status-select pd-status-${a.status||'todo'}"
            onchange="updateActionStatus('${a.reportId}',${a.actionIndex},this.value,'dashboard',this)">
            <option value="todo"    ${(a.status||'todo')==='todo'    ? 'selected' : ''}>${t('todo')}</option>
            <option value="wip"     ${a.status==='wip'              ? 'selected' : ''}>${t('in_progress')}</option>
            <option value="done"    ${a.status==='done'             ? 'selected' : ''}>${t('done')}</option>
            <option value="blocked" ${a.status==='blocked'          ? 'selected' : ''}>${t('blocked')}</option>
          </select>
          ${overdue ? ` <span class="pd-badge pd-badge-blocked" style="font-size:.65rem">${t('pd_overdue_badge')}</span>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function isOverdue(action) {
  if (action.status === 'done' || !action.due) return false;
  const due   = new Date(action.due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/* =====================================================
   SUIVI DES ÉCHÉANCES
   ===================================================== */
function renderPdDeadlines(reports) {
  const container = document.getElementById('pdDeadlines');
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allActions = reports.flatMap(r => {
    let acts = [];
    try { acts = JSON.parse(r.actions || '[]'); } catch {}
    return acts.filter(a => a.due && a.status !== 'done').map(a => ({
      ...a,
      meetingName: r.meeting_name || r.name || 'Réunion',
    }));
  });

  if (allActions.length === 0) {
    container.innerHTML = `<div class="pd-empty">${t('pd_no_deadlines')}</div>`;
    return;
  }

  // Grouper par semaine
  const groups = {
    retard:   [],
    semaine:  [],
    mois:     [],
    futur:    [],
  };

  allActions.forEach(a => {
    const due = new Date(a.due);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (diff < 0)       groups.retard.push({ ...a, diff });
    else if (diff <= 7) groups.semaine.push({ ...a, diff });
    else if (diff <= 31) groups.mois.push({ ...a, diff });
    else                 groups.futur.push({ ...a, diff });
  });

  // Trier chaque groupe par date
  Object.values(groups).forEach(g => g.sort((a, b) => a.diff - b.diff));

  const renderGroup = (title, items, urgent) => {
    if (items.length === 0) return '';
    return `
      <div class="pd-deadline-group">
        <div class="pd-deadline-group-title ${urgent ? 'urgent' : ''}">${title} <span class="pd-count">${items.length}</span></div>
        <div class="pd-deadline-list">
          ${items.map(a => `
            <div class="pd-deadline-item ${a.diff < 0 ? 'overdue' : a.diff <= 3 ? 'soon' : ''}">
              <div class="pd-deadline-date">
                ${a.diff < 0 ? `<i class="fa-solid fa-circle-exclamation"></i> ${Math.abs(a.diff)}j de retard`
                             : a.diff === 0 ? '<i class="fa-solid fa-bell"></i> Aujourd\'hui'
                             : a.diff <= 7  ? `<i class="fa-solid fa-clock"></i> Dans ${a.diff}j`
                             : `<i class="fa-regular fa-calendar"></i> ${formatDate(a.due)}`}
              </div>
              <div class="pd-deadline-action">${_pdEscHtml(a.action)}</div>
              <div class="pd-deadline-meta">${_pdEscHtml(a.owner || '–')} · ${_pdEscHtml(a.meetingName)}</div>
            </div>`).join('')}
        </div>
      </div>`;
  };

  container.innerHTML = `
    ${renderGroup('⚠️ En retard', groups.retard, true)}
    ${renderGroup('📅 Cette semaine', groups.semaine, groups.semaine.length > 0)}
    ${renderGroup('🗓️ Ce mois-ci', groups.mois, false)}
    ${renderGroup('🔮 Plus tard', groups.futur, false)}
  `;
}

/* =====================================================
   PROFIL PARTICIPANT — édition modale
   ===================================================== */
async function editParticipantProfile(nameKey, displayName) {
  // Créer une modale d'édition de profil participant
  const modal = document.getElementById('modalParticipantProfile');
  if (!modal) return;

  document.getElementById('ppName').value  = displayName;
  document.getElementById('ppRole').value  = '';
  document.getElementById('ppCompany').value = '';
  document.getElementById('ppPhotoPreview').src = '';
  document.getElementById('ppPhotoPreview').style.display = 'none';
  document.getElementById('ppPhotoNoImg').style.display   = 'flex';
  document.getElementById('ppColorPicker').value = stringToColor(displayName);

  // Charger le profil existant si disponible
  try {
    const all     = await apiGet('participant_profiles');
    const profile = all.find(p => p.user_id === STATE.userId && normalizeParticipantName(p.name) === nameKey);
    if (profile) {
      document.getElementById('ppRole').value    = profile.role    || '';
      document.getElementById('ppCompany').value = profile.company || '';
      document.getElementById('ppColorPicker').value = profile.avatar_color || stringToColor(displayName);
      if (profile.photo) {
        document.getElementById('ppPhotoPreview').src            = profile.photo;
        document.getElementById('ppPhotoPreview').style.display  = 'block';
        document.getElementById('ppPhotoNoImg').style.display    = 'none';
      }
      modal.dataset.profileId = profile.id;
    } else {
      modal.dataset.profileId = '';
    }
  } catch(e) { modal.dataset.profileId = ''; }

  modal.dataset.nameKey = nameKey;
  modal.dataset.displayName = displayName;
  openModal('modalParticipantProfile');
}
window.editParticipantProfile = editParticipantProfile;

async function saveParticipantProfile() {
  const modal       = document.getElementById('modalParticipantProfile');
  const nameKey     = modal.dataset.nameKey;
  const displayName = modal.dataset.displayName;
  const profileId   = modal.dataset.profileId;

  const role    = document.getElementById('ppRole').value.trim();
  const company = document.getElementById('ppCompany').value.trim();
  const color   = document.getElementById('ppColorPicker').value;
  const photo   = document.getElementById('ppPhotoPreview').src || '';

  const payload = {
    user_id:      STATE.userId,
    name:         displayName,
    role,
    company,
    avatar_color: color,
    photo:        photo.startsWith('data:') ? photo : '',
  };

  try {
    if (profileId) {
      await apiPatch('participant_profiles', profileId, payload);
    } else {
      await apiPost('participant_profiles', payload);
    }
    showToast(t('participant_saved'), 'success');
    closeModal('modalParticipantProfile');
    // Rafraîchir le tableau de bord
    renderProjectDashboard(STATE.currentProjectId);
  } catch(err) {
    console.error('saveParticipantProfile error:', err);
    showToast(t('participant_save_error'), 'error');
  }
}
window.saveParticipantProfile = saveParticipantProfile;

/* Ajouter un participant rapide au CR en cours */
function addParticipantToCurrentCR(name, role, company) {
  if (!STATE.currentProjectId) return;
  if (document.getElementById('viewEditor').classList.contains('active')) {
    addParticipantFromDashboard(name, role, company);
    showToast(`${name} ${t('participant_added')}`, 'success');
  } else {
    showToast(`${t('open_cr_first')} ${name}.`, 'info');
  }
}
window.addParticipantToCurrentCR = addParticipantToCurrentCR;

/* =====================================================
   UTILITAIRES LOCAUX
   ===================================================== */
function normalizeParticipantName(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').substring(0, 2).toUpperCase();
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#002D72','#E8007D','#0050B3','#6366F1','#8B5CF6','#059669','#D97706','#DC2626'];
  return colors[Math.abs(hash) % colors.length];
}

function _pdEscHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _pdEscAttr(str) {
  return String(str || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Expose
window.renderProjectDashboard = renderProjectDashboard;
window.filterPdActions        = filterPdActions;

/* =====================================================
   MISE À JOUR STATUT ACTION — partagée dashboard + agenda
   ===================================================== */
async function updateActionStatus(reportId, actionIndex, newStatus, source, selectEl) {
  // 1. Retrouver le CR dans STATE
  const report = STATE.reports.find(r => r.id === reportId);
  if (!report) { showToast(t('cr_not_found'), 'error'); return; }

  // 2. Parser les actions
  let actions = [];
  try { actions = JSON.parse(report.actions || '[]'); } catch {}
  if (actionIndex < 0 || actionIndex >= actions.length) {
    showToast(t('action_not_found'), 'error');
    return;
  }

  const oldStatus = actions[actionIndex].status;
  if (oldStatus === newStatus) return; // rien à faire

  // 3. Mettre à jour localement
  actions[actionIndex].status = newStatus;

  // 4. Feedback visuel immédiat sur le select
  if (selectEl) {
    selectEl.className = `pd-status-select pd-status-${newStatus}`;
    // Désactiver pendant la sauvegarde
    selectEl.disabled = true;
  }

  try {
    // 5. Sauvegarder via API (PATCH uniquement le champ actions)
    await apiPatch('meeting_reports', reportId, {
      actions:       JSON.stringify(actions),
      last_modified: new Date().toISOString(),
    });

    // 6. Mettre à jour STATE.reports localement sans re-fetch complet
    report.actions = JSON.stringify(actions);

    const _sl = { todo: t('todo'), wip: t('in_progress'), done: t('done'), blocked: t('blocked') };
    showToast(`${t('status_updated')} ${_sl[newStatus] || newStatus}`, 'success');

    // 7. Rafraîchir la vue source sans tout recalculer
    if (source === 'dashboard') {
      // Mettre à jour le cache _allPdActions
      const cached = _allPdActions.find(a => a.reportId === reportId && a.actionIndex === actionIndex);
      if (cached) cached.status = newStatus;
      // Maintenir le filtre actif
      const activeBtn = document.querySelector('.pd-filter-btn.active');
      const activeFilter = activeBtn ? (activeBtn.dataset.filter || 'all') : 'all';
      renderPdActionsTable(activeFilter);
      // Rafraîchir aussi les KPIs
      const reports = STATE.reports.filter(r => r.project_id === STATE.currentProjectId);
      renderPdKPIs(reports);
      renderPdDeadlines(reports);
    } else if (source === 'agenda') {
      // Déléguer le rafraîchissement à agenda.js
      if (typeof window._refreshAgendaAfterStatusChange === 'function') {
        window._refreshAgendaAfterStatusChange(reportId, actionIndex, newStatus);
      }
    }

  } catch (err) {
    console.error('updateActionStatus error:', err);
    // Annuler la mise à jour locale
    actions[actionIndex].status = oldStatus;
    report.actions = JSON.stringify(actions);
    if (selectEl) selectEl.value = oldStatus;
    showToast(t('status_update_error'), 'error');
  } finally {
    if (selectEl) selectEl.disabled = false;
  }
}
window.updateActionStatus = updateActionStatus;

/* =====================================================
   SUPPRIMER UN PARTICIPANT DES CRs D'UN PROJET
   ===================================================== */
/**
 * Retire un participant de TOUS les CRs d'un projet.
 * Supprime aussi son profil dans participant_profiles si existant.
 * Seul le propriétaire du projet (user_id === STATE.userId) peut faire ça.
 */
async function removeParticipantFromProject(participantKey, participantName, projectId) {
  // Vérifier les droits : propriétaire ou éditeur seulement
  const project = STATE.projects.find(p => p.id === projectId);
  if (!project) return;
  if (project._shared && project._myRole !== 'editor') {
    showToast(t('owner_only_remove_part'), 'warning');
    return;
  }

  // Confirmation avec modale
  const ok = await _pdConfirm(
    `Retirer "${participantName}" du projet ?`,
    `Ce participant sera supprimé de tous les CRs du projet "${project.name}". Son profil enregistré sera aussi supprimé. Cette action est irréversible.`,
    'Retirer',
    true
  );
  if (!ok) return;

  try {
    const reports = STATE.reports.filter(r => r.project_id === projectId);
    let updatedCount = 0;

    // Parcourir tous les CRs du projet et retirer le participant
    for (const report of reports) {
      let participants = [];
      try { participants = JSON.parse(report.participants || '[]'); } catch { continue; }

      const before = participants.length;
      const after  = participants.filter(p => {
        const key = normalizeParticipantName(p.name);
        return key !== participantKey;
      });

      if (after.length < before) {
        // Mettre à jour en base
        const updated = await apiPatch('meeting_reports', report.id, {
          participants: JSON.stringify(after),
        });
        // Mettre à jour STATE local
        report.participants = updated.participants;
        updatedCount++;
      }
    }

    // Supprimer le profil participant enregistré s'il existe
    try {
      const allProfiles = await apiGet('participant_profiles');
      const profile = allProfiles.find(prof =>
        prof.user_id === STATE.userId &&
        normalizeParticipantName(prof.name) === participantKey
      );
      if (profile) await apiDelete('participant_profiles', profile.id);
    } catch(e) { console.warn('Suppression profil participant:', e); }

    showToast(`"${participantName}" retiré de ${updatedCount} CR(s).`, 'success');

    // Rafraîchir la section équipe
    const reports2 = STATE.reports.filter(r => r.project_id === projectId);
    renderPdParticipants(projectId, reports2);

  } catch(err) {
    console.error('[removeParticipantFromProject]', err);
    showToast(t('part_remove_error'), 'error');
  }
}
window.removeParticipantFromProject = removeParticipantFromProject;

/**
 * Petite modale de confirmation synchrone (Promise-based) pour project-dashboard.
 */
function _pdConfirm(title, message, confirmLabel, isDanger) {
  return new Promise(resolve => {
    const modal   = document.getElementById('modalConfirm');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl   = document.getElementById('confirmModalMessage');
    const btnYes  = document.getElementById('btnConfirmAction');
    const btnNo   = document.getElementById('btnCancelConfirm');

    if (!modal) { resolve(true); return; }

    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> ${_pdEscHtml(title)}`;
    if (msgEl)   msgEl.textContent = message;
    btnYes.textContent  = confirmLabel || t('confirm_lbl');
    btnYes.className    = isDanger ? 'btn-primary btn-danger' : 'btn-primary';

    const cleanup = () => { btnYes.onclick = null; btnNo.onclick = null; closeModal('modalConfirm'); };
    btnYes.onclick = () => { cleanup(); resolve(true);  };
    btnNo.onclick  = () => { cleanup(); resolve(false); };
    openModal('modalConfirm');
  });
}
