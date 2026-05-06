/* =====================================================
   WAVESTONE CR MASTER – app.js  (v2)
   Gestion principale : auth locale, projets, CRs, formulaire
   ===================================================== */

'use strict';

/* =====================================================
   SETTINGS – inline (avant settings.js)
   ===================================================== */
const DEFAULT_SETTINGS_INLINE = {
  primaryColor: '#002D72',
  accentColor:  '#E8007D',
  font:         'Inter, Arial, sans-serif',
  fontSize:     14,
  orgName:      'Wavestone',
};

function loadSettings() {
  try {
    const saved = localStorage.getItem('wv_settings');
    return saved ? { ...DEFAULT_SETTINGS_INLINE, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS_INLINE };
  } catch { return { ...DEFAULT_SETTINGS_INLINE }; }
}

/* =====================================================
   USER IDENTITY (localStorage — pas de serveur)
   Génère un user_id persistant pour isoler les données.
   ===================================================== */
function getOrCreateUserId() {
  let uid = localStorage.getItem('wv_user_id');
  if (!uid) {
    uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('wv_user_id', uid);
  }
  return uid;
}

/* ---- État global ---- */
const STATE = {
  projects:            [],
  reports:             [],
  currentProjectId:    null,
  currentReportId:     null,
  quillEditor:         null,
  settings:            loadSettings(),
  userId:              null,          // sera défini après auth
  userProfile:         null,
  authSession:         null,
  participantProfiles: [],            // cache des profils participants
  projectMembers:      [],            // memberships co-édition
  pendingInvitations:  [],            // invitations reçues en attente
  _collabProjectId:    null,          // projet ouvert dans la modale collab
  _allProfilesCache:   null,          // cache user_profiles pour collab
};

const _PROJECT_PREFETCH = {
  byProject: new Map(),
  inflight: null,
};

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Failsafe : si rien ne s'affiche au bout de 3s, forcer l'écran de login
  const failsafeTimer = setTimeout(() => {
    const login = document.getElementById('loginScreen');
    const app   = document.getElementById('appRoot');
    if (login && login.style.display === 'none' && app && app.style.display === 'none') {
      login.style.display = 'flex';
    }
  }, 3000);

  // Vérifier silencieusement que le proxy Cloudflare fonctionne
  setTimeout(_checkApiConnectivity, 2000);

  try {
    applySettings(STATE.settings);
    await loadLogo();

    // Vérification d'authentification — auth.js doit être chargé avant app.js
    if (typeof checkAuthAndInit === 'function') {
      const authenticated = await checkAuthAndInit();
      clearTimeout(failsafeTimer);
      if (!authenticated) {
        // Initialiser quill en arrière-plan pour le formulaire après connexion
        setTimeout(() => initQuill(), 100);
        bindEvents(); // bind les events (nécessaire pour les modales)
        return; // Stopper ici — l'écran de login est visible
      }
    } else {
      // auth.js non chargé — afficher directement l'app
      clearTimeout(failsafeTimer);
    }

    // fetchProjects doit finir avant fetchReports (fetchReports filtre sur STATE.projects)
    await Promise.allSettled([fetchProjects(), fetchUserProfile()]);
    await fetchReports();
    // Charger les projets/CRs partagés via co-édition AVANT les profils de participants
    // (pour que fetchParticipantProfiles puisse inclure les profils des projets partagés)
    if (typeof fetchSharedProjects === 'function') {
      // fetchSharedProjects DOIT finir avant fetchSharedReports
      // (fetchSharedReports lit STATE.projects pour trouver les projets _shared)
      await fetchSharedProjects();
      await Promise.allSettled([fetchSharedReports(), fetchProjectMembers()]);
    }
    // Les profils sont chargés après, afin d'inclure ceux des projets partagés
    await fetchParticipantProfiles();
    renderSidebar();
    renderDashboard();
    showView('viewDashboard');
    bindEvents();
    initQuill();
    updateUserWidget();
    if (typeof initSettingsModal === 'function') initSettingsModal();
    // Mise à jour badge invitations
    if (typeof updateInvitationsBadge === 'function') updateInvitationsBadge();
    // Vérifier si l'URL contient un lien d'invitation
    if (typeof checkInviteLinkOnLoad === 'function') checkInviteLinkOnLoad();
    clearTimeout(failsafeTimer);
  } catch(err) {
    console.error('[CR Master] Erreur init:', err);
    clearTimeout(failsafeTimer);
    // Afficher l'écran de login en cas d'erreur critique
    const login = document.getElementById('loginScreen');
    const app   = document.getElementById('appRoot');
    if (login && login.style.display === 'none' && app && app.style.display === 'none') {
      login.style.display = 'flex';
    }
  }
});

/* =====================================================
   API HELPERS — Cloudflare D1
   =====================================================
   Architecture : Browser → Cloudflare Function → D1
   En sandbox Genspark : chemin 'tables' (API native)
   En production Cloudflare : chemin 'api/tables' → D1
   Pas de proxy externe, pas de CORS, pas de Genspark.
   ===================================================== */

const _IS_GENSPARK = window.location.hostname.includes('genspark.ai');

function apiBase() {
  return _IS_GENSPARK ? 'tables' : 'api/tables';
}

/* Diagnostic rapide — tapez apiDiag() dans la console F12 */
window.apiDiag = async function() {
  console.group('%c[API DIAG — D1]', 'background:#002D72;color:#fff;padding:2px 6px;border-radius:3px');
  console.log('Mode :', _IS_GENSPARK ? 'Sandbox Genspark' : 'Cloudflare D1');
  console.log('Base URL :', apiBase());
  try {
    const r    = await fetch(`${apiBase()}/user_profiles?limit=1`, { headers: { 'Content-Type': 'application/json' } });
    const text = await r.text();
    let body   = {};
    try { body = JSON.parse(text); } catch(e) {}

    console.log('HTTP status :', r.status);
    console.log('Réponse brute :', text.substring(0, 500));

    if (r.ok) {
      console.log(`✅ D1 opérationnel — ${body.total ?? 0} profil(s) en base`);
    } else if (r.status === 503) {
      console.error('❌ D1 non lié :', body.message || 'Déployez avec --rebuild-db pour que Genspark crée la base D1.');
    } else if (r.status === 500) {
      console.error('❌ Erreur interne D1 :', body.message || body.error || text);
      console.error('→ Redéployez avec --rebuild-db si la base n\'existe pas encore.');
    } else {
      console.error(`❌ HTTP ${r.status} :`, body);
    }
  } catch(e) { console.error('❌ Exception :', e.message); }
  console.groupEnd();
};

/* Vérification silencieuse au démarrage */
async function _checkApiConnectivity() {
  if (_IS_GENSPARK) return;
  try {
    const r = await fetch(`${apiBase()}/user_profiles?limit=1`, { headers: { 'Content-Type': 'application/json' } });
    if (r.ok) {
      console.log('[API] ✅ Cloudflare D1 opérationnel');
    } else {
      const b = await r.json().catch(() => ({}));
      if (b.error === 'D1_NOT_CONFIGURED') {
        console.warn('[API] ⚠️ D1 non configuré — redéployez avec --rebuild-db');
      } else {
        console.warn('[API] ⚠️', r.status, b.message || b.error || '');
      }
    }
  } catch(e) {
    console.warn('[API] ⚠️ Function injoignable :', e.message);
  }
}

/* Options fetch */
function _fetchOpts(extra = {}) {
  return { ...extra, headers: { 'Content-Type': 'application/json', ...(extra.headers||{}) } };
}

/* _apiFetch — direct, sans fallback */
async function _apiFetch(url, opts = {}) {
  return fetch(url, _fetchOpts(opts));
}

