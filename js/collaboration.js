/* =====================================================
   WAVESTONE CR MASTER – collaboration.js
   Gestion de la co-édition des projets :
   - Invitation par identifiant ou email
   - Acceptation / refus depuis Mon Espace
   - Lecture des projets partagés
   - Gestion des droits (owner / editor / viewer)
   ===================================================== */

'use strict';

const _COLLAB_CACHE = {
  ttlMs: 10000,
  projectMembers: null,
  projectMembersTs: 0,
  userProfiles: null,
  userProfilesTs: 0,
};

function _invalidateCollabCache() {
  _COLLAB_CACHE.projectMembers = null;
  _COLLAB_CACHE.projectMembersTs = 0;
}

async function _getProjectMembersCached(force = false) {
  const now = Date.now();
  if (!force && _COLLAB_CACHE.projectMembers && (now - _COLLAB_CACHE.projectMembersTs) < _COLLAB_CACHE.ttlMs) {
    return _COLLAB_CACHE.projectMembers;
  }
  const all = await apiGet('project_members');
  _COLLAB_CACHE.projectMembers = all;
  _COLLAB_CACHE.projectMembersTs = now;
  return all;
}

async function _getUserProfilesCached(force = false) {
  const now = Date.now();
  if (!force && _COLLAB_CACHE.userProfiles && (now - _COLLAB_CACHE.userProfilesTs) < _COLLAB_CACHE.ttlMs) {
    return _COLLAB_CACHE.userProfiles;
  }
  const all = await apiGet('user_profiles');
  _COLLAB_CACHE.userProfiles = all;
  _COLLAB_CACHE.userProfilesTs = now;
  return all;
}

