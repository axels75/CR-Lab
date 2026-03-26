/* =====================================================
   WAVESTONE CR MASTER — auth.js v3
   Architecture : 100% Cloudflare D1
   - Login / Inscription / Mot de passe oublié via D1
   - Session stockée en sessionStorage (onglet seulement)
   - Fonctionne sur tous les appareils (PC, téléphone…)
   - Aucune dépendance Genspark, aucun localStorage compte
   ===================================================== */

'use strict';

const AUTH_KEY = 'wv_auth';

let _forgotProfile = null;

/* =====================================================
   SESSION (sessionStorage — onglet uniquement)
   ===================================================== */
function loadSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && s.userId && s.username) ? s : null;
  } catch { return null; }
}

function saveSession(session) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(AUTH_KEY);
}

/* =====================================================
   DÉRIVER user_id (déterministe, identique sur tous les appareils)
   ===================================================== */
async function deriveUserId(username, password) {
  const raw    = `wv:${username.toLowerCase().trim()}:${password}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex    = Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return 'u_' + hex.substring(0, 32);
}

async function hashSecurityAnswer(answer) {
  const raw    = `wvsec:${answer.toLowerCase().trim()}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/* =====================================================
   INIT DOM
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (form) form.addEventListener('submit', handleLoginSubmit);

  document.getElementById('tabLogin')
    ?.addEventListener('click', () => switchTab('login'));
  document.getElementById('tabRegister')
    ?.addEventListener('click', () => switchTab('register'));

  bindTogglePasswords();
});

/* =====================================================
   VÉRIFICATION SESSION
   ===================================================== */
async function checkAuthAndInit() {
  const session = loadSession();
  if (!session) { showLoginScreen(); return false; }
  STATE.userId      = session.userId;
  STATE.authSession = session;
  return true;
}

function showLoginScreen() {
  document.getElementById('loginScreen')?.removeAttribute('style');
  const app = document.getElementById('appRoot');
  if (app) app.style.display = 'none';
  switchTab('login');
}

function bindTogglePasswords() {
  document.querySelectorAll('.toggle-password, .auth-toggle-pass').forEach(btn => {
    btn.onclick = function() {
      const inp = this.previousElementSibling;
      if (!inp) return;
      const isPass = inp.type === 'password';
      inp.type = isPass ? 'text' : 'password';
      this.innerHTML = isPass
        ? '<i class="fa-solid fa-eye-slash"></i>'
        : '<i class="fa-solid fa-eye"></i>';
    };
  });
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin')?.classList.toggle('active', isLogin);
  document.getElementById('tabRegister')?.classList.toggle('active', !isLogin);
  document.getElementById('loginPanel').style.display    = isLogin ? 'block' : 'none';
  document.getElementById('registerPanel').style.display = isLogin ? 'none'  : 'block';
  const fp = document.getElementById('forgotPanel');
  if (fp) fp.style.display = 'none';
  document.getElementById('loginError').textContent    = '';
  document.getElementById('registerError').textContent = '';
}

/* =====================================================
   CONNEXION — D1
   ===================================================== */
async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');

  if (!username || !password) {
    errorEl.textContent = 'Identifiant et mot de passe obligatoires.';
    return;
  }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.textContent = 'Connexion…';

  try {
    const userId = await deriveUserId(username, password);

    /* Chercher le profil dans D1 */
    let profile = null;
    try {
      const all = await apiGet('user_profiles');
      profile = all.find(p => p.user_id === userId) || null;
    } catch(e) {
      console.error('[Auth] Impossible de joindre D1 :', e.message);
      errorEl.textContent = 'Erreur de connexion au serveur. Vérifiez votre connexion internet.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
      return;
    }

    if (!profile) {
      errorEl.textContent = 'Identifiant ou mot de passe incorrect.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
      return;
    }

    /* Fusionner le secret MFA local si présent */
    if (typeof _mfaLocal !== 'undefined') {
      profile = _mfaLocal.mergeWithProfile(userId, profile);
    }

    const session = { userId, username: username.toLowerCase().trim(), profileId: profile.id };
    saveSession(session);
    STATE.userId      = userId;
    STATE.authSession = session;
    STATE.userProfile = profile;

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';

    /* MFA */
    const mfaEnabled = (typeof _mfaLocal !== 'undefined' && _mfaLocal.isEnabled(userId))
                    || !!(profile.mfa_enabled && profile.mfa_secret);

    if (mfaEnabled && typeof requireMFAVerification === 'function') {
      requireMFAVerification(profile, () => _finishLogin());
      return;
    }
    if (typeof requireMFASetupScreen === 'function') {
      requireMFASetupScreen(profile, 'login', () => _finishLogin());
      return;
    }
    _finishLogin();

  } catch(err) {
    console.error('[Auth] Login error:', err);
    errorEl.textContent = 'Erreur lors de la connexion. Réessayez.';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
  }
}