async function apiGet(table, params = '') {
  try {
    const r = await _apiFetch(`${apiBase()}/${table}?limit=500${params ? '&'+params : ''}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return d.data || [];
  } catch(e) {
    console.warn(`[API] GET ${table} failed:`, e.message);
    return [];
  }
}
async function apiPost(table, body) {
  const r = await _apiFetch(`${apiBase()}/${table}`,
    { method:'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} on POST ${table}`);
  return r.json();
}
async function apiPut(table, id, body) {
  const r = await _apiFetch(`${apiBase()}/${table}/${id}`,
    { method:'PUT', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} on PUT ${table}/${id}`);
  return r.json();
}
async function apiPatch(table, id, body) {
  const r = await _apiFetch(`${apiBase()}/${table}/${id}`,
    { method:'PATCH', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} on PATCH ${table}/${id}`);
  return r.json();
}
async function apiDelete(table, id) {
  try {
    const r = await _apiFetch(`${apiBase()}/${table}/${id}`,
      { method:'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
  } catch(e) {
    console.warn(`[API] DELETE ${table}/${id} failed:`, e.message);
  }
}

/* =====================================================
   FETCH DATA (filtrés par user_id)
   ===================================================== */
async function fetchProjects() {
  try {
    if (!STATE.userId) { STATE.projects = []; return; }
    const all = await apiGet('projects');
    // Conserver uniquement mes projets propres (les partagés sont chargés via fetchSharedProjects)
    const myProjects = all.filter(p => p.user_id === STATE.userId);
    // Garder les projets partagés déjà chargés (marqués _shared)
    const shared = STATE.projects.filter(p => p._shared);
    STATE.projects = [...myProjects, ...shared];
  } catch(e) {
    console.warn('[CR Master] fetchProjects failed:', e.message);
    STATE.projects = STATE.projects || [];
  }
}
async function fetchReports() {
  try {
    if (!STATE.userId) { STATE.reports = []; return; }
    const all = await apiGet('meeting_reports');
    // Inclure les CRs que j'ai créés ET les CRs de collaborateurs dans mes propres projets
    const myProjectIds = new Set(
      STATE.projects.filter(p => !p._shared).map(p => p.id)
    );
    const myReports = all.filter(r =>
      r.user_id === STATE.userId || myProjectIds.has(r.project_id)
    );
    // Garder les CRs partagés déjà chargés
    const shared = STATE.reports.filter(r => r._shared);
    STATE.reports = [...myReports, ...shared];
  } catch(e) {
    console.warn('[CR Master] fetchReports failed:', e.message);
    STATE.reports = STATE.reports || [];
  }
}
async function fetchUserProfile() {
  try {
    const all = await apiGet('user_profiles');
    STATE.userProfile = all.find(p => p.user_id === STATE.userId) || null;
  } catch(e) {
    console.warn('[CR Master] fetchUserProfile failed:', e.message);
    STATE.userProfile = null;
  }
}
async function fetchParticipantProfiles() {
  try {
    if (!STATE.userId) { STATE.participantProfiles = []; return; }
    const all = await apiGet('participant_profiles');
    // Les profils sont visibles si :
    //  - je les ai créés (user_id === moi)
    //  - OU ils sont rattachés à un projet auquel j'ai accès (own + shared)
    // Cela permet aux collaborateurs d'un projet de partager les photos
    // et les métadonnées des participants récurrents.
    const accessibleProjectIds = new Set((STATE.projects || []).map(p => p.id));
    STATE.participantProfiles = all.filter(p =>
      p.user_id === STATE.userId ||
      (p.project_id && accessibleProjectIds.has(p.project_id))
    );
  } catch(e) {
    console.warn('[CR Master] fetchParticipantProfiles failed:', e.message);
    STATE.participantProfiles = STATE.participantProfiles || [];
  }
}

/* Trouver le profil d'un participant par son nom (normalisation).
   Priorise : 1) profil du projet courant, 2) profil que je possède, 3) tout autre match. */
function findParticipantProfile(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim().replace(/\s+/g, ' ');
  const matches = STATE.participantProfiles.filter(p =>
    (p.name || '').toLowerCase().trim().replace(/\s+/g, ' ') === key
  );
  if (matches.length === 0) return null;
  const currentPid = STATE.currentProjectId;
  return (
    matches.find(p => p.project_id === currentPid) ||
    matches.find(p => p.user_id === STATE.userId) ||
    matches[0]
  );
}

/* =====================================================
   LOGO
   ===================================================== */
async function loadLogo() {
  const savedLogo   = localStorage.getItem('wv_logo');
  const sidebarLogo = document.getElementById('sidebarLogo');
  if (!sidebarLogo) return;
  sidebarLogo.src            = savedLogo || 'images/wavestone-logo.png';
  sidebarLogo.style.filter   = 'none';
  sidebarLogo.style.mixBlendMode = 'normal';
}

/* =====================================================
   USER WIDGET (sidebar bas)
   ===================================================== */
function updateUserWidget() {
  const p = STATE.userProfile;
  const initials = p ? (p.initials || ((p.first_name||'?')[0] + (p.last_name||'')[0]).toUpperCase()) : '?';
  const displayName = p ? `${p.first_name||''} ${p.last_name||''}`.trim() || 'Mon compte' : 'Mon compte';
  const jobTitle   = p ? (p.job_title || p.organization || '') : 'Configurer mon profil';
  const color      = p ? (p.avatar_color || '#002D72') : '#94A3B8';

  const widget = document.getElementById('userWidget');
  if (widget) {
    const avatarFg = (typeof _bestTextColor === 'function') ? _bestTextColor(color) : '#ffffff';
    widget.innerHTML = `
      <div class="user-avatar" style="background:${color};color:${avatarFg};cursor:pointer" title="Mon Espace" onclick="showMySpaceView()">${esc(initials)}</div>
      <div class="user-info" style="cursor:pointer" onclick="showMySpaceView()">
        <div class="user-name">${esc(displayName)}</div>
        <div class="user-job">${esc(jobTitle)}</div>
      </div>
      <button class="btn-icon" id="btnMySpace" title="Mon espace" style="color:var(--sidebar-fg-muted);flex-shrink:0">
        <i class="fa-solid fa-circle-user"></i>
      </button>`;
    document.getElementById('btnMySpace').addEventListener('click', () => showMySpaceView());
  }
}

/* =====================================================
   MON ESPACE (profil utilisateur)
   ===================================================== */
function showMySpace() {
  const p = STATE.userProfile || {};
  // Remplir les champs modale
  document.getElementById('msFirstName').value   = p.first_name   || '';
  document.getElementById('msLastName').value    = p.last_name    || '';
  document.getElementById('msJobTitle').value    = p.job_title    || '';
  document.getElementById('msOrganization').value= p.organization || STATE.settings.orgName || '';
  document.getElementById('msEmail').value       = p.email        || '';
  document.getElementById('msPhone').value       = p.phone        || '';
  document.getElementById('msAvatarColor').value = p.avatar_color || '#002D72';
  document.getElementById('msAvatarColorHex').value = p.avatar_color || '#002D72';

  // Stats modale
  document.getElementById('msStatProjects').textContent = STATE.projects.length;
  document.getElementById('msStatCRs').textContent      = STATE.reports.length;
  document.getElementById('msStatFinal').textContent    = STATE.reports.filter(r => r.status === 'final').length;
  document.getElementById('msStatDraft').textContent    = STATE.reports.filter(r => r.status === 'draft').length;

  updateAvatarPreview();
  document.getElementById('msUserId').textContent = STATE.userId;
  openModal('modalMySpace');
}

function showMySpaceView() {
  const p = STATE.userProfile || {};
  const color    = p.avatar_color || '#002D72';
  const firstName = p.first_name || '';
  const lastName  = p.last_name  || '';
  const name      = `${firstName} ${lastName}`.trim() || 'Mon compte';
  const initials  = ((firstName||'?')[0] + (lastName||'')[0]).toUpperCase();

  // Hero
  const heroAvatar = document.getElementById('msHeroAvatar');
  if (heroAvatar) { heroAvatar.style.background = color; heroAvatar.textContent = initials; }
  const heroName = document.getElementById('msHeroName');
  if (heroName) heroName.textContent = name;
  const heroRole = document.getElementById('msHeroRole');
  if (heroRole) heroRole.textContent = p.job_title ? `${p.job_title}${p.organization ? ' · ' + p.organization : ''}` : t('configure_profile');
  const heroId = document.getElementById('msHeroId');
  if (heroId) heroId.textContent = t('user_id_prefix') + ' ' + STATE.userId;

  // Stats vue
  const elp = document.getElementById('msViewStatProjects');
  const elc = document.getElementById('msViewStatCRs');
  const elf = document.getElementById('msViewStatFinal');
  const eld = document.getElementById('msViewStatDraft');
  if (elp) elp.textContent = STATE.projects.length;
  if (elc) elc.textContent = STATE.reports.length;
  if (elf) elf.textContent = STATE.reports.filter(r => r.status === 'final').length;
  if (eld) eld.textContent = STATE.reports.filter(r => r.status === 'draft').length;

  // Formulaire
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('msViewFirstName',    p.first_name   || '');
  setVal('msViewLastName',     p.last_name    || '');
  setVal('msViewJobTitle',     p.job_title    || '');
  setVal('msViewOrganization', p.organization || STATE.settings.orgName || '');
  setVal('msViewEmail',        p.email        || '');
  setVal('msViewPhone',        p.phone        || '');
  setVal('msViewAvatarColor',  color);
  setVal('msViewAvatarColorHex', color);

  // Question de sécurité
  const secQ = document.getElementById('msViewSecQuestion');
  if (secQ) secQ.value = p.security_question || '';
  const secA = document.getElementById('msViewSecAnswer');
  if (secA) secA.value = ''; // toujours vide par sécurité

  setBreadcrumb(['Mon Espace']);
  setTopbarActions('');
  showView('viewMySpace');
  STATE.currentProjectId = null;
  STATE.currentReportId  = null;
  renderSidebar();
  // Charger le panneau des invitations
  if (typeof renderPendingInvitationsPanel === 'function') {
    renderPendingInvitationsPanel();
  }
  // Charger le panneau MFA
  if (typeof renderMFAPanel === 'function') {
    renderMFAPanel();
  }
}

/* Scroll vers le panneau des invitations dans Mon Espace */
function scrollToInvitations() {
  const el = document.getElementById('invitationsSection');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.scrollToInvitations = scrollToInvitations;

async function saveMySpace() {
  const firstName   = document.getElementById('msFirstName').value.trim();
  const lastName    = document.getElementById('msLastName').value.trim();
  const jobTitle    = document.getElementById('msJobTitle').value.trim();
  const organization= document.getElementById('msOrganization').value.trim();
  const email       = document.getElementById('msEmail').value.trim();
  const phone       = document.getElementById('msPhone').value.trim();
  const avatarColor = document.getElementById('msAvatarColor').value;
  return _doSaveMySpace({ firstName, lastName, jobTitle, organization, email, phone, avatarColor });
}

async function saveMySpaceView() {
  const firstName   = document.getElementById('msViewFirstName').value.trim();
  const lastName    = document.getElementById('msViewLastName').value.trim();
  const jobTitle    = document.getElementById('msViewJobTitle').value.trim();
  const organization= document.getElementById('msViewOrganization').value.trim();
  const email       = document.getElementById('msViewEmail').value.trim();
  const phone       = document.getElementById('msViewPhone').value.trim();
  const avatarColor = document.getElementById('msViewAvatarColor').value;

  // Question de sécurité (optionnelle — ne modifier que si une réponse est fournie)
  const secQuestion = document.getElementById('msViewSecQuestion')?.value || '';
  const secAnswerRaw = document.getElementById('msViewSecAnswer')?.value.trim() || '';

  await _doSaveMySpace({ firstName, lastName, jobTitle, organization, email, phone, avatarColor, secQuestion, secAnswerRaw });
  showMySpaceView(); // Rafraîchir le hero
}

async function _doSaveMySpace({ firstName, lastName, jobTitle, organization, email, phone, avatarColor, secQuestion, secAnswerRaw }) {
  if (!firstName && !lastName) {
    showToast(t('profile_required'), 'error');
    return false;
  }

  const initials = ((firstName||'?')[0] + (lastName||'')[0]).toUpperCase();
  const payload = {
    user_id: STATE.userId,
    first_name: firstName, last_name: lastName,
    job_title: jobTitle, organization, email, phone,
    initials, avatar_color: avatarColor,
    created_at_label: new Date().toLocaleDateString('fr-FR'),
  };

  // Ajouter la question de sécurité si fournie
  if (secQuestion) payload.security_question = secQuestion;
  // Hasher et ajouter la réponse seulement si une nouvelle réponse est saisie
  if (secQuestion && secAnswerRaw) {
    try {
      payload.security_answer_hash = await (typeof hashSecurityAnswer === 'function'
        ? hashSecurityAnswer(secAnswerRaw)
        : Promise.resolve(secAnswerRaw));
    } catch(e) { console.warn('Hash sécurité:', e); }
  }

  try {
    if (STATE.userProfile && STATE.userProfile.id) {
      STATE.userProfile = await apiPut('user_profiles', STATE.userProfile.id, payload);
    } else {
      STATE.userProfile = await apiPost('user_profiles', payload);
    }
    updateUserWidget();
    closeModal('modalMySpace');

    if (organization && organization !== STATE.settings.orgName) {
      STATE.settings.orgName = organization;
      if (typeof saveSettings === 'function') saveSettings(STATE.settings);
      if (typeof applySettings === 'function') applySettings(STATE.settings);
    }

    // Pré-remplir "Rédacteur" avec le nom du profil si vide
    const authorField = document.getElementById('fieldAuthor');
    if (authorField && !authorField.value) {
      authorField.value = `${firstName} ${lastName}`.trim();
    }

    showToast(t('profile_updated'), 'success');
    return true;
  } catch(err) {
    console.error(err);
    showToast(t('profile_save_error'), 'error');
    return false;
  }
}

function updateAvatarPreview() {
  const color    = document.getElementById('msAvatarColor').value;
  const first    = document.getElementById('msFirstName').value.trim();
  const last     = document.getElementById('msLastName').value.trim();
  const initials = ((first||'?')[0] + (last||'')[0]).toUpperCase();
  const preview  = document.getElementById('msAvatarPreview');
  if (preview) {
    preview.style.background = color;
    preview.textContent = initials;
  }
}

/* =====================================================
   SIDEBAR RENDER
   ===================================================== */
function renderSidebar() {
  const container = document.getElementById('projectsList');
  container.innerHTML = '';
  const search = document.getElementById('searchInput').value.toLowerCase();

  if (STATE.projects.length === 0) {
    container.innerHTML = `<div style="padding:12px 18px;font-size:.78rem;color:var(--sidebar-fg-subtle);text-align:center;">${t('no_project_sidebar')}</div>`;
  }

  // Séparer mes projets et les projets partagés
  const myProjects     = STATE.projects.filter(p => !p._shared);
  const sharedProjects = STATE.projects.filter(p =>  p._shared);

  const renderGroup = (projects, groupLabel) => {
    if (projects.length === 0) return;
    if (groupLabel) {
      const lbl = document.createElement('div');
      lbl.className = 'nav-section-label';
      lbl.textContent = groupLabel;
      container.appendChild(lbl);
    }

    projects.forEach(project => {
      const projectCRs = STATE.reports.filter(r => r.project_id === project.id);
      const filtered   = search
        ? projectCRs.filter(r =>
            (r.meeting_name||'').toLowerCase().includes(search) ||
            (r.mission_name||'').toLowerCase().includes(search) ||
            (r.keywords||'').toLowerCase().includes(search) ||
            (r.meeting_date||'').includes(search))
        : projectCRs;

      const item = document.createElement('div');
      item.className = 'project-item';
      item.dataset.id = project.id;
      const open     = STATE.currentProjectId === project.id;
      const isShared = !!project._shared;
      const roleIcon = isShared
        ? (project._myRole === 'viewer'
            ? '<i class="fa-solid fa-eye" title="Lecteur" style="font-size:.65rem;opacity:.6;margin-left:4px;"></i>'
            : '<i class="fa-solid fa-pen-to-square" title="Éditeur" style="font-size:.65rem;opacity:.6;margin-left:4px;"></i>')
        : '';

      item.innerHTML = `
        <div class="project-header ${open ? 'active' : ''}" data-pid="${project.id}">
          <span class="project-dot" style="background:${project.color||'#002D72'}"></span>
          <span class="project-name" title="${esc(project.name)}">${esc(project.name)}${roleIcon}</span>
          ${!isShared ? `
          <button class="sidebar-action-btn collab-sidebar-btn" data-pid="${project.id}" title="Collaborateurs">
            <i class="fa-solid fa-user-group"></i>
          </button>
          <button class="sidebar-action-btn delete-project-btn" data-pid="${project.id}" title="Supprimer le projet">
            <i class="fa-solid fa-trash-can"></i>
          </button>` : `
          <button class="sidebar-action-btn collab-sidebar-btn" data-pid="${project.id}" title="Voir les collaborateurs">
            <i class="fa-solid fa-user-group"></i>
          </button>`}
          <span class="project-toggle ${open?'open':''}">
            <i class="fa-solid fa-chevron-right"></i>
          </span>
        </div>
        <div class="project-cr-list ${open?'open':''}" id="crList_${project.id}">
          ${filtered.length === 0
            ? `<div class="sidebar-empty-cr">Aucun CR</div>`
            : filtered.map(cr => `
              <div class="cr-item ${STATE.currentReportId===cr.id?'active':''}"
                   data-crid="${cr.id}" data-pid="${project.id}">
                <i class="fa-solid fa-file-lines"></i>
                <span class="cr-item-name">${esc(cr.meeting_name||'Sans titre')}</span>
                <span class="cr-item-actions">
                  ${!isShared ? `
                  <button class="sidebar-cr-btn dup-cr-btn" data-crid="${cr.id}" data-pid="${project.id}" title="Dupliquer">
                    <i class="fa-solid fa-copy"></i>
                  </button>
                  <button class="sidebar-cr-btn del-cr-btn" data-crid="${cr.id}" data-pid="${project.id}" title="Supprimer">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>` : (project._myRole === 'editor' ? `
                  <button class="sidebar-cr-btn del-cr-btn" data-crid="${cr.id}" data-pid="${project.id}" title="Supprimer">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>` : '')}
                </span>
                <span class="cr-badge ${cr.status||'draft'}">${labelStatus(cr.status)}</span>
              </div>`).join('')}
        </div>`;

      // Click header → toggle
      item.querySelector('.project-header').addEventListener('click', (e) => {
        if (e.target.closest('.delete-project-btn, .collab-sidebar-btn, .sidebar-action-btn')) return;
        toggleProject(project.id);
      });

      // Collab sidebar button
      const collabBtn = item.querySelector('.collab-sidebar-btn');
      if (collabBtn) {
        collabBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof openCollabModal === 'function') openCollabModal(project.id);
        });
      }

      // Delete project (seulement si propriétaire)
      const delBtn = item.querySelector('.delete-project-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          confirmDeleteProject(project.id, project.name);
        });
      }

      // CR items
      item.querySelectorAll('.cr-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.cr-item-actions')) return;
          openReport(el.dataset.crid, el.dataset.pid);
        });
      });

      // Dup CR buttons
      item.querySelectorAll('.dup-cr-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          duplicateReport(btn.dataset.crid, btn.dataset.pid);
        });
      });

      // Del CR buttons
      item.querySelectorAll('.del-cr-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          confirmDeleteReport(btn.dataset.crid, btn.dataset.pid);
        });
      });

      container.appendChild(item);
    });
  };

  // Rendre mes projets sans label (section déjà nommée "MES PROJETS")
  renderGroup(myProjects, null);
  // Rendre les projets partagés avec label
  if (sharedProjects.length > 0) {
    renderGroup(sharedProjects, 'PARTAGÉS AVEC MOI');
  }
}