function _normCollab(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/* =====================================================
   STATE COLLAB (ajouté dans STATE global)
   ===================================================== */
// STATE.projectMembers = [] — sera alimenté par fetchProjectMembers()
// STATE.pendingInvitations = [] — invitations reçues non acceptées

/* =====================================================
   FETCH DES MEMBRES / INVITATIONS
   ===================================================== */

/**
 * Charge tous les memberships liés à l'utilisateur courant :
 * - projets dont je suis propriétaire
 * - projets où je suis membre invité
 */
async function fetchProjectMembers() {
  try {
    if (!STATE.userId) { STATE.projectMembers = []; STATE.pendingInvitations = []; return; }
    const all = await _getProjectMembersCached();
    // Membres des projets que je possède (pour afficher mon équipe)
    STATE.projectMembers = all.filter(m =>
      m.owner_user_id === STATE.userId || m.member_user_id === STATE.userId
    );
    // Invitations en attente que j'ai reçues
    STATE.pendingInvitations = all.filter(m =>
      m.member_user_id === STATE.userId && m.status === 'pending'
    );
  } catch(e) {
    console.warn('[Collab] fetchProjectMembers failed:', e.message);
    STATE.projectMembers    = STATE.projectMembers    || [];
    STATE.pendingInvitations = STATE.pendingInvitations || [];
  }
}

/**
 * Charge les projets partagés avec l'utilisateur courant.
 * Fusionne avec STATE.projects sans doublons.
 */
async function fetchSharedProjects() {
  try {
    if (!STATE.userId) return;
    const all = await _getProjectMembersCached();
    // Memberships acceptés où je suis membre (pas propriétaire)
    const accepted = all.filter(m =>
      m.member_user_id === STATE.userId &&
      m.status === 'accepted'
    );
    if (accepted.length === 0) return;

    // Charger les projets correspondants
    const allProjects = await apiGet('projects');
    for (const membership of accepted) {
      const proj = allProjects.find(p => p.id === membership.project_id);
      if (proj && !STATE.projects.find(p => p.id === proj.id)) {
        // Marquer le projet comme partagé (pas propriétaire)
        proj._shared = true;
        proj._myRole = membership.role;
        STATE.projects.push(proj);
      }
    }
  } catch(e) {
    console.warn('[Collab] fetchSharedProjects failed:', e.message);
  }
}

/**
 * Charge les CRs des projets partagés.
 * IMPORTANT : rafraîchit aussi les CRs partagés DÉJÀ présents dans STATE.reports
 * (sinon les modifs des collaborateurs ne sont jamais visibles après le premier
 * chargement). Remplace systématiquement chaque CR partagé par la version distante.
 */
async function fetchSharedReports() {
  try {
    if (!STATE.userId) return;
    const sharedProjects = STATE.projects.filter(p => p._shared);
    if (sharedProjects.length === 0) {
      // Nettoyer les éventuels reliquats shared si plus aucun projet partagé
      STATE.reports = STATE.reports.filter(r => !r._shared);
      return;
    }

    const sharedProjectIds = new Set(sharedProjects.map(p => p.id));
    const allReports = await apiGet('meeting_reports');
    const freshShared = allReports
      .filter(r => sharedProjectIds.has(r.project_id))
      .map(r => ({ ...r, _shared: true }));

    // Retirer TOUS les anciens shared puis réinjecter la liste fraîche
    const nonShared = STATE.reports.filter(r => !r._shared);
    const freshIds  = new Set(freshShared.map(r => r.id));

    // Fusionner : non-shared + shared frais, en évitant les doublons
    // (un CR peut être dans les 2 si l'utilisateur a aussi un membership à son propre projet)
    STATE.reports = [
      ...nonShared.filter(r => !freshIds.has(r.id)),
      ...freshShared,
    ];
  } catch(e) {
    console.warn('[Collab] fetchSharedReports failed:', e.message);
  }
}

/* =====================================================
   INVITATION D'UN MEMBRE
   ===================================================== */

/**
 * Ouvre la modale d'invitation pour le projet courant.
 */
function openCollabModal(projectId) {
  const project = STATE.projects.find(p => p.id === projectId);
  if (!project) return;

  // Vérifier que l'utilisateur est bien propriétaire
  if (project._shared && project._myRole !== 'editor') {
    showToast(t('invite_owner_only'), 'warning');
    return;
  }

  STATE._collabProjectId = projectId;

  // Rendre la liste des membres actuels
  renderCollabMembersList(projectId);

  // Charger le lien d'invitation
  _renderInviteLink(projectId);

  // Reset formulaire
  const inp = document.getElementById('collabInviteInput');
  if (inp) inp.value = '';
  const err = document.getElementById('collabInviteError');
  if (err) err.textContent = '';

  // Titre
  const title = document.getElementById('collabModalTitle');
  if (title) title.textContent = `${t('collab_modal_title')} — ${project.name}`;

  openModal('modalCollab');
}

/**
 * Lance la recherche et l'invitation d'un utilisateur.
 */
async function inviteMember() {
  const input = document.getElementById('collabInviteInput');
  const roleEl = document.getElementById('collabInviteRole');
  const errEl  = document.getElementById('collabInviteError');
  const btn    = document.getElementById('btnCollabInvite');

  const queryRaw = (input?.value || '').trim();
  const query  = _normCollab(queryRaw);
  const role   = roleEl?.value || 'editor';

  if (errEl) errEl.textContent = '';

  if (!query) {
    if (errEl) errEl.textContent = t('collab_invite_empty');
    return;
  }

  const projectId = STATE._collabProjectId;
  if (!projectId) return;

  // Vérifier qu'on n'invite pas soi-même
  const myProfile = STATE.userProfile;
  if (myProfile) {
    const myUsername = (myProfile.username || '').toLowerCase();
    const myEmail    = (myProfile.email    || '').toLowerCase();
    if (query === myUsername || (myEmail && query === myEmail)) {
      if (errEl) errEl.textContent = t('collab_invite_self');
      return;
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = t('collab_invite_searching'); }

  try {
    // Chercher l'utilisateur dans les profils
    const allProfiles = await _getUserProfilesCached();
    const target = allProfiles.find(p =>
      _normCollab(p.username) === query ||
      _normCollab(p.email) === query
    ) || allProfiles.find(p =>
      _normCollab(p.username).startsWith(query) ||
      _normCollab(`${p.first_name || ''} ${p.last_name || ''}`).includes(query)
    );

    if (!target) {
      if (errEl) errEl.textContent = t('collab_invite_not_found');
      if (btn)  { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ${t('collab_invite_btn_label')}`; }
      return;
    }

    // Vérifier si déjà membre ou invité
    const existingMemberships = await _getProjectMembersCached();
    const alreadyMember = existingMemberships.find(m =>
      m.project_id === projectId &&
      m.member_user_id === target.user_id &&
      m.status !== 'declined'
    );

    if (alreadyMember) {
      const statusLabel = alreadyMember.status === 'pending' ? t('collab_already_pending') : t('collab_already_member');
      if (errEl) errEl.textContent = `${t('collab_already_on_project')} ${statusLabel} ${t('collab_already_on_project2')}`;
      if (btn)  { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ${t('collab_invite_btn_label')}`; }
      return;
    }

    // Créer le membership
    const displayName = `${target.first_name || ''} ${target.last_name || ''}`.trim() || target.username;
    await apiPost('project_members', {
      project_id:          projectId,
      owner_user_id:       STATE.userId,
      member_user_id:      target.user_id,
      member_username:     target.username || '',
      member_display_name: displayName,
      member_email:        target.email || '',
      role:                role,
      status:              'pending',
      invited_by:          STATE.userId,
      invited_at:          new Date().toISOString(),
      accepted_at:         '',
    });

    if (input) input.value = '';
    showToast(`Invitation envoyée à ${displayName} !`, 'success');
    _invalidateCollabCache();
    renderCollabMembersList(projectId);

  } catch(e) {
    console.error('[Collab] inviteMember error:', e);
    if (errEl) errEl.textContent = 'Erreur lors de l\'invitation. Réessayez.';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ${t('invite_btn')}`; }
  }
}

/**
 * Affiche la liste des membres du projet dans la modale.
 */
async function renderCollabMembersList(projectId) {
  const container = document.getElementById('collabMembersList');
  if (!container) return;

  container.innerHTML = '<div class="collab-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</div>';

  try {
    const all = await _getProjectMembersCached();
    const members = all.filter(m => m.project_id === projectId);

    // Propriétaire (soi-même ou autre)
    const project = STATE.projects.find(p => p.id === projectId);
    const ownerProfile = STATE.userProfile;

    let html = '';

    // Ligne du propriétaire
    if (ownerProfile) {
      const ownerName = `${ownerProfile.first_name || ''} ${ownerProfile.last_name || ''}`.trim() || ownerProfile.username || 'Propriétaire';
      const initials  = _collabInitials(ownerName);
      const color     = ownerProfile.avatar_color || '#002D72';
      html += `
        <div class="collab-member-row">
          <div class="collab-avatar" style="background:${_esc(color)}">${_esc(initials)}</div>
          <div class="collab-member-info">
            <div class="collab-member-name">${_esc(ownerName)} <span class="collab-you-badge">vous</span></div>
            <div class="collab-member-sub">${_esc(ownerProfile.username || '')}</div>
          </div>
          <span class="collab-role-badge owner">Propriétaire</span>
        </div>`;
    }

    // Membres invités
    if (members.length === 0) {
      html += `<div class="collab-empty">${t('no_members')}<br>${t('invite_hint')}</div>`;
    } else {
      for (const m of members) {
        const name     = m.member_display_name || m.member_username || '—';
        const initials = _collabInitials(name);
        const color    = _collabAvatarColor(m.member_user_id);
        const statusClass = m.status === 'accepted' ? 'accepted' : m.status === 'declined' ? 'declined' : 'pending';
        const statusLabel = m.status === 'accepted' ? 'Accepté' : m.status === 'declined' ? 'Refusé' : 'En attente';
        const roleLabel   = m.role === 'editor' ? 'Éditeur' : m.role === 'viewer' ? 'Lecteur' : m.role;
        // Est-ce le membre courant (lui-même) ?
        const isMe = m.member_user_id === STATE.userId;

        html += `
          <div class="collab-member-row" id="collabRow_${_esc(m.id)}">
            <div class="collab-avatar" style="background:${color}">${_esc(initials)}</div>
            <div class="collab-member-info">
              <div class="collab-member-name">${_esc(name)}${isMe ? ' <span class="collab-you-badge">vous</span>' : ''}</div>
              <div class="collab-member-sub">${_esc(m.member_username || m.member_email || '')}</div>
            </div>
            <div class="collab-member-actions">
              <span class="collab-status-badge ${statusClass}">${statusLabel}</span>
              ${!isMe ? `<select class="collab-role-select" onchange="updateMemberRole('${_esc(m.id)}', this.value)" title="Modifier le rôle">
                <option value="editor"  ${m.role==='editor' ?'selected':''}>${t('role_editor')}</option>
                <option value="viewer"  ${m.role==='viewer' ?'selected':''}>${t('role_viewer')}</option>
              </select>` : `<span class="collab-role-badge ${m.role}">${roleLabel}</span>`}
              ${isMe
                ? `<button class="collab-remove-btn collab-leave-btn" onclick="leaveProject('${_esc(m.project_id)}')" title="${t('leave_this_project')}">
                    <i class="fa-solid fa-right-from-bracket"></i>
                  </button>`
                : `<button class="collab-remove-btn" onclick="removeMember('${_esc(m.id)}', '${_esc(name)}')" title="${t('remove_member')}">
                    <i class="fa-solid fa-user-minus"></i>
                  </button>`
              }
            </div>
          </div>`;
      }
    }

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div class="collab-empty">${t('collab_load_error')}</div>`;
    console.error('[Collab] renderCollabMembersList error:', e);
  }
}

/**
 * Met à jour le rôle d'un membre.
 */
async function updateMemberRole(membershipId, newRole) {
  try {
    await apiPatch('project_members', membershipId, { role: newRole });
    _invalidateCollabCache();
    showToast(t('role_updated_ok'), 'success');
  } catch(e) {
    showToast(t('role_update_err'), 'error');
    console.error('[Collab] updateMemberRole error:', e);
  }
}

/**
 * Retire un membre du projet (action du propriétaire ou d'un éditeur).
 */
async function removeMember(membershipId, memberName) {
  const confirmed = await confirmAction(
    `${t('remove_member')} — ${memberName}`,
    t('confirm') + '?',
    t('remove_member'),
    'danger'
  );
  if (!confirmed) return;

  try {
    await apiDelete('project_members', membershipId);
    _invalidateCollabCache();
    const row = document.getElementById(`collabRow_${membershipId}`);
    if (row) row.remove();
    showToast(`${memberName} ${t('member_removed')}`, 'success');
    // Rafraîchir état global + grille dashboard
    await fetchProjectMembers();
    const pid = STATE._collabProjectId;
    if (pid && typeof renderPdCollabMembers === 'function') {
      renderPdCollabMembers(pid);
    }
  } catch(e) {
    showToast(t('member_remove_error'), 'error');
    console.error('[Collab] removeMember error:', e);
  }
}

/**
 * Quitter un projet partagé (action du membre lui-même depuis Mon Espace
 * ou depuis le tableau de bord du projet partagé).
 */
async function leaveProject(projectId) {
  const project = STATE.projects.find(p => p.id === projectId);
  const projName = project ? project.name : '';

  const confirmed = await confirmAction(
    `${t('leave_project_title').replace('?', '')} "${projName}" ?`,
    t('leave_project_msg'),
    t('leave_btn'),
    'danger'
  );
  if (!confirmed) return;

  try {
    // Trouver le membership
    const all = await _getProjectMembersCached(true);
    const membership = all.find(m =>
      m.project_id    === projectId &&
      m.member_user_id === STATE.userId &&
      m.status !== 'declined'
    );
    if (!membership) {
      showToast(t('membership_not_found_err'), 'error');
      return;
    }
    await apiDelete('project_members', membership.id);
    _invalidateCollabCache();

    // Retirer le projet et ses CRs du STATE local
    STATE.projects = STATE.projects.filter(p => p.id !== projectId);
    STATE.reports  = STATE.reports.filter(r => r.project_id !== projectId);

    showToast(`${t('project_left_ok')} "${projName}".`, 'success');
    await fetchProjectMembers();

    // Fermer la modale si ouverte
    closeModal('modalCollab');

    // Naviguer vers le dashboard global
    if (typeof renderSidebar === 'function')   renderSidebar();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof showView === 'function')        showView('viewDashboard');
    if (typeof setBreadcrumb === 'function')   setBreadcrumb([t('breadcrumb_dashboard')]);

  } catch(e) {
    showToast(t('project_left_err'), 'error');
    console.error('[Collab] leaveProject error:', e);
  }
}
window.leaveProject = leaveProject;

/* =====================================================
   ACCEPTATION / REFUS DEPUIS MON ESPACE
   ===================================================== */

/**
 * Accepte une invitation.
 */
async function acceptInvitation(membershipId) {
  try {
    await apiPatch('project_members', membershipId, {
      status:      'accepted',
      accepted_at: new Date().toISOString(),
    });
    _invalidateCollabCache();
    showToast(t('invitation_accepted_ok'), 'success');
    // Recharger projets + CRs partagés
    await fetchProjectMembers();
    await fetchSharedProjects();
    await fetchSharedReports();
    renderSidebar();
    renderPendingInvitationsPanel();
  } catch(e) {
    showToast(t('invitation_accept_err'), 'error');
    console.error('[Collab] acceptInvitation error:', e);
  }
}

/**
 * Décline une invitation.
 */
async function declineInvitation(membershipId) {
  try {
    await apiPatch('project_members', membershipId, { status: 'declined' });
    _invalidateCollabCache();
    showToast(t('invitation_declined_ok'), 'info');
    await fetchProjectMembers();
    renderPendingInvitationsPanel();
  } catch(e) {
    showToast(t('invitation_decline_err'), 'error');
    console.error('[Collab] declineInvitation error:', e);
  }
}

/**
 * Rend le panneau des invitations en attente dans Mon Espace.
 */
async function renderPendingInvitationsPanel() {
  const container = document.getElementById('pendingInvitationsPanel');
  if (!container) return;

  await fetchProjectMembers();
  const pending = STATE.pendingInvitations || [];

  // Indicateur badge dans le menu Mon Espace
  const badge = document.getElementById('invitationsBadge');
  if (badge) {
    if (pending.length > 0) {
      badge.textContent = pending.length;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (pending.length === 0) {
    container.innerHTML = `
      <div class="collab-empty-invitations">
        <i class="fa-solid fa-envelope-open" style="font-size:2rem;opacity:.3;display:block;margin-bottom:8px;"></i>
        ${t('no_invitations_pending')}
      </div>`;
    return;
  }

  // Pour chaque invitation, récupérer le nom du projet
  let html = '';
  try {
    const allProjects = await apiGet('projects');
    for (const inv of pending) {
      const proj    = allProjects.find(p => p.id === inv.project_id);
      const projName = proj ? proj.name : t('unknown_project');
      const projColor = proj ? (proj.color || '#002D72') : '#002D72';
      const roleLabel = inv.role === 'editor' ? t('role_editor') : t('role_viewer');

      // Chercher l'invitant
      const allProfiles = STATE._allProfilesCache || [];
      const inviter = allProfiles.find(p => p.user_id === inv.invited_by);
      const inviterName = inviter
        ? `${inviter.first_name || ''} ${inviter.last_name || ''}`.trim() || inviter.username
        : 'Un collaborateur';

      html += `
        <div class="collab-invitation-card" id="invCard_${_esc(inv.id)}">
          <div class="collab-invitation-dot" style="background:${_esc(projColor)}"></div>
          <div class="collab-invitation-info">
            <div class="collab-invitation-project">${_esc(projName)}</div>
            <div class="collab-invitation-meta">
              Invité par <strong>${_esc(inviterName)}</strong> · Rôle : <strong>${_esc(roleLabel)}</strong>
            </div>
            <div class="collab-invitation-date">${_formatInvDate(inv.invited_at)}</div>
          </div>
          <div class="collab-invitation-actions">
            <button class="btn-collab-accept" onclick="acceptInvitation('${_esc(inv.id)}')">
              <i class="fa-solid fa-check"></i> Accepter
            </button>
            <button class="btn-collab-decline" onclick="declineInvitation('${_esc(inv.id)}')">
              <i class="fa-solid fa-xmark"></i> Décliner
            </button>
          </div>
        </div>`;
    }
  } catch(e) {
    html = `<div class="collab-empty">${t('invitations_load_error')}</div>`;
  }

  container.innerHTML = html;
}

/* =====================================================
   BADGE NOTIFICATION SIDEBAR
   ===================================================== */

/**
 * Met à jour le badge du nombre d'invitations en attente
 * dans la sidebar / widget utilisateur.
 */
async function updateInvitationsBadge() {
  try {
    if (!STATE.userId) return;
    const all = await _getProjectMembersCached(true);
    const pending = all.filter(m =>
      m.member_user_id === STATE.userId && m.status === 'pending'
    );
    STATE.pendingInvitations = pending;

    const badge = document.getElementById('invitationsBadge');
    const sidebarBadge = document.getElementById('sidebarInvitationsBadge');
    [badge, sidebarBadge].forEach(b => {
      if (!b) return;
      if (pending.length > 0) {
        b.textContent = pending.length;
        b.style.display = 'inline-flex';
      } else {
        b.style.display = 'none';
      }
    });
  } catch(e) {
    console.warn('[Collab] updateInvitationsBadge failed:', e.message);
  }
}

/* =====================================================
   DROIT D'ÉCRITURE
   ===================================================== */

/**
 * Vérifie si l'utilisateur courant peut modifier un projet.
 * Un propriétaire ou éditeur peut modifier.
 * Un lecteur ne peut pas.
 */
function canEditProject(projectId) {
  const project = STATE.projects.find(p => p.id === projectId);
  if (!project) return false;
  // Propriétaire
  if (!project._shared) return true;
  // Partagé
  return project._myRole === 'editor';
}

/**
 * Vérifie si l'utilisateur courant peut modifier un CR.
 */
function canEditReport(reportId) {
  const report = STATE.reports.find(r => r.id === reportId);
  if (!report) return false;
  if (!report._shared) return true;
  // Partagé → vérifier le rôle sur le projet
  return canEditProject(report.project_id);
}

/* =====================================================
   HELPERS PRIVÉS
   ===================================================== */

function _collabInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  return (parts[0] || '?').substring(0,2).toUpperCase();
}

function _collabAvatarColor(userId) {
  // Générer une couleur déterministe depuis le user_id
  if (!userId) return '#94A3B8';
  const colors = ['#002D72','#E8007D','#0066CC','#00A676','#F59E0B','#7C3AED','#DC2626','#0891B2'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) & 0xFFFFFFFF;
  return colors[Math.abs(hash) % colors.length];
}

function _formatInvDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  } catch { return isoDate; }
}