/* Finalise la connexion */
async function _finishLogin() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appRoot').style.display     = 'flex';

  if (window.innerWidth <= 900) {
    document.getElementById('sidebar')?.classList.add('collapsed');
  }

  await Promise.all([fetchProjects(), fetchReports(), fetchUserProfile()]);
  if (typeof fetchSharedProjects === 'function') {
    await Promise.allSettled([fetchSharedProjects(), fetchSharedReports(), fetchProjectMembers()]);
  }
  renderSidebar();
  renderDashboard();
  updateUserWidget();
  if (typeof updateInvitationsBadge === 'function') updateInvitationsBadge();
  /* Initialiser la modale settings (si pas encore fait) */
  if (typeof initSettingsModal === 'function') initSettingsModal();
  showView('viewDashboard');
  setBreadcrumb(['Tableau de bord']);

  /* Sync MFA silencieuse */
  const uid = STATE.userId;
  if (uid && typeof _mfaLocal !== 'undefined' && _mfaLocal.needsSync(uid)) {
    const secret    = _mfaLocal.getSecret(uid);
    const profileId = STATE.userProfile?.id;
    if (secret && profileId && typeof _trySyncMFAToAPI === 'function') {
      setTimeout(() => _trySyncMFAToAPI(uid, profileId, secret), 3000);
    }
  }
}

/* =====================================================
   INSCRIPTION — D1
   ===================================================== */
async function handleRegisterSubmit() {
  const username    = document.getElementById('regUsername').value.trim();
  const password    = document.getElementById('regPassword').value;
  const password2   = document.getElementById('regPassword2').value;
  const firstName   = document.getElementById('regFirstName').value.trim();
  const lastName    = document.getElementById('regLastName').value.trim();
  const secQuestion = document.getElementById('regSecurityQuestion').value;
  const secAnswerRaw= document.getElementById('regSecurityAnswer').value.trim();
  const errorEl     = document.getElementById('registerError');

  errorEl.textContent = '';

  if (!username || !password || !firstName) {
    errorEl.textContent = 'Identifiant, mot de passe et prénom obligatoires.'; return;
  }
  if (username.length < 3) {
    errorEl.textContent = 'L\'identifiant doit contenir au moins 3 caractères.'; return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Le mot de passe doit contenir au moins 6 caractères.'; return;
  }
  if (password !== password2) {
    errorEl.textContent = 'Les mots de passe ne correspondent pas.'; return;
  }
  if (!secQuestion) {
    errorEl.textContent = 'Veuillez choisir une question de sécurité.'; return;
  }
  if (!secAnswerRaw) {
    errorEl.textContent = 'Veuillez répondre à la question de sécurité.'; return;
  }

  const btn = document.getElementById('btnRegister');
  btn.disabled    = true;
  btn.textContent = 'Création…';

  try {
    const userId    = await deriveUserId(username, password);
    const secAnswer = await hashSecurityAnswer(secAnswerRaw);

    /* Vérifier si le compte existe déjà dans D1 */
    let existing = [];
    try {
      existing = await apiGet('user_profiles');
    } catch(e) {
      errorEl.textContent = 'Impossible de joindre le serveur. Vérifiez votre connexion.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Créer mon compte';
      return;
    }

    if (existing.find(p => p.user_id === userId)) {
      errorEl.innerHTML = 'Ce compte existe déjà. <a href="#" onclick="switchTab(\'login\')">Connectez-vous</a>.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Créer mon compte';
      return;
    }
    if (existing.find(p => p.username && p.username.toLowerCase() === username.toLowerCase())) {
      errorEl.textContent = 'Cet identifiant est déjà pris. Choisissez-en un autre.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Créer mon compte';
      return;
    }

    /* Créer le profil dans D1 */
    const profileData = {
      user_id:              userId,
      username:             username.toLowerCase().trim(),
      first_name:           firstName,
      last_name:            lastName || '',
      job_title:            '',
      organization:         'Wavestone',
      email:                '',
      phone:                '',
      initials:             ((firstName[0]||'?') + (lastName[0]||'')).toUpperCase(),
      avatar_color:         '#002D72',
      security_question:    secQuestion,
      security_answer_hash: secAnswer,
      mfa_enabled:          false,
      mfa_secret:           '',
    };

    let newProfile;
    try {
      newProfile = await apiPost('user_profiles', profileData);
    } catch(e) {
      errorEl.textContent = 'Erreur lors de la création du compte. Réessayez.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Créer mon compte';
      return;
    }

    const session = { userId, username: username.toLowerCase().trim(), profileId: newProfile.id };
    saveSession(session);
    STATE.userId      = userId;
    STATE.authSession = session;
    STATE.userProfile = newProfile;

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Créer mon compte';

    /* MFA obligatoire après inscription */
    if (typeof requireMFASetupScreen === 'function') {
      requireMFASetupScreen(newProfile, 'register', async () => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appRoot').style.display     = 'flex';
        if (window.innerWidth <= 900) {
          document.getElementById('sidebar')?.classList.add('collapsed');
        }
        await Promise.all([fetchProjects(), fetchReports()]);
        if (typeof fetchSharedProjects === 'function') {
          await Promise.allSettled([fetchSharedProjects(), fetchSharedReports(), fetchProjectMembers()]);
        }
        renderSidebar();
        renderDashboard();
        updateUserWidget();
        if (typeof updateInvitationsBadge === 'function') updateInvitationsBadge();
        showView('viewDashboard');
        setBreadcrumb(['Tableau de bord']);
        setTimeout(() => showToast(`Bienvenue ${firstName} ! Votre compte est sécurisé avec la 2FA.`, 'success'), 600);
      });
      return;
    }

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appRoot').style.display     = 'flex';
    await Promise.all([fetchProjects(), fetchReports()]);
    renderSidebar(); renderDashboard(); updateUserWidget();
    showView('viewDashboard');
    setBreadcrumb(['Tableau de bord']);
    setTimeout(() => showToast(`Bienvenue ${firstName} !`, 'success'), 600);

  } catch(err) {
    console.error('[Auth] Register error:', err);
    errorEl.textContent = 'Erreur inattendue. Réessayez.';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Créer mon compte';
  }
}