function toggleProject(pid) {
  if (STATE.currentProjectId === pid) {
    STATE.currentProjectId = null;
    STATE.currentReportId  = null;
    // Revenir aux settings globaux quand on ferme un projet
    if (typeof applyProjectSettings === 'function') applyProjectSettings(null);
    renderSidebar();
    renderDashboard();
    showView('viewDashboard');
    setBreadcrumb(['Tableau de bord']);
  } else {
    STATE.currentProjectId = pid;
    STATE.currentReportId  = null;
    // Appliquer les settings du projet ouvert
    if (typeof applyProjectSettings === 'function') applyProjectSettings(pid);
    renderSidebar();
    showProjectCRs(pid);
  }
}

/* =====================================================
   DASHBOARD
   ===================================================== */
/* ── Détection du nom de client dans le nom de projet ── */
function _extractClientName(projectName) {
  if (!projectName) return null;
  // Patterns : "Client - Sujet", "Client / Sujet", "[Client] Sujet", "Sujet (Client)"
  const patterns = [
    /^([^\/\-\[\(]{2,30})\s*[-\/]\s*.+/,        // "BNP Paribas - Observabilité"
    /^\[(.{2,30})\]\s*.+/,                         // "[Société Générale] Projet"
    /^.+\(([^)]{2,30})\)\s*$/,                     // "Projet (Crédit Agricole)"
  ];
  for (const re of patterns) {
    const m = projectName.match(re);
    if (m) return m[1].trim();
  }
  // Sinon : premier(s) mot(s) comme identifiant client (si > 1 mot)
  const words = projectName.trim().split(/\s+/);
  if (words.length >= 2) return words.slice(0, Math.min(3, words.length)).join(' ');
  return projectName.trim();
}

/* ── Construire URL logo via Clearbit + favicon fallback ── */
function _clientLogoUrl(clientName) {
  if (!clientName) return null;
  // Normaliser : retirer accents, mettre en minuscule, extraire domaine potentiel
  const normalized = clientName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');

  // Table de correspondance manuelle pour les clients courants
  const KNOWN_DOMAINS = {
    'bnpparibas':      'bnpparibas.com',
    'bnp':             'bnpparibas.com',
    'societegenerale': 'societegenerale.com',
    'socgen':          'societegenerale.com',
    'creditagricole':  'credit-agricole.com',
    'ca':              null,
    'labanquepostale': 'labanquepostale.fr',
    'banquepostale':   'labanquepostale.fr',
    'lcl':             'lcl.fr',
    'axa':             'axa.com',
    'allianz':         'allianz.com',
    'maif':            'maif.fr',
    'orange':          'orange.com',
    'totalenergies':   'totalenergies.com',
    'total':           'totalenergies.com',
    'airfrance':       'airfrance.com',
    'airbus':          'airbus.com',
    'lvmh':            'lvmh.com',
    'loreal':          'loreal.com',
    'sanofi':          'sanofi.com',
    'michelin':        'michelin.com',
    'psa':             'psa.com',
    'stellantis':      'stellantis.com',
    'renault':         'renault.com',
    'peugeot':         'peugeot.com',
    'edf':             'edf.fr',
    'engie':           'engie.com',
    'sncf':            'sncf.com',
    'ratp':            'ratp.fr',
    'capgemini':       'capgemini.com',
    'sopra':           'soprasteria.com',
    'soprasteria':     'soprasteria.com',
    'ibm':             'ibm.com',
    'microsoft':       'microsoft.com',
    'google':          'google.com',
    'amazon':          'amazon.com',
    'aws':             'aws.amazon.com',
    'salesforce':      'salesforce.com',
    'sap':             'sap.com',
    'oracle':          'oracle.com',
    'accenture':       'accenture.com',
    'deloitte':        'deloitte.com',
    'pwc':             'pwc.com',
    'kpmg':            'kpmg.com',
    'ey':              'ey.com',
    'mckinsey':        'mckinsey.com',
    'maison':          null,
    'banquepopulaire': 'banquepopulaire.fr',
    'ccas':            null,
    'enedis':          'enedis.fr',
    'veolia':          'veolia.com',
    'suez':            'suez.com',
    'bouygues':        'bouygues.com',
    'vinci':           'vinci.com',
    'saint-gobain':    'saint-gobain.com',
    'saintgobain':     'saint-gobain.com',
    'danone':          'danone.com',
    'carrefour':       'carrefour.com',
    'leclerc':         'e.leclerc',
    'decathlon':       'decathlon.com',
    'hermes':          'hermes.com',
  };

  const domain = KNOWN_DOMAINS[normalized] ||
    (clientName.includes('.') ? clientName.toLowerCase() : `${normalized}.com`);

  if (!domain) return null;
  // Clearbit Logo API (gratuit, CORS ok)
  return `https://logo.clearbit.com/${domain}`;
}

/* ── Couleur de fond derivée du nom si pas de logo ── */
function _clientInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function renderDashboard() {
  const totalProjects = STATE.projects.length;
  const totalCRs      = STATE.reports.length;
  const finalCRs      = STATE.reports.filter(r => r.status==='final').length;
  const draftCRs      = STATE.reports.filter(r => r.status==='draft' || !r.status).length;
  const lang          = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';

  // Hero stats enrichis
  document.getElementById('heroStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-val">${totalProjects}</div>
      <div class="stat-label">${lang==='en'?'Projects':'Projets'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${totalCRs}</div>
      <div class="stat-label">${lang==='en'?'Total notes':'CRs totaux'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${finalCRs}</div>
      <div class="stat-label">${lang==='en'?'Finalized':'Finalisés'}</div>
    </div>`;

  const grid = document.getElementById('dashboardGrid');
  if (STATE.projects.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="fa-solid fa-folder-open"></i>
      <h3>${lang==='en'?'No projects yet':'Aucun projet'}</h3>
      <p>${lang==='en'?'Create your first project to start writing notes.':'Créez votre premier projet pour commencer à rédiger des CRs.'}</p>
      <button class="btn-primary" onclick="openModal('modalProject')">
        <i class="fa-solid fa-folder-plus"></i> ${lang==='en'?'Create a project':'Créer un projet'}
      </button></div>`;
    return;
  }

  grid.innerHTML = STATE.projects.map(p => {
    const count     = STATE.reports.filter(r => r.project_id === p.id).length;
    const draftCount= STATE.reports.filter(r => r.project_id === p.id && (r.status==='draft'||!r.status)).length;
    const finalCount= STATE.reports.filter(r => r.project_id === p.id && r.status==='final').length;
    const lastCR    = STATE.reports.filter(r => r.project_id === p.id)
      .sort((a,b) => (b.updated_at||0)-(a.updated_at||0))[0];
    const color     = p.color || '#002D72';

    // Détection client + logo
    const clientName = p.company || _extractClientName(p.name);
    // Priorité : logo_url sauvegardé → Clearbit depuis société → initiales
    const savedLogoUrl = p.logo_url || null;
    const initials   = _clientInitials(clientName);

    // Si logo sauvegardé
    const logoHtml = savedLogoUrl
      ? `<img class="pc-client-logo" 
              src="${savedLogoUrl}" 
              alt="${esc(clientName)}"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
         <div class="pc-client-initials" style="background:${color};display:none">${initials}</div>`
      : `<div class="pc-client-initials" style="background:${color}" 
              data-company="${esc(clientName)}"
              data-pid="${p.id}">${initials}</div>`;

    // Dernier CR label
    const lastLabel = lastCR
      ? (lang==='en' ? 'Updated ' : 'Modifié ') + humanDate(lastCR.updated_at)
      : (p.created_at_label || '');

    // Badges statuts
    const statusBadges = [
      finalCount > 0 ? `<span class="pc-badge pc-badge-final"><i class="fa-solid fa-circle-check"></i>${finalCount} ${lang==='en'?'final':'final'}</span>` : '',
      draftCount > 0 ? `<span class="pc-badge pc-badge-draft"><i class="fa-solid fa-pen"></i>${draftCount} ${lang==='en'?'draft':'brouillon'}</span>` : '',
    ].filter(Boolean).join('');

    // Couleur de la barre latérale
    const isShared = p._shared;
    return `
      <div class="project-card pc-new" data-pid="${p.id}" style="--pc-color:${color}">
        <div class="pc-color-bar" style="background:${color}"></div>
        <div class="pc-header">
          <div class="pc-logo-wrap">
            ${logoHtml}
          </div>
          <div class="pc-header-actions">
            ${isShared ? `<span class="pc-shared-badge"><i class="fa-solid fa-users"></i></span>` : ''}
            <button class="pc-action-btn" onclick="event.stopPropagation();openNewReport('${p.id}')" title="${lang==='en'?'New note':'Nouveau CR'}">
              <i class="fa-solid fa-plus"></i>
            </button>
            <button class="pc-action-btn" onclick="event.stopPropagation();openCollabModal('${p.id}')" title="${lang==='en'?'Invite / Share':'Inviter / Partager'}" style="color:var(--primary)">
              <i class="fa-solid fa-user-plus"></i>
            </button>
            <button class="pc-action-btn pc-action-delete" onclick="event.stopPropagation();confirmDeleteProject('${p.id}','${esc(p.name)}')" title="${lang==='en'?'Delete':'Supprimer'}">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="pc-body" onclick="toggleProject('${p.id}')">
          <div class="pc-name">${esc(p.name)}</div>
          ${p.description ? `<div class="pc-desc">${esc(p.description)}</div>` : ''}
        </div>
        <div class="pc-footer" onclick="toggleProject('${p.id}')">
          <div class="pc-stats">
            <span class="pc-cr-total">
              <i class="fa-solid fa-file-lines"></i>
              ${count} CR${count>1?'s':''}
            </span>
            ${statusBadges}
          </div>
          <div class="pc-last-update">${lastLabel}</div>
        </div>
        <div class="pc-progress-bar">
          <div class="pc-progress-fill" style="width:${count>0?Math.round(finalCount/count*100):0}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');

  // Chargement dynamique des logos manquants (via data-company)
  setTimeout(_loadDynamicLogos, 100);

  // Prefetch des CR au survol pour accélérer le clic.
  document.querySelectorAll('.project-card.pc-new[data-pid]').forEach((card) => {
    const pid = card.getAttribute('data-pid');
    if (!pid) return;
    card.addEventListener('mouseenter', () => _prefetchProjectReports(pid), { passive: true, once: true });
    card.addEventListener('touchstart', () => _prefetchProjectReports(pid), { passive: true, once: true });
  });
}

async function _prefetchProjectReports(projectId) {
  const now = Date.now();
  const lastTs = _PROJECT_PREFETCH.byProject.get(projectId) || 0;
  if ((now - lastTs) < 60000) return;
  _PROJECT_PREFETCH.byProject.set(projectId, now);

  if (_PROJECT_PREFETCH.inflight) return;
  _PROJECT_PREFETCH.inflight = (async () => {
    try {
      await fetchReports();
      if (typeof fetchSharedReports === 'function') await fetchSharedReports();
    } catch {
      // préfetch best-effort
    } finally {
      _PROJECT_PREFETCH.inflight = null;
    }
  })();
}

/* =====================================================
   CHARGEMENT DYNAMIQUE DES LOGOS DU DASHBOARD
   ===================================================== */
function _loadDynamicLogos() {
  const initialsEls = document.querySelectorAll('.pc-client-initials[data-company]');
  initialsEls.forEach(el => {
    const company = el.dataset.company;
    const color   = el.style.background;
    if (!company) return;

    // Construire URLs candidates (Clearbit + Google Favicon)
    const norm = company.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,'').replace(/[^a-z0-9]/g,'');

    const KNOWN = {
      'bnpparibas':'bnpparibas.com','bnp':'bnpparibas.com',
      'societegenerale':'societegenerale.com','socgen':'societegenerale.com',
      'creditagricole':'credit-agricole.com','labanquepostale':'labanquepostale.fr',
      'lcl':'lcl.fr','axa':'axa.com','allianz':'allianz.com','maif':'maif.fr',
      'orange':'orange.com','totalenergies':'totalenergies.com','total':'totalenergies.com',
      'airfrance':'airfrance.com','airbus':'airbus.com',
      'lvmh':'lvmh.com','loreal':'loreal.com','sanofi':'sanofi.com',
      'michelin':'michelin.com','stellantis':'stellantis.com',
      'renault':'renault.com','peugeot':'peugeot.com',
      'edf':'edf.fr','engie':'engie.com','enedis':'enedis.fr',
      'sncf':'sncf.com','ratp':'ratp.fr',
      'capgemini':'capgemini.com','soprasteria':'soprasteria.com','sopra':'soprasteria.com',
      'ibm':'ibm.com','microsoft':'microsoft.com','google':'google.com',
      'amazon':'amazon.com','salesforce':'salesforce.com',
      'sap':'sap.com','oracle':'oracle.com',
      'accenture':'accenture.com','deloitte':'deloitte.com',
      'pwc':'pwc.com','kpmg':'kpmg.com','ey':'ey.com','mckinsey':'mckinsey.com',
      'veolia':'veolia.com','suez':'suez.com','bouygues':'bouygues.com','vinci':'vinci.com',
      'saintgobain':'saint-gobain.com','danone':'danone.com','carrefour':'carrefour.com',
      'decathlon':'decathlon.com','hermes':'hermes.com','wavestone':'wavestone.com',
    };

    const knownDomain = KNOWN[norm];
    const candidates = [];
    if (knownDomain) {
      candidates.push(`https://logo.clearbit.com/${knownDomain}`);
      candidates.push(`https://www.google.com/s2/favicons?domain=${knownDomain}&sz=128`);
    }
    candidates.push(`https://logo.clearbit.com/${norm}.com`);
    candidates.push(`https://logo.clearbit.com/${norm}.fr`);
    candidates.push(`https://www.google.com/s2/favicons?domain=${norm}.com&sz=128`);

    // Essayer de charger le logo
    _tryLoadFirstValidLogoEl(candidates, el, color);
  });
}

function _tryLoadFirstValidLogoEl(urls, initialsEl, fallbackColor) {
  if (!urls.length) return;
  const url  = urls[0];
  const rest = urls.slice(1);

  let tried = false;
  const tryNext = () => {
    if (tried) return; tried = true;
    _tryLoadFirstValidLogoEl(rest, initialsEl, fallbackColor);
  };

  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth >= 16) {
      // Succès : remplacer les initiales par l'image
      const logoImg = document.createElement('img');
      logoImg.src = url;
      logoImg.className = 'pc-client-logo';
      logoImg.alt = initialsEl.dataset.company || initialsEl.textContent;
      logoImg.style.cssText = 'width:40px;height:40px;object-fit:contain;border-radius:6px;background:#fff;padding:2px;box-shadow:0 1px 4px rgba(0,0,0,.1);';
      logoImg.onerror = function() {
        this.style.display = 'none';
        if (initialsEl) initialsEl.style.display = 'flex';
      };
      if (initialsEl && initialsEl.parentNode) {
        initialsEl.parentNode.insertBefore(logoImg, initialsEl);
        initialsEl.style.display = 'none';
      }
    } else {
      tryNext();
    }
  };
  img.onerror = tryNext;
  setTimeout(tryNext, 3500);
  img.src = url;
}