function _esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* Cache des profils pour éviter les appels répétés */
async function _loadAllProfilesCache() {
  if (!STATE._allProfilesCache) {
    try {
      STATE._allProfilesCache = await apiGet('user_profiles');
    } catch(e) {
      STATE._allProfilesCache = [];
    }
  }
}

/* =====================================================
   CONFIRMACTION HELPER (si absent)
   ===================================================== */
async function confirmAction(title, message, confirmLabel, variant) {
  return new Promise(resolve => {
    const modal = document.getElementById('modalConfirm');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl   = document.getElementById('confirmModalMessage');
    const btnYes  = document.getElementById('btnConfirmAction');
    const btnNo   = document.getElementById('btnCancelConfirm');

    if (!modal || !btnYes || !btnNo) { resolve(true); return; }

    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> ${title}`;
    if (msgEl)   msgEl.textContent = message;
    btnYes.textContent = confirmLabel || t('confirm_lbl');
    btnYes.className   = variant === 'danger' ? 'btn-primary btn-danger' : 'btn-primary';

    const cleanup = () => {
      btnYes.onclick = null;
      btnNo.onclick  = null;
      closeModal('modalConfirm');
    };

    btnYes.onclick = () => { cleanup(); resolve(true);  };
    btnNo.onclick  = () => { cleanup(); resolve(false); };

    openModal('modalConfirm');
  });
}

/* =====================================================
   LIEN D'INVITATION RAPIDE
   ===================================================== */

/**
 * Génère ou récupère le lien d'invitation pour un projet.
 * Le "token" est stocké dans project_members comme un enregistrement spécial
 * avec member_user_id = 'invite_link' et un token dans member_username.
 */
async function generateOrGetInviteLink(projectId) {
  try {
    const all = await _getProjectMembersCached(true);
    // Chercher un lien existant valide
    let existing = all.find(m =>
      m.project_id === projectId &&
      m.member_user_id === 'invite_link' &&
      m.status === 'active'
    );
    if (existing) return existing.member_username; // token stocké ici

    // Générer un nouveau token
    const token = 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
    await apiPost('project_members', {
      project_id:       projectId,
      owner_user_id:    STATE.userId,
      member_user_id:   'invite_link',
      member_username:  token,
      member_display_name: 'Invitation Link',
      member_email:     '',
      role:             'editor',
      status:           'active',
      invited_by:       STATE.userId,
      invited_at:       new Date().toISOString(),
    });
    _invalidateCollabCache();
    return token;
  } catch(e) {
    console.error('[Collab] generateOrGetInviteLink:', e);
    return null;
  }
}

/**
 * Révoque le lien d'invitation actuel et en génère un nouveau.
 */
async function revokeInviteLink() {
  const projectId = STATE._collabProjectId;
  if (!projectId) return;
  try {
    const all = await _getProjectMembersCached(true);
    const existing = all.find(m =>
      m.project_id === projectId &&
      m.member_user_id === 'invite_link' &&
      m.status === 'active'
    );
    if (existing) {
      await apiDelete('project_members', existing.id);
      _invalidateCollabCache();
    }
    // Régénérer
    await _renderInviteLink(projectId);
    if (typeof showToast === 'function') showToast(t('invite_link_new'), 'success');
  } catch(e) {
    if (typeof showToast === 'function') showToast(t('invite_link_revoke_error'), 'error');
  }
}

/**
 * Affiche le lien d'invitation dans la modale collab.
 */
async function _renderInviteLink(projectId) {
  const inp    = document.getElementById('collabInviteLinkInput');
  const status = document.getElementById('collabLinkStatus');
  if (!inp) return;

  inp.value = t('invite_link_generating');
  if (status) status.textContent = '';

  const token = await generateOrGetInviteLink(projectId);
  if (!token) {
    inp.value = t('invite_link_error');
    return;
  }

  // Construire l'URL complète
  const base = window.location.origin + window.location.pathname;
  const url  = `${base}?join=${token}`;
  inp.value = url;
  if (status) {
    status.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#059669"></i> ${t('invite_link_valid')}`;
  }
}

/**
 * Copie le lien d'invitation.
 */
async function copyInviteLink() {
  const inp = document.getElementById('collabInviteLinkInput');
  if (!inp || !inp.value || inp.value === 'Génération…') return;
  try {
    await navigator.clipboard.writeText(inp.value);
    if (typeof showToast === 'function') showToast(t('invite_link_copied'), 'success');
  } catch {
    inp.select();
    document.execCommand('copy');
    if (typeof showToast === 'function') showToast(t('invite_link_copied_short'), 'success');
  }
}

/**
 * Vérifie si un lien d'invitation est dans l'URL et ouvre la modale de rejoindre.
 */
async function checkInviteLinkOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('join');
  if (!token) return;

  // Nettoyer l'URL sans recharger
  history.replaceState({}, '', window.location.pathname);

  // Chercher le membership correspondant
  try {
    const all = await _getProjectMembersCached(true);
    const invite = all.find(m =>
      m.member_user_id === 'invite_link' &&
      m.member_username === token &&
      m.status === 'active'
    );

    if (!invite) {
      if (typeof showToast === 'function') showToast(t('invite_link_invalid'), 'error');
      return;
    }

    // Vérifier qu'on n'est pas déjà membre
    const alreadyMember = all.find(m =>
      m.project_id === invite.project_id &&
      m.member_user_id === STATE.userId &&
      m.status === 'accepted'
    );
    if (alreadyMember) {
      if (typeof showToast === 'function') showToast(t('already_member_project'), 'info');
      return;
    }

    // Récupérer le nom du projet
    const allProjects = await apiGet('projects');
    const project = allProjects.find(p => p.id === invite.project_id);

    // Sauvegarder l'info pour confirmation
    STATE._pendingJoinToken = token;
    STATE._pendingJoinProjectId = invite.project_id;

    // Afficher la modale de confirmation
    const content = document.getElementById('joinByLinkContent');
    const footer  = document.getElementById('joinByLinkFooter');
    if (content) {
      content.innerHTML = `
        <div style="text-align:center;padding:10px 0 20px;">
          <div style="font-size:2.5rem;color:var(--primary);margin-bottom:12px;">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          <h3 style="margin:0 0 8px;font-size:1.05rem;">${_esc(project?.name || 'Projet partagé')}</h3>
          <p style="color:var(--gray-500);font-size:.85rem;margin:0 0 12px;">
            Vous avez été invité à rejoindre ce projet en tant que <strong>Éditeur</strong>.
          </p>
          ${project?.description ? `<p style="color:var(--gray-600);font-size:.78rem;background:var(--gray-50);padding:8px 12px;border-radius:8px;">${_esc(project.description)}</p>` : ''}
        </div>`;
    }
    if (footer) footer.style.display = 'flex';
    openModal('modalJoinByLink');

  } catch(e) {
    console.error('[Collab] checkInviteLinkOnLoad:', e);
    if (typeof showToast === 'function') showToast(t('join_link_error'), 'error');
  }
}