/* =====================================================
   MOT DE PASSE OUBLIÉ — 4 étapes
   ===================================================== */
function showForgotPanel() {
  document.getElementById('loginPanel').style.display  = 'none';
  document.getElementById('forgotPanel').style.display = 'block';
  ['forgotStep1','forgotStep2','forgotStep3','forgotStep4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('active'); el.style.display = ''; }
  });
  document.getElementById('forgotStep1')?.classList.add('active');
  ['forgotUsername','forgotAnswer','forgotNewPwd','forgotNewPwd2']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['forgotError1','forgotError2','forgotError3']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
  _forgotProfile = null;
  bindTogglePasswords();
}

function hideForgotPanel() {
  document.getElementById('forgotPanel').style.display = 'none';
  document.getElementById('loginPanel').style.display  = 'block';
  _forgotProfile = null;
}

async function forgotStep1() {
  const username = document.getElementById('forgotUsername').value.trim();
  const errEl    = document.getElementById('forgotError1');
  errEl.textContent = '';
  if (!username) { errEl.textContent = 'Veuillez saisir votre identifiant.'; return; }

  const btn = document.getElementById('btnForgotStep1');
  btn.disabled = true; btn.textContent = 'Recherche…';

  try {
    const all = await apiGet('user_profiles');
    const matched = all.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());

    if (!matched) {
      errEl.textContent = 'Aucun compte trouvé pour cet identifiant.';
      return;
    }
    if (!matched.security_question) {
      errEl.innerHTML = `Ce compte n'a pas de question de sécurité.<br>
        <strong>Connectez-vous</strong> puis allez dans <strong>Mon Espace → Sécurité</strong>.`;
      return;
    }

    _forgotProfile = matched;
    const fq = document.getElementById('forgotQuestion');
    if (fq) fq.textContent = matched.security_question;
    document.getElementById('forgotStep1')?.classList.remove('active');
    document.getElementById('forgotStep2')?.classList.add('active');

  } catch(err) {
    errEl.textContent = 'Erreur réseau. Vérifiez votre connexion et réessayez.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Continuer';
  }
}