/* =====================================================
   PROJECT CRs LIST
   ===================================================== */
async function showProjectCRs(pid) {
  setUiLoading(true);
  // Arrêter le polling en cours (on n'est plus sur un CR)
  if (typeof stopRealtimeSync === 'function') stopRealtimeSync();
  if (typeof cancelAutoSave === 'function') cancelAutoSave();
  // Mémoriser le projet courant (nécessaire pour chatbot projet, collab, etc.)
  STATE.currentProjectId = pid;
  // Appliquer les settings du projet
  if (typeof applyProjectSettings === 'function') applyProjectSettings(pid);
  const project = STATE.projects.find(p => p.id === pid);
  if (!project) {
    setUiLoading(false);
    return;
  }

  document.getElementById('projectCRsTitle').textContent = project.name;
  document.getElementById('btnNewCRInProject').onclick = () => openNewReport(pid);

  const _renderProjectCRList = () => {
    const reports = STATE.reports.filter(r => r.project_id === pid)
      .sort((a,b) => (b.updated_at||0)-(a.updated_at||0));

    const container = document.getElementById('crListContainer');
    if (reports.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <i class="fa-solid fa-file-circle-plus"></i>
        <h3>Aucun compte-rendu</h3>
        <p>Créez le premier CR de ce projet.</p>
        <button class="btn-primary" onclick="openNewReport('${pid}')">
          <i class="fa-solid fa-plus"></i> Nouveau CR
        </button></div>`;
    } else {
      container.innerHTML = reports.map(cr => `
        <div class="cr-card">
          <div class="cr-card-icon" style="background:${project.color||'#002D72'}" onclick="openReport('${cr.id}','${pid}')">
            <i class="fa-solid fa-file-lines"></i>
          </div>
          <div class="cr-card-info" onclick="openReport('${cr.id}','${pid}')" style="cursor:pointer">
            <div class="cr-card-title">${esc(cr.meeting_name||'Sans titre')}</div>
            <div class="cr-card-meta">
              ${cr.meeting_date?`<span><i class="fa-regular fa-calendar"></i>${formatDate(cr.meeting_date)}</span>`:''}
              ${cr.author?`<span><i class="fa-solid fa-pen-to-square"></i>${esc(cr.author)}</span>`:''}
              ${cr.meeting_location?`<span><i class="fa-solid fa-location-dot"></i>${esc(cr.meeting_location)}</span>`:''}
              <span><i class="fa-solid fa-clock"></i>${humanDate(cr.updated_at)}</span>
            </div>
          </div>
          <div class="cr-card-actions">
            <span class="status-badge ${cr.status||'draft'}">${labelStatus(cr.status)}</span>
            <button class="btn-icon edit" title="Modifier" onclick="openReport('${cr.id}','${pid}')">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button class="btn-icon" title="Dupliquer" onclick="duplicateReport('${cr.id}','${pid}')" style="color:var(--primary-light)">
              <i class="fa-solid fa-copy"></i>
            </button>
            <button class="btn-icon" title="Supprimer" onclick="confirmDeleteReport('${cr.id}','${pid}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>`).join('');
    }
  };

  const _renderProjectCRSkeleton = () => {
    const container = document.getElementById('crListContainer');
    container.innerHTML = `
      <div class="cr-skeleton-card shimmer"></div>
      <div class="cr-skeleton-card shimmer"></div>
      <div class="cr-skeleton-card shimmer"></div>`;
  };

  // Navigation immédiate pour réduire la latence perçue
  setBreadcrumb([
    { label:'Tableau de bord', action:()=>{ STATE.currentProjectId=null; showView('viewDashboard'); renderDashboard(); setBreadcrumb(['Tableau de bord']); } },
    project.name
  ]);
  showView('viewProjectCRs');
  setTopbarActions(`
    <button class="btn-primary" onclick="openNewReport('${pid}')"><i class="fa-solid fa-plus"></i> Nouveau CR</button>
    <button class="btn-secondary" onclick="confirmDeleteProject('${pid}','${esc(project.name)}')"><i class="fa-solid fa-trash-can"></i> Supprimer le projet</button>`);

  // Si aucun CR local pour ce projet, afficher un skeleton pendant le fetch.
  const hasLocalReports = STATE.reports.some(r => r.project_id === pid);
  if (!hasLocalReports) _renderProjectCRSkeleton();

  // Rendu immédiat depuis cache local pour fluidité perçue
  _renderProjectCRList();
  setUiLoading(false);

  // Refresh asynchrone des données puis rerender
  try {
    await fetchReports();
    if (typeof fetchSharedReports === 'function') await fetchSharedReports();
    _renderProjectCRList();
  } catch (e) { /* non bloquant */ }
}

/* =====================================================
   EDITOR
   ===================================================== */
function openNewReport(pid) {
  STATE.currentReportId  = null;
  STATE.currentProjectId = pid;
  // Appliquer les settings du projet
  if (typeof applyProjectSettings === 'function') applyProjectSettings(pid);
  // Arrêter tout polling en cours
  if (typeof stopRealtimeSync === 'function') stopRealtimeSync();
  if (typeof cancelAutoSave === 'function') cancelAutoSave();
  resetForm();
  document.getElementById('exportBar').style.display = 'none';
  const project = STATE.projects.find(p => p.id === pid);
  if (project) document.getElementById('fieldMission').value = project.name;

  // Pré-remplir auteur depuis profil
  if (STATE.userProfile) {
    const name = `${STATE.userProfile.first_name||''} ${STATE.userProfile.last_name||''}`.trim();
    document.getElementById('fieldAuthor').value = name;
  }

  setBreadcrumb([
    { label:'Tableau de bord', action:()=>goToDashboard() },
    { label:project?.name||'Projet', action:()=>showProjectCRs(pid) },
    'Nouveau CR'
  ]);
  showView('viewEditor');
  setTopbarActions('');
  renderSidebar();
}

async function openReport(crid, pid) {
  setUiLoading(true);
  STATE.currentReportId  = crid;
  STATE.currentProjectId = pid;
  // Appliquer les settings du projet
  if (typeof applyProjectSettings === 'function') applyProjectSettings(pid);

  // Arrêter tout polling en cours
  if (typeof stopRealtimeSync === 'function') stopRealtimeSync();
  if (typeof cancelAutoSave === 'function') cancelAutoSave();

  // Nettoyer l'état précédent avant de charger le nouveau CR
  resetForm();

  // Refetch direct du CR pour avoir la version FRAÎCHE du serveur
  // (les collaborateurs ont pu modifier depuis le dernier fetchReports)
  let cr = STATE.reports.find(r => r.id === crid);
  try {
    const base = (typeof apiBase === 'function') ? apiBase() : 'api/tables';
    const r = await fetch(`${base}/meeting_reports/${encodeURIComponent(crid)}`,
      { headers: { 'Content-Type': 'application/json' } });
    if (r.ok) {
      const fresh = await r.json();
      if (fresh && fresh.id) {
        cr = fresh;
        const idx = STATE.reports.findIndex(r2 => r2.id === crid);
        if (idx !== -1) {
          // Préserver le flag _shared s'il existait
          const wasShared = STATE.reports[idx]._shared;
          STATE.reports[idx] = wasShared ? { ...fresh, _shared: true } : fresh;
        } else {
          STATE.reports.push(fresh);
        }
      }
    }
  } catch(e) { /* non bloquant, on garde le cache */ }

  if (!cr) {
    setUiLoading(false);
    return;
  }
  // Rafraîchir les profils participants avant de remplir le formulaire
  fetchParticipantProfiles().then(() => fillForm(cr));
  document.getElementById('exportBar').style.display = 'flex';
  const project = STATE.projects.find(p => p.id === pid);
  setBreadcrumb([
    { label:'Tableau de bord', action:()=>goToDashboard() },
    { label:project?.name||'Projet', action:()=>showProjectCRs(pid) },
    cr.meeting_name||'CR sans titre'
  ]);
  showView('viewEditor');
  setTopbarActions('');
  renderSidebar();
  // Démarrer le polling de co-édition
  if (typeof startRealtimeSync === 'function') startRealtimeSync(crid, pid);
  setUiLoading(false);
}