/**
 * Confirme le rejoindre via lien.
 */
async function confirmJoinByLink() {
  const projectId = STATE._pendingJoinProjectId;
  const token     = STATE._pendingJoinToken;
  if (!projectId || !token) return;

  const btn = document.getElementById('btnConfirmJoinByLink');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejoindre…'; }

  try {
    // Créer le membership
    await apiPost('project_members', {
      project_id:          projectId,
      owner_user_id:       '', // on ne connaît pas l'owner ici
      member_user_id:      STATE.userId,
      member_username:     STATE.userProfile?.username || STATE.userId,
      member_display_name: [STATE.userProfile?.first_name, STATE.userProfile?.last_name].filter(Boolean).join(' ') || STATE.userProfile?.username || 'Utilisateur',
      member_email:        STATE.userProfile?.email || '',
      role:                'editor',
      status:              'accepted',
      invited_by:          'invite_link',
      invited_at:          new Date().toISOString(),
      accepted_at:         new Date().toISOString(),
    });

    closeModal('modalJoinByLink');
    STATE._pendingJoinToken = null;
    STATE._pendingJoinProjectId = null;

    // Recharger les projets partagés
    if (typeof fetchSharedProjects === 'function') await fetchSharedProjects();
    if (typeof fetchSharedReports === 'function') await fetchSharedReports();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderSidebar === 'function') renderSidebar();

    if (typeof showToast === 'function') showToast(t('join_success'), 'success');
  } catch(e) {
    console.error('[Collab] confirmJoinByLink:', e);
    if (typeof showToast === 'function') showToast(t('join_error'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Rejoindre le projet'; }
  }
}

/* =====================================================
   EXPOSE GLOBALS
   ===================================================== */
window.fetchProjectMembers          = fetchProjectMembers;
window.fetchSharedProjects          = fetchSharedProjects;
window.fetchSharedReports           = fetchSharedReports;
window.openCollabModal              = openCollabModal;
window.inviteMember                 = inviteMember;
window.renderCollabMembersList      = renderCollabMembersList;
window.updateMemberRole             = updateMemberRole;
window.removeMember                 = removeMember;
window.acceptInvitation             = acceptInvitation;
window.declineInvitation            = declineInvitation;
window.renderPendingInvitationsPanel = renderPendingInvitationsPanel;
window.updateInvitationsBadge       = updateInvitationsBadge;
window.canEditProject               = canEditProject;
window.canEditReport                = canEditReport;
window.generateOrGetInviteLink      = generateOrGetInviteLink;
window.copyInviteLink               = copyInviteLink;
window.revokeInviteLink             = revokeInviteLink;
window.checkInviteLinkOnLoad        = checkInviteLinkOnLoad;
window.confirmJoinByLink            = confirmJoinByLink;

/* =====================================================
   CO-ÉDITION TEMPS RÉEL — POLLING D1
   =====================================================
   Principe : toutes les 3 secondes, on interroge D1 pour
   vérifier si le CR ouvert a été modifié par quelqu'un d'autre
   (updated_at différent). Si oui, on recharge et notifie.

   Avantages :
   - Fonctionne avec D1 sans WebSocket ni service externe
   - Coût minimal (1 requête GET légère toutes les 3s)
   - Cohérence garantie (D1 est la source de vérité)

   Comportement :
   - Si l'utilisateur est en train de modifier (focus sur un champ),
     on ne rafraîchit pas pour ne pas effacer ses saisies.
   - Une bannière non intrusive apparaît quand une mise à jour est disponible,
     avec un bouton "Recharger" pour appliquer les changements.
   ===================================================== */

const _REALTIME = {
  intervalId:    null,   // setInterval handle
  reportId:      null,   // ID du CR surveillé
  projectId:     null,   // ID du projet
  lastUpdatedAt: null,   // timestamp de la dernière version connue
  userIsEditing: false,  // true si l'utilisateur a le focus sur un champ
  pendingUpdate: null,   // objet CR disponible mais pas encore appliqué
  POLL_INTERVAL: 3000,   // ms entre chaque vérification
};

/**
 * Démarre la surveillance temps réel d'un CR.
 * Appelé depuis openReport().
 */
function startRealtimeSync(reportId, projectId) {
  stopRealtimeSync(); // arrêter tout polling précédent

  _REALTIME.reportId      = reportId;
  _REALTIME.projectId     = projectId;
  _REALTIME.pendingUpdate = null;
  _REALTIME.userIsEditing = false;

  // Récupérer le updated_at initial depuis le STATE
  const cr = STATE.reports.find(r => r.id === reportId);
  _REALTIME.lastUpdatedAt = cr ? (cr.updated_at || 0) : 0;

  // Tracker le focus utilisateur sur les champs du formulaire
  _setupEditingTracker();

  // Démarrer le polling
  _REALTIME.intervalId = setInterval(_pollForUpdates, _REALTIME.POLL_INTERVAL);

  console.log(`[Sync] Surveillance du CR ${reportId} démarrée (poll ${_REALTIME.POLL_INTERVAL}ms)`);
}

/**
 * Arrête la surveillance temps réel.
 * Appelé au changement de CR, fermeture du formulaire, etc.
 */
function stopRealtimeSync() {
  if (_REALTIME.intervalId) {
    clearInterval(_REALTIME.intervalId);
    _REALTIME.intervalId = null;
  }
  _REALTIME.reportId      = null;
  _REALTIME.projectId     = null;
  _REALTIME.lastUpdatedAt = null;
  _REALTIME.pendingUpdate = null;
  _hideSyncBanner();
}

/**
 * Interroge D1 pour vérifier si le CR a été mis à jour.
 */
async function _pollForUpdates() {
  if (!_REALTIME.reportId) return;

  try {
    // Requête légère : récupérer juste le CR par son ID
    const r = await fetch(`${apiBase()}/${encodeURIComponent('meeting_reports')}/${encodeURIComponent(_REALTIME.reportId)}`, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!r.ok) {
      // CR supprimé ou inaccessible
      if (r.status === 404) {
        stopRealtimeSync();
        showToast(t('sync_cr_deleted'), 'warning');
        if (typeof showProjectCRs === 'function' && _REALTIME.projectId) {
          showProjectCRs(_REALTIME.projectId);
        }
      }
      return;
    }

    const remoteCR = await r.json();
    const remoteTs = remoteCR.updated_at || 0;

    // Comparer avec notre version
    if (remoteTs > _REALTIME.lastUpdatedAt) {
      // Vérifier que c'est bien une modification d'un AUTRE utilisateur
      // (si c'est nous qui venons de sauvegarder, on ne veut pas de notification)
      const isOurSave = (remoteTs - _REALTIME.lastUpdatedAt) < 1000 &&
                        remoteCR.last_modified_by === STATE.userId;

      if (!isOurSave) {
        _REALTIME.pendingUpdate = remoteCR;

        if (_REALTIME.userIsEditing) {
          // L'utilisateur est en train d'éditer → afficher une bannière non intrusive
          _showSyncBanner(remoteTS => {
            _applyRemoteUpdate(_REALTIME.pendingUpdate);
          });
        } else {
          // L'utilisateur n'édite pas → appliquer directement avec notification
          _applyRemoteUpdate(remoteRC);
        }
      } else {
        // C'est notre propre sauvegarde → mettre à jour silencieusement le timestamp
        _REALTIME.lastUpdatedAt = remoteTs;
      }
    }
  } catch(e) {
    // Ignorer silencieusement les erreurs réseau — le polling reprendra au prochain tick
    console.debug('[Sync] Erreur poll:', e.message);
  }
}

/**
 * Applique les modifications distantes au formulaire, champ par champ,
 * SANS toucher aux champs actuellement focalisés.
 * Utilise l'API Quill `updateContents(delta)` pour préserver la position du curseur.
 */
function _applyRemoteUpdate(remoteCR) {
  if (!remoteCR || remoteCR.id !== _REALTIME.reportId) return;

  // Mettre à jour le STATE global
  const idx = STATE.reports.findIndex(r => r.id === remoteCR.id);
  if (idx !== -1) STATE.reports[idx] = remoteCR;

  // Mémoriser le timestamp de dernière version connue
  _REALTIME.lastUpdatedAt = remoteCR.updated_at || 0;
  _REALTIME.pendingUpdate = null;
  _hideSyncBanner();

  // MERGE champ-par-champ (fusion non destructive)
  _mergeRemoteFieldsIntoForm(remoteCR);

  // Notification discrète + mise à jour du badge de présence
  const updaterName = remoteCR.last_modified_by_name || t('a_collaborator');
  _showPresenceBadge(updaterName);

  // Toast "untouched" si c'est la première fois qu'on voit cet utilisateur taper
  if (!_REALTIME._lastToastName || _REALTIME._lastToastName !== updaterName || (Date.now() - (_REALTIME._lastToastAt||0)) > 10000) {
    if (typeof showToast === 'function') {
      showToast(`✏️ ${updaterName} ${t('sync_modified_by')}`, 'info');
    }
    _REALTIME._lastToastName = updaterName;
    _REALTIME._lastToastAt   = Date.now();
  }
}

/**
 * Fusion champ-par-champ, focus-aware, Quill-delta-safe.
 *
 * - Pour les <input>/<select> : on ne remplace que si PAS focalisé
 * - Pour les éditeurs Quill : on applique un delta diff entre le contenu
 *   actuel et le contenu distant (préserve curseur + sélection)
 * - Pour participants/actions : on ne remplace que si aucune ligne n'est
 *   en cours d'édition dans la table
 */
function _mergeRemoteFieldsIntoForm(remoteCR) {
  if (!remoteCR) return;

  const _safeSetInput = (id, remoteVal) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (document.activeElement === el) return; // skip si focalisé
    const newVal = remoteVal == null ? '' : String(remoteVal);
    if (el.value !== newVal) el.value = newVal;
  };

  _safeSetInput('fieldMission',      remoteCR.mission_name);
  _safeSetInput('fieldMeetingName',  remoteCR.meeting_name);
  _safeSetInput('fieldDate',         remoteCR.meeting_date);
  _safeSetInput('fieldLocation',     remoteCR.meeting_location);
  _safeSetInput('fieldFacilitator',  remoteCR.meeting_facilitator);
  _safeSetInput('fieldAuthor',       remoteCR.author);
  _safeSetInput('fieldStatus',       remoteCR.status);

  // Éditeur principal (key_points) via Quill delta diff
  _safeUpdateQuill(STATE.quillEditor, remoteCR.key_points_html || '');

  // Sections optionnelles (decisions / risks / budget / next_steps)
  const opt = STATE?._quillEditors || {};
  _safeUpdateQuill(opt.decisions_quill_editor,  remoteCR.decisions_html  || '');
  _safeUpdateQuill(opt.risks_quill_editor,      remoteCR.risks_html      || '');
  _safeUpdateQuill(opt.budget_quill_editor,     remoteCR.budget_html     || '');
  _safeUpdateQuill(opt.next_steps_quill_editor, remoteCR.next_steps_html || '');

  // Participants : ne toucher que si aucune ligne n'est focalisée
  try {
    const partContainer = document.getElementById('participantsList');
    if (partContainer && !partContainer.contains(document.activeElement)) {
      let remoteParts = [];
      try { remoteParts = JSON.parse(remoteCR.participants || '[]'); } catch {}
      const localParts = (typeof collectParticipants === 'function') ? collectParticipants() : [];
      if (!_deepEqualArray(remoteParts, localParts)) {
        if (typeof renderParticipants === 'function') renderParticipants(remoteParts);
      }
    }
  } catch (e) { console.debug('[Sync] participants merge skip:', e.message); }

  // Actions : idem
  try {
    const actTable = document.getElementById('actionsTableBody');
    if (actTable && !actTable.contains(document.activeElement)) {
      let remoteActs = [];
      try { remoteActs = JSON.parse(remoteCR.actions || '[]'); } catch {}
      const localActs = (typeof collectActions === 'function') ? collectActions() : [];
      if (!_deepEqualArray(remoteActs, localActs)) {
        if (typeof renderActions === 'function') renderActions(remoteActs);
      }
    }
  } catch (e) { console.debug('[Sync] actions merge skip:', e.message); }
}