async function forgotStep2() {
  const answer = document.getElementById('forgotAnswer').value.trim();
  const errEl  = document.getElementById('forgotError2');
  errEl.textContent = '';
  if (!answer) { errEl.textContent = 'Veuillez saisir votre réponse.'; return; }

  const btn = document.getElementById('btnForgotStep2');
  btn.disabled = true; btn.textContent = 'Vérification…';

  try {
    const hashed = await hashSecurityAnswer(answer);
    if (hashed !== _forgotProfile.security_answer_hash) {
      errEl.textContent = 'Réponse incorrecte. Vérifiez les majuscules/minuscules.';
      return;
    }
    document.getElementById('forgotStep2')?.classList.remove('active');
    document.getElementById('forgotStep3')?.classList.add('active');
    bindTogglePasswords();
  } catch(err) {
    errEl.textContent = 'Erreur. Réessayez.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Vérifier';
  }
}

async function forgotStep3() {
  const newPwd  = document.getElementById('forgotNewPwd').value;
  const newPwd2 = document.getElementById('forgotNewPwd2').value;
  const errEl   = document.getElementById('forgotError3');
  errEl.textContent = '';

  if (!newPwd || !newPwd2) { errEl.textContent = 'Renseignez et confirmez le nouveau mot de passe.'; return; }
  if (newPwd.length < 6)   { errEl.textContent = 'Minimum 6 caractères.'; return; }
  if (newPwd !== newPwd2)  { errEl.textContent = 'Les mots de passe ne correspondent pas.'; return; }

  const btn = document.getElementById('btnForgotStep3');
  btn.disabled = true; btn.textContent = 'Enregistrement…';

  try {
    const username  = _forgotProfile.username;
    const newUserId = await deriveUserId(username, newPwd);
    const oldUserId = _forgotProfile.user_id;

    if (newUserId === oldUserId) {
      errEl.textContent = 'Le nouveau mot de passe est identique à l\'ancien.'; return;
    }

    /* Mettre à jour le user_id dans D1 */
    await apiPatch('user_profiles', _forgotProfile.id, { user_id: newUserId });

    /* Mettre à jour les projets et rapports de cet utilisateur */
    const [allProjects, allReports] = await Promise.all([
      apiGet('projects'), apiGet('meeting_reports')
    ]);
    await Promise.allSettled([
      ...allProjects.filter(p => p.user_id === oldUserId).map(p => apiPatch('projects', p.id, { user_id: newUserId })),
      ...allReports.filter(r => r.user_id === oldUserId).map(r => apiPatch('meeting_reports', r.id, { user_id: newUserId })),
    ]);

    /* Mettre à jour le secret MFA local si présent */
    if (typeof _mfaLocal !== 'undefined') {
      const oldSecret = _mfaLocal.getSecret(oldUserId);
      if (oldSecret) { _mfaLocal.save(newUserId, oldSecret); _mfaLocal.clear(oldUserId); }
    }

    document.getElementById('forgotStep3')?.classList.remove('active');
    document.getElementById('forgotStep4')?.classList.add('active');

  } catch(err) {
    console.error('[Auth] forgotStep3 error:', err);
    errEl.textContent = 'Erreur lors de la mise à jour. Réessayez.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Enregistrer le nouveau mot de passe';
  }
}

/* =====================================================
   DÉCONNEXION
   ===================================================== */
function logout() {
  clearSession();
  STATE.userId = STATE.authSession = STATE.userProfile = null;
  STATE.projects = STATE.reports = [];
  STATE.currentProjectId = STATE.currentReportId = null;

  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginScreen')?.removeAttribute('style');

  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';

  switchTab('login');
}

/* =====================================================
   EXPORTS GLOBAUX
   ===================================================== */
window.checkAuthAndInit     = checkAuthAndInit;
window.logout               = logout;
window.handleRegisterSubmit = handleRegisterSubmit;
window.deriveUserId         = deriveUserId;
window.hashSecurityAnswer   = hashSecurityAnswer;
window.showForgotPanel      = showForgotPanel;
window.hideForgotPanel      = hideForgotPanel;
window.forgotStep1          = forgotStep1;
window.forgotStep2          = forgotStep2;
window.forgotStep3          = forgotStep3;