function fillForm(cr) {
  document.getElementById('fieldMission').value      = cr.mission_name || '';
  document.getElementById('fieldMeetingName').value  = cr.meeting_name || '';
  document.getElementById('fieldDate').value         = cr.meeting_date || '';
  document.getElementById('fieldLocation').value     = cr.meeting_location || '';
  document.getElementById('fieldFacilitator').value  = cr.meeting_facilitator || '';
  document.getElementById('fieldAuthor').value       = cr.author || '';
  document.getElementById('fieldStatus').value       = cr.status || 'draft';
  let participants = []; try { participants = JSON.parse(cr.participants||'[]'); } catch(e){}
  renderParticipants(participants);
  let actions = []; try { actions = JSON.parse(cr.actions||'[]'); } catch(e){}
  renderActions(actions);
  if (STATE.quillEditor) STATE.quillEditor.root.innerHTML = cr.key_points_html || '';

  // Restaurer les sections optionnelles
  if (typeof setOptionalSectionsData === 'function') {
    setOptionalSectionsData({
      decisions:  cr.decisions_html  || '',
      risks:      cr.risks_html      || '',
      budget:     cr.budget_html     || '',
      next_steps: cr.next_steps_html || '',
    });
  }

  // Restaurer le template actif
  if (cr.template_id && cr.template_modules) {
    try {
      const modules = JSON.parse(cr.template_modules);
      STATE._activeTemplate = {
        id: cr.template_id,
        modules,
        isCustom: !['tpl_standard','tpl_copil','tpl_workshop','tpl_quick','tpl_project'].includes(cr.template_id),
      };
    } catch {}
  }
}

function resetForm() {
  document.getElementById('crForm').reset();
  document.getElementById('fieldDate').value = new Date().toISOString().split('T')[0];
  renderParticipants([]);
  renderActions([]);
  if (STATE.quillEditor) STATE.quillEditor.root.innerHTML = '';
  // Réinitialiser les sections optionnelles
  if (typeof setOptionalSectionsData === 'function') {
    setOptionalSectionsData({ decisions:'', risks:'', budget:'', next_steps:'' });
  }
  if (typeof resetModuleLayouts === 'function') resetModuleLayouts();
  STATE._activeTemplate = null;
}

/* =====================================================
   PARTICIPANTS
   ===================================================== */
function renderParticipants(list) {
  const container = document.getElementById('participantsList');
  container.innerHTML = '';
  if (list.length === 0) addParticipantRow(container);
  else list.forEach(p => addParticipantRow(container, p));
}

function addParticipantRow(container, data = {}) {
  const row = document.createElement('div');
  row.className = 'participant-row';

  // Chercher la photo dans le profil enregistré ou dans les données du CR
  const profile = findParticipantProfile(data.name);
  const photo   = data.photo || (profile && profile.photo) || '';
  const color   = (profile && profile.avatar_color) || _participantColor(data.name);
  const initials= _participantInitials(data.name);

  const avatarHtml = photo
    ? `<img src="${esc(photo)}" class="participant-row-avatar" alt="${esc(data.name||'')}" />`
    : `<div class="participant-row-avatar participant-row-avatar-initials" style="background:${esc(color)}">${esc(initials)}</div>`;

  row.innerHTML = `
    <div class="participant-row-avatar-wrap" data-photo="${esc(photo)}">${avatarHtml}</div>
    <input type="text" placeholder="Prénom Nom" value="${esc(data.name||'')}" data-field="name" />
    <input type="text" placeholder="Société / Entité" value="${esc(data.company||'')}" data-field="company" />
    <input type="text" placeholder="Rôle / Fonction" value="${esc(data.role||'')}" data-field="role" />
    <button type="button" class="btn-icon" title="Supprimer" onclick="this.closest('.participant-row').remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>`;

  // Mise à jour avatar en live quand le nom change
  const nameInput = row.querySelector('[data-field="name"]');
  nameInput.addEventListener('input', () => _refreshParticipantAvatar(row));

  container.appendChild(row);
}

function _refreshParticipantAvatar(row) {
  const name = row.querySelector('[data-field="name"]').value.trim();
  const wrap  = row.querySelector('.participant-row-avatar-wrap');
  if (!wrap) return;

  const profile  = findParticipantProfile(name);
  const existingPhoto = wrap.dataset.photo || '';
  const photo    = (profile && profile.photo) ? profile.photo : existingPhoto;
  const color    = (profile && profile.avatar_color) || _participantColor(name);
  const initials = _participantInitials(name);

  if (photo) {
    wrap.innerHTML = `<img src="${esc(photo)}" class="participant-row-avatar" alt="${esc(name)}" />`;
    wrap.dataset.photo = photo;
  } else {
    wrap.dataset.photo = existingPhoto || '';
    wrap.innerHTML = `<div class="participant-row-avatar participant-row-avatar-initials" style="background:${esc(color)}">${esc(initials)}</div>`;
  }
}

function _participantInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  return (parts[0] || '?').substring(0, 2).toUpperCase();
}