/**
 * Met à jour un éditeur Quill avec du HTML distant en préservant
 * la position du curseur via updateContents(delta).
 * Skip si l'éditeur est focalisé ET s'il a été modifié dans les 500ms qui viennent de passer.
 */
function _safeUpdateQuill(quill, remoteHtml) {
  if (!quill) return;
  try {
    const root = quill.root;
    if (!root) return;

    const currentHtml = root.innerHTML;
    if (currentHtml === remoteHtml) return;

    // Skip si l'utilisateur est en train de taper dans CET éditeur
    const isFocused = document.activeElement && root.contains(document.activeElement);
    const recentlyTyped = (Date.now() - (quill._lastLocalEditAt || 0)) < 700;
    if (isFocused && recentlyTyped) {
      return; // laisser la saisie finir, on réessaiera au prochain poll
    }

    // Convertir le HTML distant en delta Quill, puis calculer le diff
    const remoteDelta  = quill.clipboard.convert({ html: remoteHtml });
    const currentDelta = quill.getContents();
    const diff         = currentDelta.diff(remoteDelta);

    if (diff.ops && diff.ops.length > 0) {
      // Sauvegarder la sélection pour la restaurer après
      const sel = quill.getSelection();
      quill.updateContents(diff, 'silent');
      if (sel) {
        // Restaurer le curseur (peut être un peu décalé si le diff change l'offset)
        try { quill.setSelection(sel.index, sel.length, 'silent'); } catch {}
      }
    }
  } catch (e) {
    console.debug('[Sync] Quill merge error:', e.message);
  }
}