function _participantColor(name) {
  const colors = ['#002D72','#E8007D','#0050B3','#6366F1','#8B5CF6','#059669','#D97706','#DC2626'];
  let hash = 0;
  for (let i = 0; i < (name||'').length; i++) hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function collectParticipants() {
  return Array.from(document.querySelectorAll('.participant-row')).map(row => {
    const name    = row.querySelector('[data-field="name"]').value.trim();
    const company = row.querySelector('[data-field="company"]').value.trim();
    const role    = row.querySelector('[data-field="role"]').value.trim();
    const wrap    = row.querySelector('.participant-row-avatar-wrap');
    // Récupérer la photo : depuis le wrap (data-photo), ou depuis le profil enregistré
    const profile = findParticipantProfile(name);
    const photo   = (wrap && wrap.dataset.photo) || (profile && profile.photo) || '';
    return { name, company, role, photo };
  }).filter(p => p.name);
}

/* =====================================================
   ACTIONS TABLE
   ===================================================== */
function renderActions(list) {
  const tbody = document.getElementById('actionsTableBody');
  tbody.innerHTML = '';
  if (list.length === 0) addActionRow(tbody);
  else list.forEach(a => addActionRow(tbody, a));
}

function addActionRow(tbody, data = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Description de l'action…" value="${esc(data.action||'')}" /></td>
    <td><input type="text" placeholder="Responsable" value="${esc(data.owner||'')}" /></td>
    <td><input type="date" value="${esc(data.due||'')}" /></td>
    <td><select class="action-status-sel">
      <option value="todo" ${(data.status||'todo')==='todo'?'selected':''}>À faire</option>
      <option value="wip"  ${data.status==='wip'?'selected':''}>En cours</option>
      <option value="done" ${data.status==='done'?'selected':''}>Fait</option>
      <option value="blocked" ${data.status==='blocked'?'selected':''}>Bloqué</option>
    </select></td>
    <td><button type="button" class="btn-icon" onclick="this.closest('tr').remove()"><i class="fa-solid fa-xmark"></i></button></td>`;
  tbody.appendChild(tr);
}

function collectActions() {
  return Array.from(document.querySelectorAll('#actionsTableBody tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    const sel    = tr.querySelector('select');
    return { action:inputs[0].value.trim(), owner:inputs[1].value.trim(), due:inputs[2].value, status:sel?sel.value:'todo' };
  }).filter(a => a.action);
}

/* =====================================================
   SAVE CR
   ===================================================== */
/* Construit le payload de sauvegarde depuis le formulaire courant.
   Utilisé par saveCR (explicite) et scheduleAutoSave (implicite). */
function _buildCRPayload() {
  const mission = document.getElementById('fieldMission').value.trim();
  const meeting = document.getElementById('fieldMeetingName').value.trim();

  const participants = collectParticipants();
  const actions      = collectActions();
  
  let keyPoints = STATE.quillEditor ? STATE.quillEditor.root.innerHTML : '';
  if (typeof getModuleLayoutContent === 'function') {
    const kpData = getModuleLayoutContent('sectionKeyPoints');
    if (kpData && kpData.layout !== 'text' && kpData.html) {
      keyPoints = kpData.html;
    }
  }

  const optData = typeof getOptionalSectionsData === 'function' ? getOptionalSectionsData() : {};
  const activeTemplate = STATE._activeTemplate || null;

  // Identifier l'utilisateur qui modifie, pour que les autres clients
  // le distinguent de leur propre sauvegarde dans le polling.
  const modifierName = (() => {
    if (STATE.userProfile) {
      const full = `${STATE.userProfile.first_name||''} ${STATE.userProfile.last_name||''}`.trim();
      return full || STATE.userProfile.username || 'Un collaborateur';
    }
    return 'Un collaborateur';
  })();

  return {
    user_id:              STATE.userId,
    project_id:           STATE.currentProjectId,
    mission_name:         mission,
    meeting_name:         meeting,
    meeting_date:         document.getElementById('fieldDate').value,
    meeting_location:     document.getElementById('fieldLocation').value.trim(),
    meeting_facilitator:  document.getElementById('fieldFacilitator').value.trim(),
    author:               document.getElementById('fieldAuthor').value.trim(),
    status:               document.getElementById('fieldStatus').value,
    participants:         JSON.stringify(participants),
    actions:               JSON.stringify(actions),
    key_points_html:      keyPoints,
    decisions_html:       optData.decisions  || '',
    risks_html:           optData.risks      || '',
    budget_html:          optData.budget     || '',
    next_steps_html:      optData.next_steps || '',
    template_id:          activeTemplate?.id || '',
    template_modules:     activeTemplate ? JSON.stringify(activeTemplate.modules) : '',
    last_modified:        new Date().toISOString(),
    last_modified_by_id:  STATE.userId,
    last_modified_by_name: modifierName,
    // Champ hérité (lu par collaboration.js v1) — on le garde pour rétro-compat
    last_modified_by:     STATE.userId,
    keywords:             `${mission} ${meeting} ${participants.map(p=>p.name).join(' ')}`,
    _meta: { mission_required: Boolean(mission && meeting) },
  };
}

async function saveCR(e) {
  if (e && e.preventDefault) e.preventDefault();
  const payload = _buildCRPayload();
  if (!payload._meta.mission_required) {
    showToast(t('mission_required'),'error');
    return;
  }
  delete payload._meta;

  try {
    let saved;
    if (STATE.currentReportId) {
      saved = await apiPut('meeting_reports', STATE.currentReportId, payload);
    } else {
      saved = await apiPost('meeting_reports', payload);
      STATE.currentReportId = saved.id;
      // Démarrer le polling sur le nouveau CR
      if (typeof startRealtimeSync === 'function') startRealtimeSync(saved.id, STATE.currentProjectId);
    }
    // Mettre à jour le timestamp local pour que le polling ne détecte pas notre propre sauvegarde
    if (typeof _REALTIME !== 'undefined') {
      _REALTIME.lastUpdatedAt = saved.updated_at || Date.now();
    }
    await fetchReports();
    renderSidebar();
    renderDashboard();
    document.getElementById('exportBar').style.display = 'flex';
    showToast(t('cr_saved'), 'success');
    _setAutoSaveIndicator('saved');
    const project = STATE.projects.find(p => p.id === STATE.currentProjectId);
    setBreadcrumb([
      { label:t('breadcrumb_dashboard'), action:()=>goToDashboard() },
      { label:project?.name||'Projet', action:()=>showProjectCRs(STATE.currentProjectId) },
      payload.meeting_name
    ]);
  } catch(err) {
    console.error(err);
    showToast(t('cr_save_error'),'error');
    _setAutoSaveIndicator('error');
  }
}

/* =====================================================
   AUTO-SAVE DEBOUNCED
   =====================================================
   Toutes les frappes dans le formulaire déclenchent une sauvegarde
   différée de 1200 ms (debounced). On utilise PATCH pour ne pas
   écraser les champs qu'on n'a pas touchés (merge côté serveur).
   L'auto-save n'affiche pas de toast — juste un petit indicateur
   "Enregistré" à côté du bouton Enregistrer.
   ===================================================== */

const AUTOSAVE = {
  timer:       null,
  inflight:    false,
  queued:      false,
  debounceMs:  1200,
  bound:       false,
};

function cancelAutoSave() {
  clearTimeout(AUTOSAVE.timer);
  AUTOSAVE.timer  = null;
  AUTOSAVE.queued = false;
  const el = document.getElementById('autoSaveIndicator');
  if (el) el.style.display = 'none';
}
window.cancelAutoSave = cancelAutoSave;

function scheduleAutoSave(delayMs) {
  // Ne pas auto-save si pas authentifié ou si pas dans l'éditeur
  if (!STATE.userId) return;
  // Pas d'auto-save si le CR n'a pas encore d'id (il faut saveCR manuel pour créer)
  if (!STATE.currentReportId) return;
  // Pas d'auto-save si le mission/meeting sont vides (invalide)
  const mission = document.getElementById('fieldMission')?.value.trim();
  const meeting = document.getElementById('fieldMeetingName')?.value.trim();
  if (!mission || !meeting) return;

  const d = (delayMs == null) ? AUTOSAVE.debounceMs : delayMs;
  clearTimeout(AUTOSAVE.timer);
  _setAutoSaveIndicator('dirty');
  AUTOSAVE.timer = setTimeout(_runAutoSave, d);
}
window.scheduleAutoSave = scheduleAutoSave;

async function _runAutoSave() {
  if (AUTOSAVE.inflight) {
    AUTOSAVE.queued = true;
    return;
  }
  AUTOSAVE.inflight = true;
  _setAutoSaveIndicator('saving');

  try {
    const payload = _buildCRPayload();
    if (!payload._meta.mission_required || !STATE.currentReportId) {
      _setAutoSaveIndicator('dirty');
      return;
    }
    delete payload._meta;

    const saved = await apiPatch('meeting_reports', STATE.currentReportId, payload);

    if (typeof _REALTIME !== 'undefined') {
      _REALTIME.lastUpdatedAt = saved.updated_at || Date.now();
    }

    // Mettre à jour le STATE local (sans refetch complet)
    const idx = STATE.reports.findIndex(r => r.id === saved.id);
    if (idx !== -1) STATE.reports[idx] = saved;

    _setAutoSaveIndicator('saved');
  } catch (err) {
    console.warn('[AutoSave] erreur :', err.message);
    _setAutoSaveIndicator('error');
  } finally {
    AUTOSAVE.inflight = false;
    if (AUTOSAVE.queued) {
      AUTOSAVE.queued = false;
      scheduleAutoSave(300);
    }
  }
}

function _setAutoSaveIndicator(state) {
  const el = document.getElementById('autoSaveIndicator');
  if (!el) return;
  el.classList.remove('saving','saved','error','dirty');
  el.style.display = 'inline-flex';
  if (state === 'dirty') {
    el.classList.add('saving');
    el.innerHTML = '<i class="fa-solid fa-pen"></i> <span>Modifications non enregistrées</span>';
  } else if (state === 'saving') {
    el.classList.add('saving');
    el.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Enregistrement…</span>';
  } else if (state === 'saved') {
    el.classList.add('saved');
    el.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span>Enregistré</span>';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 2500);
  } else if (state === 'error') {
    el.classList.add('error');
    el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>Erreur d\'enregistrement</span>';
  }
}
window._setAutoSaveIndicator = _setAutoSaveIndicator;

/**
 * Attache les listeners d'auto-save à tous les champs du formulaire CR
 * + aux éditeurs Quill. À appeler une fois après initQuill().
 */
function bindAutoSaveListeners() {
  if (AUTOSAVE.bound) return;
  const form = document.getElementById('crForm');
  if (!form) return;

  // Tous les inputs/textarea/select déclenchent un auto-save debounced
  form.addEventListener('input',  () => scheduleAutoSave());
  form.addEventListener('change', () => scheduleAutoSave());

  // Éditeur Quill principal
  const attachQuill = (q) => {
    if (!q || q._autoSaveBound) return;
    q._autoSaveBound = true;
    q.on('text-change', (_delta, _old, source) => {
      if (source === 'user') scheduleAutoSave();
    });
  };
  attachQuill(STATE.quillEditor);
  // Éditeurs optionnels (peuvent être créés plus tard)
  const opt = STATE?._quillEditors || {};
  Object.values(opt).forEach(attachQuill);

  // Réessayer après un délai au cas où les Quill optionnels arrivent plus tard
  setTimeout(() => {
    const opt2 = STATE?._quillEditors || {};
    Object.values(opt2).forEach(attachQuill);
  }, 1500);

  AUTOSAVE.bound = true;
}
window.bindAutoSaveListeners = bindAutoSaveListeners;

/* =====================================================
   DELETE CR (avec modale de confirmation)
   ===================================================== */
function confirmDeleteReport(crid, pid) {
  const cr = STATE.reports.find(r => r.id === crid);
  showConfirmModal({
    title:   t('delete_project').replace('projet','note'),
    message: `${t('delete')} : <strong>${esc(cr?.meeting_name||'...')}</strong>`,
    icon:    'fa-trash-can',
    danger:  true,
    onConfirm: () => deleteReport(crid, pid),
  });
}

async function deleteReport(crid, pid) {
  try {
    await apiDelete('meeting_reports', crid);
    await fetchReports();
    renderSidebar();
    if (STATE.currentReportId === crid) {
      STATE.currentReportId = null;
      showProjectCRs(pid);
    } else {
      showProjectCRs(pid);
    }
    showToast(t('cr_deleted'), 'warning');
  } catch(err) {
    showToast(t('cr_delete_error'),'error');
  }
}

/* =====================================================
   DUPLICATE CR
   ===================================================== */
async function duplicateReport(crid, pid) {
  const cr = STATE.reports.find(r => r.id === crid);
  if (!cr) return;

  const newName = `${cr.meeting_name||'CR'} (copie)`;
  try {
    const payload = {
      user_id:             STATE.userId,
      project_id:          pid,
      mission_name:        cr.mission_name || '',
      meeting_name:        newName,
      meeting_date:        new Date().toISOString().split('T')[0],
      meeting_location:    cr.meeting_location || '',
      meeting_facilitator: cr.meeting_facilitator || '',
      author:              cr.author || '',
      status:              'draft',
      participants:        cr.participants || '[]',
      actions:             cr.actions || '[]',
      key_points_html:     cr.key_points_html || '',
      last_modified:       new Date().toISOString(),
      keywords:            cr.keywords || '',
    };
    const saved = await apiPost('meeting_reports', payload);
    await fetchReports();
    renderSidebar();
    showToast(`${t('cr_duplicated')} "${newName}"`, 'success');
    openReport(saved.id, pid);
  } catch(err) {
    showToast(t('cr_dup_error'),'error');
  }
}

/* =====================================================
   DELETE PROJECT (avec modale de confirmation)
   ===================================================== */
function confirmDeleteProject(pid, name) {
  const count = STATE.reports.filter(r => r.project_id === pid).length;
  showConfirmModal({
    title:   t('delete_project'),
    message: `<strong>${esc(name)}</strong> — ${t('confirm_delete_project')}`,
    icon:    'fa-folder-minus',
    danger:  true,
    onConfirm: () => deleteProject(pid),
  });
}

async function deleteProject(pid) {
  try {
    // Supprimer tous les CRs du projet
    const toDelete = STATE.reports.filter(r => r.project_id === pid);
    await Promise.all(toDelete.map(cr => apiDelete('meeting_reports', cr.id)));
    // Supprimer le projet
    await apiDelete('projects', pid);
    await Promise.all([fetchProjects(), fetchReports()]);

    if (STATE.currentProjectId === pid) {
      STATE.currentProjectId = null;
      STATE.currentReportId  = null;
    }
    renderSidebar();
    renderDashboard();
    showView('viewDashboard');
    setBreadcrumb([t('breadcrumb_dashboard')]);
    showToast(t('project_deleted'), 'warning');
  } catch(err) {
    console.error(err);
    showToast(t('project_delete_error'),'error');
  }
}

/* =====================================================
   PROJETS — CRÉATION
   ===================================================== */
async function createProject() {
  const name    = document.getElementById('newProjectName').value.trim();
  const desc    = document.getElementById('newProjectDesc').value.trim();
  const color   = document.getElementById('newProjectColor').value;
  const company = document.getElementById('newProjectCompany')?.value.trim() || '';
  const logoUrl = _projectLogoState.confirmed || '';
  if (!name) { showToast(t('project_name_required'),'error'); return; }
  try {
    const now    = new Date();
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    await apiPost('projects', {
      user_id: STATE.userId,
      name, description: desc, color,
      company,
      logo_url: logoUrl,
      created_at_label: `${months[now.getMonth()]} ${now.getFullYear()}`,
    });
    await fetchProjects();
    renderSidebar();
    renderDashboard();
    closeModal('modalProject');
    document.getElementById('newProjectName').value = '';
    document.getElementById('newProjectDesc').value = '';
    document.getElementById('newProjectCompany').value = '';
    clearProjectLogo();
    showToast(`"${name}" — ${t('project_created')}`, 'success');
  } catch(err) {
    showToast(t('project_delete_error'),'error');
  }
}

/* =====================================================
   LOGO DYNAMIQUE VIA SOCIÉTÉ
   ===================================================== */

/* État local pour la modale projet */
const _projectLogoState = {
  confirmed:    '',   // URL du logo validé
  timer:        null, // debounce timer
  suggestions:  [],   // suggestions d'entreprises
};

/* Suggestions d'entreprises connues pour l'autocomplétion */
const COMPANY_SUGGESTIONS = [
  'AXA','Airbus','Air France','Allianz','Amazon','Accenture',
  'BNP Paribas','Banque Postale','Bouygues','BPCE',
  'Capgemini','Carrefour','Crédit Agricole','CCAS',
  'Danone','Deloitte','Decathlon',
  'EDF','Engie','Enedis','EY',
  'Google','Hermès',
  'IBM',
  'KPMG',
  'L\'Oréal','LCL','LVMH',
  'MAIF','McKinsey','Michelin','Microsoft',
  'Orange','Oracle',
  'PSA','Peugeot','PwC',
  'Ratp','Renault',
  'Sanofi','SAP','SNCF','Société Générale','Saint-Gobain','Salesforce','Sopra Steria','Suez','Stellantis',
  'Total Energies',
  'Veolia','Vinci',
  'Wavestone',
];

/* Debounce input : suggère + cherche le logo */
function onProjectCompanyInput(val) {
  clearTimeout(_projectLogoState.timer);
  const v = val.trim();

  // Afficher suggestions
  _renderCompanySuggestions(v);

  if (!v) { clearProjectLogo(); return; }

  // Status : recherche en cours
  _setLogoStatus('searching');

  _projectLogoState.timer = setTimeout(() => {
    _searchCompanyLogo(v);
  }, 600);
}

/* Afficher la liste de suggestions */
function _renderCompanySuggestions(query) {
  const box = document.getElementById('projectCompanySuggestions');
  if (!box) return;
  if (!query || query.length < 2) { box.style.display = 'none'; return; }

  const q = query.toLowerCase();
  const matches = COMPANY_SUGGESTIONS.filter(c => c.toLowerCase().startsWith(q)).slice(0, 6);
  if (matches.length === 0) { box.style.display = 'none'; return; }

  box.innerHTML = matches.map(c =>
    `<div class="proj-suggestion-item" onclick="selectCompanySuggestion('${c.replace(/'/g,"\\'")}')">
       <i class="fa-solid fa-building" style="color:var(--gray-400);font-size:.75rem;"></i>
       ${c}
     </div>`
  ).join('');
  box.style.display = 'block';
}

/* Sélectionner une suggestion */
function selectCompanySuggestion(name) {
  const input = document.getElementById('newProjectCompany');
  if (input) input.value = name;
  document.getElementById('projectCompanySuggestions').style.display = 'none';
  clearTimeout(_projectLogoState.timer);
  _setLogoStatus('searching');
  _searchCompanyLogo(name);
}
window.selectCompanySuggestion = selectCompanySuggestion;

/* Recherche dynamique du logo via plusieurs APIs */
async function _searchCompanyLogo(companyName) {
  if (!companyName) { clearProjectLogo(); return; }

  // Normaliser pour construire les URLs à tester
  const norm = companyName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'')
    .replace(/[^a-z0-9]/g,'');

  // 1. Table de correspondance connue (fiable)
  const KNOWN_DOMAINS = {
    'bnpparibas':'bnpparibas.com', 'bnp':'bnpparibas.com',
    'societegenerale':'societegenerale.com', 'socgen':'societegenerale.com',
    'creditagricole':'credit-agricole.com', 'caisse':'credit-agricole.com',
    'labanquepostale':'labanquepostale.fr', 'banquepostale':'labanquepostale.fr',
    'lcl':'lcl.fr', 'axa':'axa.com', 'allianz':'allianz.com', 'maif':'maif.fr',
    'orange':'orange.com', 'totalenergies':'totalenergies.com', 'total':'totalenergies.com',
    'airfrance':'airfrance.com', 'airbus':'airbus.com',
    'lvmh':'lvmh.com', 'loreal':'loreal.com', 'sanofi':'sanofi.com',
    'michelin':'michelin.com', 'stellantis':'stellantis.com',
    'renault':'renault.com', 'peugeot':'peugeot.com',
    'edf':'edf.fr', 'engie':'engie.com', 'enedis':'enedis.fr',
    'sncf':'sncf.com', 'ratp':'ratp.fr',
    'capgemini':'capgemini.com', 'soprasteria':'soprasteria.com', 'sopra':'soprasteria.com',
    'ibm':'ibm.com', 'microsoft':'microsoft.com', 'google':'google.com',
    'amazon':'amazon.com', 'salesforce':'salesforce.com',
    'sap':'sap.com', 'oracle':'oracle.com',
    'accenture':'accenture.com', 'deloitte':'deloitte.com',
    'pwc':'pwc.com', 'kpmg':'kpmg.com', 'ey':'ey.com', 'mckinsey':'mckinsey.com',
    'banquepopulaire':'banquepopulaire.fr', 'bpce':'bpce.fr',
    'veolia':'veolia.com', 'suez':'suez.com',
    'bouygues':'bouygues.com', 'vinci':'vinci.com',
    'saintgobain':'saint-gobain.com', 'danone':'danone.com',
    'carrefour':'carrefour.com', 'leclerc':'e.leclerc',
    'decathlon':'decathlon.com', 'hermes':'hermes.com',
    'wavestone':'wavestone.com',
  };

  const knownDomain = KNOWN_DOMAINS[norm];

  // Construire la liste des URLs de logo à tester dans l'ordre
  const candidateUrls = [];

  if (knownDomain) {
    // Clearbit (haute qualité)
    candidateUrls.push(`https://logo.clearbit.com/${knownDomain}`);
    // Google S2 Favicon (haute résolution)
    candidateUrls.push(`https://www.google.com/s2/favicons?domain=${knownDomain}&sz=128`);
  }

  // Tentative avec nom normalisé + .com et .fr
  const domainGuesses = [`${norm}.com`, `${norm}.fr`, `${norm}.org`];
  domainGuesses.forEach(d => {
    candidateUrls.push(`https://logo.clearbit.com/${d}`);
  });
  // Favicon Google pour les guesses
  domainGuesses.forEach(d => {
    candidateUrls.push(`https://www.google.com/s2/favicons?domain=${d}&sz=128`);
  });

  // Tester chaque URL en parallèle et prendre la première qui répond
  try {
    const validUrls = await _findAllValidLogos(candidateUrls);
    if (validUrls.length > 0) {
      _setLogoFound(validUrls[0], companyName);
      // Afficher la galerie si plusieurs logos trouvés
      if (validUrls.length > 1) {
        _renderLogoGallery(validUrls, companyName);
      }
    } else {
      _setLogoStatus('not_found');
    }
  } catch {
    _setLogoStatus('not_found');
  }
}