/* Comparaison de tableaux d'objets (ordre-sensible) */
function _deepEqualArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch { return false; }
}

/**
 * Affiche un petit badge "Lucie édite…" pendant 10 secondes.
 */
function _showPresenceBadge(name) {
  const el = document.getElementById('presenceIndicator');
  if (!el) return;
  el.textContent = `${name} édite…`;
  el.style.display = 'inline-flex';
  clearTimeout(_REALTIME._presenceTimer);
  _REALTIME._presenceTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 10000);
}
window._showPresenceBadge = _showPresenceBadge;

/**
 * Configure le suivi du focus utilisateur sur les champs du formulaire.
 */
function _setupEditingTracker() {
  const form = document.getElementById('crForm');
  if (!form) return;

  const onFocus = () => { _REALTIME.userIsEditing = true; };
  const onBlur  = () => {
    // Délai pour éviter les faux-négatifs lors des clics entre champs
    setTimeout(() => {
      if (!document.activeElement || !form.contains(document.activeElement)) {
        _REALTIME.userIsEditing = false;
        // Si une mise à jour est en attente, on peut l'appliquer maintenant
        if (_REALTIME.pendingUpdate) {
          _showSyncBanner();
        }
      }
    }, 300);
  };

  form.addEventListener('focusin',  onFocus);
  form.addEventListener('focusout', onBlur);

  // Aussi tracker l'éditeur Quill
  const quillEl = document.querySelector('.ql-editor');
  if (quillEl) {
    quillEl.addEventListener('focus', onFocus);
    quillEl.addEventListener('blur',  onBlur);
  }
}