/* Tester une liste d'URLs et retourner TOUTES celles qui chargent */
function _findAllValidLogos(urls) {
  return new Promise((resolve) => {
    const valid = [];
    let pending = urls.length;
    let settled = false;
    if (pending === 0) { resolve([]); return; }

    const finish = () => {
      if (!settled) { settled = true; resolve([...new Set(valid)]); }
    };

    urls.forEach(url => {
      let done = false;
      const markDone = () => {
        if (done) return; done = true;
        pending--;
        if (pending === 0) finish();
      };
      const img = new Image();
      img.onload = () => { if (img.naturalWidth >= 16) valid.push(url); markDone(); };
      img.onerror = markDone;
      img.src = url;
      setTimeout(markDone, 4500);
    });
  });
}

/* Afficher une galerie de logos pour sélection */
function _renderLogoGallery(urls, companyName) {
  const gallery      = document.getElementById('projectLogoGallery');
  const galleryItems = document.getElementById('projectLogoGalleryItems');
  if (!gallery || !galleryItems) return;

  galleryItems.innerHTML = urls.map((url, i) => {
    const safeUrl     = url.replace(/&/g,'&amp;').replace(/'/g,"\\'");
    const safeCompany = (companyName||'').replace(/'/g,"\\'");
    return `<div class="proj-logo-gallery-item${i===0?' selected':''}" onclick="selectLogoFromGallery('${safeUrl}','${safeCompany}')">
      <img src="${url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" alt="Logo ${i+1}"
           style="max-width:56px;max-height:40px;object-fit:contain;"
           onerror="this.closest('.proj-logo-gallery-item').style.display='none'" />
    </div>`;
  }).join('');
  gallery.style.display = 'block';
}

/* Sélectionner un logo dans la galerie */
function selectLogoFromGallery(url, companyName) {
  _setLogoFound(url, companyName);
  // Mettre à jour la sélection visuelle
  document.querySelectorAll('.proj-logo-gallery-item').forEach(el => {
    el.classList.toggle('selected', el.querySelector('img')?.src === url);
  });
}
window.selectLogoFromGallery = selectLogoFromGallery;

/* Gérer l'upload manuel d'un logo */
function onProjectLogoFileChange(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast(t('image_not_recognized'), 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    const companyName = document.getElementById('newProjectCompany')?.value.trim() || 'Logo';
    _setLogoFound(dataUrl, companyName + ' (manuel)');
    // Cacher la galerie car on a un upload manuel
    const gallery = document.getElementById('projectLogoGallery');
    if (gallery) gallery.style.display = 'none';
    clearTimeout(_projectLogoState.timer);
    // Annuler la recherche auto
    _setLogoStatus = (s) => {}; // freeze temporaire
    setTimeout(() => { _setLogoStatus = _setLogoStatusFn; }, 2000);
  };
  reader.readAsDataURL(file);
}
window.onProjectLogoFileChange = onProjectLogoFileChange;

// Garder la ref originale de _setLogoStatus
const _setLogoStatusFn = _setLogoStatus;

/* Afficher le logo trouvé */
function _setLogoFound(url, companyName) {
  _projectLogoState.confirmed = url;

  const wrap = document.getElementById('projectLogoPreviewWrap');
  const img  = document.getElementById('projectLogoPreviewImg');
  const name = document.getElementById('projectLogoPreviewName');
  const status = document.getElementById('projectLogoStatus');

  if (img)  { img.src = url; img.style.display = 'block'; img.onerror = null; }
  if (name) name.textContent = companyName || '';
  if (wrap) wrap.style.display = 'block';
  if (status) {
    const isManual = url.startsWith('data:');
    status.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#059669"></i> ${isManual ? 'Logo chargé manuellement' : 'Logo trouvé automatiquement'}`;
    status.className = 'proj-logo-status found';
  }
}

/* Définir le statut de recherche */
function _setLogoStatus(status) {
  const el = document.getElementById('projectLogoStatus');
  const wrap = document.getElementById('projectLogoPreviewWrap');
  if (status === 'searching') {
    _projectLogoState.confirmed = '';
    if (wrap) wrap.style.display = 'none';
    if (el) {
      el.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:var(--primary)"></i> Recherche du logo…`;
      el.className = 'proj-logo-status searching';
    }
  } else if (status === 'not_found') {
    _projectLogoState.confirmed = '';
    if (wrap) wrap.style.display = 'none';
    if (el) {
      el.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color:var(--gray-400)"></i> ${t('no_logo_found')}`;
      el.className = 'proj-logo-status not-found';
    }
  }
}

/* Effacer le logo sélectionné */
function clearProjectLogo() {
  _projectLogoState.confirmed = '';
  const wrap   = document.getElementById('projectLogoPreviewWrap');
  const status = document.getElementById('projectLogoStatus');
  const img    = document.getElementById('projectLogoPreviewImg');
  if (wrap)   wrap.style.display = 'none';
  if (img)    img.src = '';
  if (status) { status.innerHTML = ''; status.className = 'proj-logo-status'; }
}
window.clearProjectLogo       = clearProjectLogo;
window.onProjectCompanyInput  = onProjectCompanyInput;

/* =====================================================
   MODALE DE CONFIRMATION CUSTOM
   ===================================================== */
function showConfirmModal({ title, message, icon='fa-exclamation-triangle', danger=false, onConfirm }) {
  document.getElementById('confirmModalTitle').innerHTML   = `<i class="fa-solid ${icon}" style="color:${danger?'var(--danger)':'var(--primary)'}"></i> ${title}`;
  document.getElementById('confirmModalMessage').innerHTML = message;
  const btn = document.getElementById('btnConfirmAction');
  btn.className = `btn-primary${danger?' btn-danger':''}`;
  btn.textContent = t('confirm_lbl');

  // Remplacer le listener
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.className = `btn-primary${danger?' btn-danger':''}`;
  newBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${t('confirm_lbl')}`;
  newBtn.addEventListener('click', () => {
    closeModal('modalConfirm');
    onConfirm();
  });

  openModal('modalConfirm');
}

/* =====================================================
   NAVIGATION HELPERS
   ===================================================== */
function showView(id) {
  const views = document.querySelectorAll('.view');
  views.forEach(v => v.classList.remove('active', 'view-enter'));
  const next = document.getElementById(id);
  if (!next) return;
  next.classList.add('active', 'view-enter');
  setTimeout(() => next.classList.remove('view-enter'), 260);
}

function goToDashboard() {
  // Arrêter le polling de co-édition
  if (typeof stopRealtimeSync === 'function') stopRealtimeSync();
  if (typeof cancelAutoSave === 'function') cancelAutoSave();
  // Revenir aux settings globaux
  if (typeof applyProjectSettings === 'function') applyProjectSettings(null);
  STATE.currentProjectId = null;
  STATE.currentReportId  = null;
  renderDashboard();
  showView('viewDashboard');
  setBreadcrumb(['Tableau de bord']);
  setTopbarActions('');
  renderSidebar();
}

function setBreadcrumb(items) {
  const el = document.getElementById('topbarBreadcrumb');
  el.innerHTML = items.map((item, i) => {
    if (typeof item === 'string') return `<span>${esc(item)}</span>`;
    const isLast = i === items.length - 1;
    if (isLast) return `<span>${esc(item.label)}</span>`;
    return `<a href="#" style="color:var(--gray-400);text-decoration:none;cursor:pointer" onclick="(${item.action.toString()})()">${esc(item.label)}</a><span class="sep"><i class="fa-solid fa-chevron-right" style="font-size:.6rem"></i></span>`;
  }).join('');
}

function setTopbarActions(html) {
  document.getElementById('topbarActions').innerHTML = html;
}

/* searchInput est bindé dans bindEvents() — voir ci-dessous */

/* =====================================================
   QUILL INIT
   ===================================================== */
function initQuill() {
  const FULL_TOOLBAR = _getFullQuillToolbar();
  STATE.quillEditor = new Quill('#quillEditor', {
    theme: 'snow',
    placeholder: 'Rédigez ici les points structurants de la réunion…',
    modules: {
      toolbar: FULL_TOOLBAR,
      clipboard: { matchVisual: false },
    }
  });
  STATE.quillEditor.root.addEventListener('paste', handleQuillPaste);
  STATE.quillEditor.root.addEventListener('drop', handleQuillDrop);

  // Activer le collage Excel sur l'éditeur principal
  if (typeof _attachExcelPasteToQuill === 'function') {
    _attachExcelPasteToQuill(STATE.quillEditor);
  }

  // Initialiser les éditeurs Quill pour les sections optionnelles
  STATE._quillEditors = {};
  _initOptionalQuillEditors();

  // Attacher les listeners d'auto-save (debounced) après init des Quill
  if (typeof bindAutoSaveListeners === 'function') bindAutoSaveListeners();
}

/* Initialiser les éditeurs Quill des sections optionnelles */
function _initOptionalQuillEditors() {
  const optionalQuillSections = [
    { id: 'decisions_quill_editor',  placeholder: 'Saisissez les décisions prises…' },
    { id: 'risks_quill_editor',      placeholder: 'Identifiez les risques…' },
    { id: 'budget_quill_editor',     placeholder: 'Situation budgétaire…' },
    { id: 'next_steps_quill_editor', placeholder: 'Prochaines étapes…' },
  ];

  // Toolbar enrichie identique à key_points (avec tableau, image)
  const FULL_TOOLBAR = _getFullQuillToolbar();

  optionalQuillSections.forEach(({ id, placeholder }) => {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('ql-container')) return;
    try {
      const q = new Quill(`#${id}`, {
        theme: 'snow',
        placeholder,
        modules: {
          toolbar: FULL_TOOLBAR,
          table:   false,
        }
      });
      _bindQuillPasteEnhanced(q);
      STATE._quillEditors[id] = q;
    } catch(e) {
      // L'élément n'existe peut-être pas encore (sections créées dynamiquement)
    }
  });
}
window._initOptionalQuillEditors = _initOptionalQuillEditors;