/**
 * Affiche la bannière de synchronisation disponible.
 */
function _showSyncBanner() {
  let banner = document.getElementById('syncUpdateBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'syncUpdateBanner';
    banner.className = 'sync-update-banner';
    banner.innerHTML = `
      <div class="sync-banner-content">
        <i class="fa-solid fa-arrows-rotate sync-banner-icon"></i>
        <span class="sync-banner-text">
          <strong>${t('sync_update_title')}</strong>
          <span class="sync-banner-sub">${t('sync_update_sub')}</span>
        </span>
      </div>
      <div class="sync-banner-actions">
        <button class="sync-banner-btn sync-banner-apply" onclick="applyPendingSync()">
          <i class="fa-solid fa-download"></i> ${t('sync_apply_btn')}
        </button>
        <button class="sync-banner-btn sync-banner-dismiss" onclick="dismissPendingSync()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;

    // Insérer avant le formulaire
    const editor = document.getElementById('viewEditor');
    if (editor) {
      const topbar = editor.querySelector('.topbar') || editor.querySelector('.breadcrumb-bar');
      if (topbar) topbar.insertAdjacentElement('afterend', banner);
      else editor.prepend(banner);
    }
  }
  banner.style.display = 'flex';
  // Animation d'apparition
  requestAnimationFrame(() => banner.classList.add('sync-banner-visible'));
}

/**
 * Masque la bannière de synchronisation.
 */
function _hideSyncBanner() {
  const banner = document.getElementById('syncUpdateBanner');
  if (!banner) return;
  banner.classList.remove('sync-banner-visible');
  setTimeout(() => { banner.style.display = 'none'; }, 300);
}

/**
 * Applique manuellement la mise à jour en attente (bouton "Appliquer").
 */
function applyPendingSync() {
  if (_REALTIME.pendingUpdate) {
    _applyRemoteUpdate(_REALTIME.pendingUpdate);
  } else {
    _hideSyncBanner();
  }
}

/**
 * Ignore la mise à jour en attente (bouton "×").
 */
function dismissPendingSync() {
  // On met à jour le timestamp pour éviter de re-notifier
  if (_REALTIME.pendingUpdate) {
    _REALTIME.lastUpdatedAt = _REALTIME.pendingUpdate.updated_at || _REALTIME.lastUpdatedAt;
    _REALTIME.pendingUpdate = null;
  }
  _hideSyncBanner();
}

/* =====================================================
   POLLING TEMPS RÉEL — IMPLÉMENTATION FINALE
   =====================================================
   Corrige les bugs de la v1 :
   - Détection "own save" fiable via last_modified_by_id
     (et plus via user_id = propriétaire du CR, qui causait
      le propriétaire à ignorer les modifs des collaborateurs).
   - Merge champ-par-champ focus-aware (voir _mergeRemoteFieldsIntoForm)
   - Poll rapide (1500ms) pour co-édition quasi temps réel
   - Auto-apply silencieux (pas de bannière qui interrompt la saisie)
   ===================================================== */

_REALTIME.POLL_INTERVAL = 1500;

window._pollForUpdates = async function() {
  if (!_REALTIME.reportId) return;

  try {
    const base = (typeof apiBase === 'function') ? apiBase() : 'api/tables';
    const r = await fetch(
      `${base}/meeting_reports/${encodeURIComponent(_REALTIME.reportId)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (!r.ok) {
      if (r.status === 404) {
        stopRealtimeSync();
        if (typeof showToast === 'function') showToast(t('sync_cr_deleted'), 'warning');
        if (typeof showProjectCRs === 'function' && _REALTIME.projectId) {
          showProjectCRs(_REALTIME.projectId);
        }
      }
      return;
    }

    const remoteDoc = await r.json();
    const remoteTs  = remoteDoc.updated_at || 0;

    // Aucun changement → skip
    if (remoteTs <= _REALTIME.lastUpdatedAt) return;

    // --- DÉTECTION "OWN SAVE" ---
    // On ne se base PAS sur user_id (= propriétaire) mais sur
    // last_modified_by_id qui est écrit par chaque éditeur.
    const modifierId = remoteDoc.last_modified_by_id || remoteDoc.last_modified_by || null;
    const isOwnSave  = modifierId && modifierId === STATE.userId;

    if (isOwnSave) {
      // C'est NOTRE propre sauvegarde → on met juste le timestamp à jour
      _REALTIME.lastUpdatedAt = remoteTs;
      return;
    }

    // --- MODIF D'UN AUTRE UTILISATEUR ---
    _REALTIME.pendingUpdate = remoteDoc;
    // Merge immédiat : le merge est focus-aware et préserve le curseur,
    // donc on peut l'appliquer même si l'utilisateur tape dans un autre champ.
    _applyRemoteUpdate(remoteDoc);
  } catch (e) {
    console.debug('[Sync] Erreur poll:', e.message);
  }
};

window.startRealtimeSync = function(reportId, projectId) {
  stopRealtimeSync();
  _REALTIME.reportId      = reportId;
  _REALTIME.projectId     = projectId;
  _REALTIME.pendingUpdate = null;
  _REALTIME.userIsEditing = false;

  const cr = STATE.reports.find(r => r.id === reportId);
  _REALTIME.lastUpdatedAt = cr ? (cr.updated_at || 0) : 0;

  _setupEditingTracker();
  _setupQuillEditTracking();
  _REALTIME.intervalId = setInterval(window._pollForUpdates, _REALTIME.POLL_INTERVAL);
  console.log(`[Sync] ▶ CR ${reportId} surveillé (${_REALTIME.POLL_INTERVAL}ms)`);
};

/**
 * Attache un tracker "dernière frappe locale" sur tous les éditeurs Quill
 * afin que _safeUpdateQuill sache skipper les merges trop récents.
 */
function _setupQuillEditTracking() {
  const trackQuill = (q) => {
    if (!q || q._editTrackerAttached) return;
    q._editTrackerAttached = true;
    q.on('text-change', (_delta, _old, source) => {
      if (source === 'user') {
        q._lastLocalEditAt = Date.now();
      }
    });
  };
  trackQuill(STATE.quillEditor);
  const opt = STATE?._quillEditors || {};
  Object.values(opt).forEach(trackQuill);
}
window._setupQuillEditTracking = _setupQuillEditTracking;

/* Expose le state realtime pour que app.js puisse synchroniser
   son timestamp après chaque auto-save */
window._REALTIME = _REALTIME;

window.startRealtimeSync  = startRealtimeSync;
window.stopRealtimeSync   = stopRealtimeSync;
window.applyPendingSync   = applyPendingSync;
window._applyRemoteUpdate = _applyRemoteUpdate;
window.dismissPendingSync = dismissPendingSync;