/* Retourne la config toolbar complète pour Quill */
function _getFullQuillToolbar() {
  return [
    [{ font: [] }],
    [{ header: [1, 2, 3, 4, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ align: [] }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    ['clean'],
  ];
}

/* Améliorations du collage (Excel, tableaux HTML) */
function _bindQuillPasteEnhanced(quillInstance) {
  if (!quillInstance) return;
  quillInstance.root.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // Priorité : image collée
    const items = Array.from(clipboardData.items || []);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        _embedImageInQuillInstance(item.getAsFile(), quillInstance);
        return;
      }
    }

    // Vérifier si c'est du HTML (tableau Excel, etc.)
    const htmlData = clipboardData.getData('text/html');
    if (htmlData && htmlData.includes('<table')) {
      e.preventDefault();
      _pasteHTMLTableIntoQuill(htmlData, quillInstance);
      return;
    }
    // Sinon laisser Quill gérer le collage normal
  });

  quillInstance.root.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        _embedImageInQuillInstance(file, quillInstance);
      }
    }
  });
}

/* Embed image dans une instance Quill spécifique */
function _embedImageInQuillInstance(file, quillInstance) {
  const reader = new FileReader();
  reader.onload = ev => {
    const range = quillInstance.getSelection(true);
    quillInstance.insertEmbed(range.index, 'image', ev.target.result);
    quillInstance.setSelection(range.index + 1);
  };
  reader.readAsDataURL(file);
}

/* Coller un tableau HTML (Excel) dans Quill avec mise en forme */
function _pasteHTMLTableIntoQuill(htmlStr, quillInstance) {
  // Créer un DOM temporaire pour extraire le contenu du tableau
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlStr;

  const tables = tmp.querySelectorAll('table');
  if (tables.length === 0) {
    // Pas de tableau → insérer le texte brut
    const text = tmp.innerText || tmp.textContent || '';
    const range = quillInstance.getSelection(true);
    quillInstance.insertText(range.index, text);
    return;
  }

  // Convertir le tableau en texte structuré (Quill ne supporte pas les tableaux nativement en snow)
  let converted = '';
  tables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, ri) => {
      const cells = row.querySelectorAll('th, td');
      const line = Array.from(cells).map(c => (c.innerText||c.textContent||'').trim()).join('\t');
      converted += line + '\n';
    });
    converted += '\n';
  });

  const range = quillInstance.getSelection(true);
  quillInstance.insertText(range.index, converted);
  quillInstance.setSelection(range.index + converted.length);

  if (typeof showToast === 'function') {
    showToast(t('table_pasted_quill'), 'info');
  }

}

/* Re-init les éditeurs Quill des sections optionnelles (appelé après initOptionalSections) */
function reinitOptionalQuillEditors() {
  if (!window.Quill) return;
  const optionalQuillSections = [
    { id: 'decisions_quill_editor',  placeholder: 'Saisissez les décisions prises…' },
    { id: 'risks_quill_editor',      placeholder: 'Identifiez les risques…' },
    { id: 'budget_quill_editor',     placeholder: 'Situation budgétaire…' },
    { id: 'next_steps_quill_editor', placeholder: 'Prochaines étapes…' },
  ];

  const toolbarConfig = _getFullQuillToolbar();

  if (!STATE._quillEditors) STATE._quillEditors = {};

  optionalQuillSections.forEach(({ id, placeholder }) => {
    if (STATE._quillEditors[id]) return; // déjà initialisé
    const el = document.getElementById(id);
    if (!el) return;
    // Éviter double init
    if (el.closest('.ql-container')) return;
    try {
      const q = new Quill(`#${id}`, {
        theme: 'snow',
        placeholder,
        modules: {
          toolbar: toolbarConfig,
          clipboard: { matchVisual: false },
        },
      });
      // Activer le collage Excel
      if (typeof _attachExcelPasteToQuill === 'function') {
        _attachExcelPasteToQuill(q);
      } else if (typeof _bindQuillPasteEnhanced === 'function') {
        _bindQuillPasteEnhanced(q);
      }
      STATE._quillEditors[id] = q;
      // Initialiser le sélecteur de layout pour cette section si disponible
      if (typeof _attachLayoutToOptionalSections === 'function') {
        setTimeout(_attachLayoutToOptionalSections, 50);
      }
    } catch(e) {
      console.warn('[Quill] Cannot init', id, e);
    }
  });
}
window.reinitOptionalQuillEditors = reinitOptionalQuillEditors;

function handleQuillPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  // Priorité 1 : si c'est une image dans le clipboard
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      embedImageInQuill(item.getAsFile());
      return;
    }
  }

  // Priorité 2 : HTML avec tableau (Excel, Word, etc.) — délégué à module-layout.js
  // Note: Quill's clipboard handler is already attached via _attachExcelPasteToQuill
  // appelé lors de initQuill()
}
function handleQuillDrop(e) {
  const files = e.dataTransfer?.files;
  if (!files) return;
  for (const file of files) {
    if (file.type.startsWith('image/')) { e.preventDefault(); embedImageInQuill(file); }
  }
}
function embedImageInQuill(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const range = STATE.quillEditor.getSelection(true);
    STATE.quillEditor.insertEmbed(range.index, 'image', ev.target.result);
  };
  reader.readAsDataURL(file);
}

/* =====================================================
   BIND EVENTS
   ===================================================== */
function bindEvents() {
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const isMobile = window.innerWidth <= 900;
    sidebar.classList.toggle('collapsed');
    if (isMobile && overlay) {
      overlay.classList.toggle('active', !sidebar.classList.contains('collapsed'));
    }
  });
  document.getElementById('btnNewCR').addEventListener('click', () => {
    if (STATE.currentProjectId) openNewReport(STATE.currentProjectId);
    else if (STATE.projects.length > 0) { STATE.currentProjectId = STATE.projects[0].id; openNewReport(STATE.projects[0].id); }
    else openModal('modalProject');
  });
  document.getElementById('btnAddProject').addEventListener('click', () => openModal('modalProject'));
  document.getElementById('btnCreateProject').addEventListener('click', createProject);
  document.getElementById('btnSettings').addEventListener('click', () => {
    if (typeof openSettingsModal === 'function') openSettingsModal();
    else openModal('modalSettings');
  });
  document.getElementById('crForm').addEventListener('submit', saveCR);
  document.getElementById('btnCancelEdit').addEventListener('click', () => {
    if (STATE.currentProjectId) showProjectCRs(STATE.currentProjectId);
    else goToDashboard();
  });
  document.getElementById('btnAddParticipant').addEventListener('click', () => addParticipantRow(document.getElementById('participantsList')));
  document.getElementById('btnAddAction').addEventListener('click', () => addActionRow(document.getElementById('actionsTableBody')));

  // Modales
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); }));

  // Color picker projet
  document.getElementById('newProjectColor').addEventListener('input', function() {
    document.getElementById('newProjectColorHex').textContent = this.value;
  });

  // Logo → dashboard
  document.getElementById('sidebarLogo')?.addEventListener('click', () => goToDashboard());

  // Recherche (bindé ici pour garantir que le DOM est prêt)
  document.getElementById('searchInput')?.addEventListener('input', () => renderSidebar());

  // Import file
  document.getElementById('fileImportInput').addEventListener('change', e => {
    if (e.target.files[0]) handleFileImport(e.target.files[0]);
  });
  const dropArea = document.getElementById('dropArea');
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
  dropArea.addEventListener('drop', e => {
    e.preventDefault(); dropArea.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFileImport(e.dataTransfer.files[0]);
  });

  // Export
  document.getElementById('btnExportEmail').addEventListener('click', exportEmail);
  document.getElementById('btnExportWord').addEventListener('click', exportWord);
  document.getElementById('btnExportPDF').addEventListener('click', exportPDF);

  // Mon Espace
  document.getElementById('btnSaveMySpace').addEventListener('click', saveMySpace);
  document.getElementById('btnSidebarMySpace')?.addEventListener('click', () => showMySpaceView());
  document.getElementById('btnSaveMySpaceView')?.addEventListener('click', saveMySpaceView);
  document.getElementById('msAvatarColor').addEventListener('input', function() {
    document.getElementById('msAvatarColorHex').value = this.value;
    updateAvatarPreview();
  });
  document.getElementById('msAvatarColorHex').addEventListener('input', function() {
    if (/^#[0-9A-Fa-f]{6}$/.test(this.value)) {
      document.getElementById('msAvatarColor').value = this.value;
      updateAvatarPreview();
    }
  });
  ['msFirstName','msLastName'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateAvatarPreview);
  });

  // Vue Mon Espace — sync couleur avatar
  document.getElementById('msViewAvatarColor')?.addEventListener('input', function() {
    document.getElementById('msViewAvatarColorHex').value = this.value;
    const hero = document.getElementById('msHeroAvatar');
    if (hero) hero.style.background = this.value;
  });
  document.getElementById('msViewAvatarColorHex')?.addEventListener('input', function() {
    if (/^#[0-9A-Fa-f]{6}$/.test(this.value)) {
      document.getElementById('msViewAvatarColor').value = this.value;
      const hero = document.getElementById('msHeroAvatar');
      if (hero) hero.style.background = this.value;
    }
  });

  // Confirm modal cancel
  document.getElementById('btnCancelConfirm')?.addEventListener('click', () => closeModal('modalConfirm'));
}

/* =====================================================
   MODALS
   ===================================================== */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.removeAttribute('hidden'); el.hidden = false; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.setAttribute('hidden', '');
}

/* =====================================================
   TOAST
   ===================================================== */
function showToast(msg, type='info') {
  const toast = document.getElementById('toast');
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
  toast.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i> ${msg}`;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
}

function setUiLoading(isLoading) {
  document.body.classList.toggle('ui-loading', !!isLoading);
}

/* =====================================================
   UTILITIES
   ===================================================== */
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function labelStatus(s) {
  const _ls = { draft: t('draft'), final: t('final'), archived: t('archived') };
  return _ls[s] || t('draft');
}
function formatDate(iso) {
  if (!iso) return '';
  try { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; } catch { return iso; }
}
function humanDate(ts) {
  if (!ts) return '';
  try {
    const d    = new Date(Number(ts));
    const now  = new Date();
    const diff = now - d;
    if (diff < 60000)   return 'à l\'instant';
    if (diff < 3600000) return `il y a ${Math.floor(diff/60000)} min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff/3600000)} h`;
    return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
  } catch { return ''; }
}

/* Expose globals */
window.showView            = showView;
window.openReport          = openReport;
window.openNewReport       = openNewReport;
window.deleteReport        = deleteReport;
window.confirmDeleteReport = confirmDeleteReport;
window.duplicateReport     = duplicateReport;
window.deleteProject       = deleteProject;
window.confirmDeleteProject= confirmDeleteProject;
window.showProjectCRs      = showProjectCRs;
window.goToDashboard       = goToDashboard;
window.toggleProject       = toggleProject;
window.openModal           = openModal;
window.closeModal          = closeModal;
window.showToast           = showToast;
window.showMySpace         = showMySpace;
window.showMySpaceView     = showMySpaceView;
window.saveMySpaceView     = saveMySpaceView;
window.confirmLogout       = confirmLogout;
window.STATE               = STATE;

/* ─── Sidebar mobile helpers ─── */
function closeSidebarMobile() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar)  sidebar.classList.add('collapsed');
  if (overlay)  overlay.classList.remove('active');
}
window.closeSidebarMobile = closeSidebarMobile;

/* Fermer sidebar automatiquement quand on clique un item sur mobile */
document.addEventListener('click', (e) => {
  if (window.innerWidth > 900) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || sidebar.classList.contains('collapsed')) return;
  const isInsideSidebar = sidebar.contains(e.target);
  const isToggleBtn = e.target.closest('#btnToggleSidebar');
  if (!isInsideSidebar && !isToggleBtn) {
    closeSidebarMobile();
  }
});

function confirmLogout() {
  showConfirmModal({
    title:   'Se déconnecter ?',
    message: 'Vous serez redirigé vers l\'écran de connexion. Vos données restent sauvegardées.',
    icon:    'fa-right-from-bracket',
    danger:  false,
    onConfirm: () => {
      closeModal('modalMySpace');
      if (typeof logout === 'function') logout();
    },
  });
}
window.collectParticipants       = collectParticipants;
window.collectActions            = collectActions;
window.addParticipantRow         = addParticipantRow;
window.addActionRow              = addActionRow;
window.findParticipantProfile    = findParticipantProfile;
window.fetchParticipantProfiles  = fetchParticipantProfiles;
window.formatDate          = formatDate;
window.esc                 = esc;
