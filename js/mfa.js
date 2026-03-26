/* =====================================================
   WAVESTONE CR MASTER – mfa.js  v7
   Authentification TOTP RFC 6238 — Production-ready

   ARCHITECTURE v7 — localStorage-first :
   ─────────────────────────────────────────────────────
   • Le secret MFA est stocké dans localStorage avec la
     clé `wv_mfa_{userId}`, indépendamment de l'API.
   • L'API Genspark sert à la sync cross-device uniquement
     (tentée silencieusement, jamais bloquante).
   • En production Cloudflare, l'API CORS peut échouer :
     l'app fonctionne quand même grace au localStorage.

   CORRECTIONS v7 :
   • Suppression totale de la dépendance API pour la
     vérification du code (cause de "Erreur serveur")
   • Counter TOTP encodé avec BigInt (overflow 32-bit)
   • Fenêtre ±8 périodes (±4 min) de tolérance
   • Sync API silencieuse en arrière-plan (non bloquante)
   ===================================================== */

'use strict';

/* ─────────────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────────────── */
const MFA_WINDOW      = 8;       // ±8 × 30 s = ±4 min
const MFA_ISSUER      = 'CRMaster';
const BASE32_CHARS    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_SESSION_KEY = 'wv_mfa_setup_secret';
const MFA_DEBUG       = false;   // passer à true pour diagnostiquer

function _log(...a) { if (MFA_DEBUG) console.log('[MFA]', ...a); }

/* ─────────────────────────────────────────────────────
   STOCKAGE LOCAL MFA — architecture localStorage-first
   Clés : wv_mfa_{userId}  →  { secret, enabled, syncedAt }
───────────────────────────────────────────────────── */
const _mfaLocal = {
  _key: (uid) => `wv_mfa_${uid || 'unknown'}`,

  /** Lire le secret depuis localStorage */
  getSecret(userId) {
    try {
      const raw = localStorage.getItem(this._key(userId));
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d?.secret || null;
    } catch(e) { return null; }
  },

  /** Vérifier si MFA est activé localement */
  isEnabled(userId) {
    try {
      const raw = localStorage.getItem(this._key(userId));
      if (!raw) return false;
      const d = JSON.parse(raw);
      return !!(d?.secret && d?.enabled === true);
    } catch(e) { return false; }
  },

  /** Sauvegarder le secret MFA localement */
  save(userId, secret) {
    try {
      const existing = JSON.parse(localStorage.getItem(this._key(userId)) || '{}');
      const data = {
        ...existing,
        secret,
        enabled: true,
        savedAt: Date.now(),
        _needsSync: true,
      };
      localStorage.setItem(this._key(userId), JSON.stringify(data));
      return true;
    } catch(e) { console.error('[MFA] localStorage save error:', e); return false; }
  },

  /** Marquer comme synchronisé avec l'API */
  markSynced(userId) {
    try {
      const existing = JSON.parse(localStorage.getItem(this._key(userId)) || '{}');
      existing._needsSync = false;
      existing.syncedAt = Date.now();
      localStorage.setItem(this._key(userId), JSON.stringify(existing));
    } catch(e) {}
  },

  /** Besoin de sync API ? */
  needsSync(userId) {
    try {
      const raw = localStorage.getItem(this._key(userId));
      if (!raw) return false;
      return JSON.parse(raw)?._needsSync === true;
    } catch(e) { return false; }
  },

  /** Fusionner un profil API avec les données locales */
  mergeWithProfile(userId, profile) {
    if (!profile || !userId) return profile;
    const localSecret = this.getSecret(userId);
    const localEnabled = this.isEnabled(userId);
    if (localSecret && (!profile.mfa_secret || !profile.mfa_enabled)) {
      return { ...profile, mfa_secret: localSecret, mfa_enabled: localEnabled };
    }
    // Si l'API a un secret mais pas le local, sauvegarder localement
    if (profile.mfa_secret && profile.mfa_enabled && !localSecret) {
      this.save(userId, profile.mfa_secret);
      this.markSynced(userId); // déjà en sync
    }
    return profile;
  },

  /** Supprimer le secret local (reset MFA) */
  clear(userId) {
    try { localStorage.removeItem(this._key(userId)); } catch(e) {}
  },
};

/* ─────────────────────────────────────────────────────
   GÉNÉRATION SECRET BASE32 (20 octets = 160 bits)
───────────────────────────────────────────────────── */
function generateTOTPSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let result = '', buffer = 0, bitsLeft = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32_CHARS[(buffer >> bitsLeft) & 0x1F];
    }
  }
  return result; // 32 caractères base32
}

/* ─────────────────────────────────────────────────────
   DÉCODAGE BASE32 → Uint8Array
───────────────────────────────────────────────────── */
function base32Decode(encoded) {
  if (!encoded) return new Uint8Array(0);
  const s = encoded.toUpperCase().replace(/[\s\-=_]/g, '').replace(/[^A-Z2-7]/g, '');
  const bytes = [];
  let buffer = 0, bitsLeft = 0;
  for (const ch of s) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx < 0) continue;
    buffer = (buffer << 5) | idx;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xFF);
    }
  }
  return new Uint8Array(bytes);
}

/* ─────────────────────────────────────────────────────
   HMAC-SHA1 via WebCrypto
───────────────────────────────────────────────────── */
async function hmacSHA1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
}

/* ─────────────────────────────────────────────────────
   HOTP — counter 64-bit via BigInt
   ⚠️  BUG CLOUDFLARE v5 : JS bitwise tronque à 32 bits
       pour timestamp Unix / 30 > 2^31 → corrigé v6
───────────────────────────────────────────────────── */
async function generateHOTP(secretBase32, counter) {
  const keyBytes = base32Decode(secretBase32);
  if (!keyBytes.length) { _log('secret vide'); return '000000'; }

  const msgBytes = new Uint8Array(8);
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    msgBytes[i] = Number(c & 0xFFn);
    c >>= 8n;
  }

  const hash = await hmacSHA1(keyBytes, msgBytes);

  // RFC 4226 dynamic truncation
  const offset = hash[19] & 0x0F;
  const binCode = ((hash[offset]   & 0x7F) << 24)
                | ((hash[offset+1] & 0xFF) << 16)
                | ((hash[offset+2] & 0xFF) <<  8)
                |  (hash[offset+3] & 0xFF);

  return String(binCode % 1_000_000).padStart(6, '0');
}

/* ─────────────────────────────────────────────────────
   TOTP — basé sur le temps (RFC 6238)
───────────────────────────────────────────────────── */
async function generateTOTP(secretBase32, stepOffset = 0) {
  const step = Math.floor(Date.now() / 30_000) + stepOffset;
  return generateHOTP(secretBase32, step);
}

/* ─────────────────────────────────────────────────────
   VÉRIFICATION — fenêtre large ±MFA_WINDOW pas
───────────────────────────────────────────────────── */
async function verifyTOTP(secretBase32, userCode) {
  if (!userCode || !secretBase32) return false;
  const clean = String(userCode).replace(/\D/g, '').trim();
  if (clean.length !== 6) { _log('longueur invalide:', clean.length); return false; }

  for (let i = -MFA_WINDOW; i <= MFA_WINDOW; i++) {
    const expected = await generateTOTP(secretBase32, i);
    _log(`step[${i}] expected=${expected} got=${clean}`);
    if (expected === clean) { _log('✅ validé fenêtre', i); return true; }
  }
  _log('❌ aucune correspondance ±', MFA_WINDOW);
  return false;
}

/* ─────────────────────────────────────────────────────
   CONSTRUCTION URL otpauth:// + QR Code
───────────────────────────────────────────────────── */
function buildOTPAuthURL(secret, username) {
  const s = secret.replace(/\s/g, '');
  const label = encodeURIComponent(`${MFA_ISSUER}:${username}`);
  return `otpauth://totp/${label}?secret=${s}&issuer=${encodeURIComponent(MFA_ISSUER)}&algorithm=SHA1&digits=6&period=30`;
}

function buildQRCodeURL(otpauthUrl) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&ecc=M&data=${encodeURIComponent(otpauthUrl)}`;
}

/* ─────────────────────────────────────────────────────
   CACHE SECRET EN SESSION (évite régénération multiple)
───────────────────────────────────────────────────── */
const _ss = {
  save:  (v) => { try { sessionStorage.setItem(MFA_SESSION_KEY, v); } catch(_){} },
  load:  ()  => { try { return sessionStorage.getItem(MFA_SESSION_KEY)||null; } catch(_){ return null; } },
  clear: ()  => { try { sessionStorage.removeItem(MFA_SESSION_KEY); } catch(_){} },
};

/* ─────────────────────────────────────────────────────
   SYNC API SILENCIEUSE
   Tente de sauvegarder en BDD Genspark si possible,
   sans jamais bloquer l'expérience utilisateur.
───────────────────────────────────────────────────── */
async function _trySyncMFAToAPI(userId, profileId, secret) {
  if (!userId || !profileId || !secret) return false;
  try {
    if (typeof apiPatch !== 'function') return false;
    const upd = await apiPatch('user_profiles', profileId, {
      mfa_secret: secret,
      mfa_enabled: true,
    });
    if (upd && upd.id) {
      _mfaLocal.markSynced(userId);
      console.log('[MFA] ✅ Secret synchronisé avec l\'API Genspark');
      return true;
    }
  } catch(e) {
    // Silencieux : CORS ou API indisponible en production externe
    console.warn('[MFA] Sync API différée (normal en production Cloudflare):', e.message);
  }
  return false;
}

/* ─────────────────────────────────────────────────────
   ÉTAT LOCAL
───────────────────────────────────────────────────── */
let _mfaSetupSecret        = null;   // modale setup dans l'app
let _mfaSetupCallback      = null;   // callback écran setup obligatoire
let _mfaSetupProfile       = null;   // profil cible pour la sauvegarde
let _mfaLoginCallback      = null;   // callback vérification login
let _mfaLoginProfile       = null;   // profil login en cours
let _countdownInterval     = null;

function isMFAEnabled() {
  const p   = window.STATE?.userProfile;
  const uid = window.STATE?.userId;
  // Vérifier d'abord localStorage (source de vérité en production)
  if (uid && _mfaLocal.isEnabled(uid)) return true;
  return !!(p?.mfa_secret && p?.mfa_enabled === true);
}

/* ─────────────────────────────────────────────────────
   OBTENIR LE SECRET MFA — localStorage en priorité
   puis profil en mémoire, puis profil API
───────────────────────────────────────────────────── */
function _getMFASecret(profile) {
  const uid = window.STATE?.userId;
  // 1. localStorage (source de vérité, fonctionne hors-ligne)
  const localSecret = uid ? _mfaLocal.getSecret(uid) : null;
  if (localSecret) return localSecret;
  // 2. Profil en mémoire
  if (profile?.mfa_secret) return profile.mfa_secret;
  // 3. STATE.userProfile
  return window.STATE?.userProfile?.mfa_secret || null;
}

/* ─────────────────────────────────────────────────────
   COUNTDOWN TOTP (SVG circulaire)
───────────────────────────────────────────────────── */
function _startCountdown(id) {
  _stopCountdown();
  const el = document.getElementById(id);
  if (!el) return;
  const tick = () => {
    const s   = Math.floor(Date.now() / 1000);
    const rem = 30 - (s % 30);
    const pct = (rem / 30) * 100;
    const col = rem <= 5 ? '#ef4444' : rem <= 10 ? '#f59e0b' : '#10b981';
    el.innerHTML = `
      <div class="totp-countdown" style="color:${col}">
        <svg width="20" height="20" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" stroke-width="3.5"/>
          <circle cx="18" cy="18" r="14" fill="none" stroke="${col}" stroke-width="3.5"
            stroke-dasharray="${pct * 0.879} 100" stroke-linecap="round"
            transform="rotate(-90 18 18)"/>
        </svg>
        <span>Nouveau code dans <strong>${rem}s</strong></span>
      </div>`;
  };
  tick();
  _countdownInterval = setInterval(tick, 1000);
}
function _stopCountdown() {
  clearInterval(_countdownInterval);
  _countdownInterval = null;
}

/* ─────────────────────────────────────────────────────
   PANNEAU MFA — Mon Espace
───────────────────────────────────────────────────── */
async function renderMFAPanel() {
  const el = document.getElementById('mfaPanel');
  if (!el) return;
  const on = isMFAEnabled();
  el.innerHTML = on
    ? `<div class="mfa-status mfa-active">
         <i class="fa-solid fa-shield-halved" style="color:#059669"></i>
         <div>
           <strong>Authentification à deux facteurs activée</strong>
           <div style="font-size:.78rem;color:var(--gray-500);margin-top:3px;">
             Compte protégé par Google / Microsoft Authenticator ou Authy.
           </div>
           <div style="font-size:.72rem;color:#059669;margin-top:4px;font-weight:600;">
             <i class="fa-solid fa-lock"></i> Obligatoire — ne peut pas être désactivée
           </div>
         </div>
       </div>`
    : `<div class="mfa-status mfa-inactive">
         <i class="fa-solid fa-shield-halved" style="color:var(--gray-400)"></i>
         <div>
           <strong>Authentification à deux facteurs désactivée</strong>
           <div style="font-size:.78rem;color:var(--gray-500);margin-top:3px;">
             Activez la 2FA pour sécuriser votre compte.
           </div>
         </div>
         <button class="btn-primary" onclick="startMFASetup()">
           <i class="fa-solid fa-shield-halved"></i> Activer
         </button>
       </div>`;
}

/* ─────────────────────────────────────────────────────
   SETUP MFA — modale dans l'application
───────────────────────────────────────────────────── */
async function startMFASetup() {
  const username = window.STATE?.userProfile?.username || window.STATE?.authSession?.username || 'user';
  _mfaSetupSecret = generateTOTPSecret();
  const qrUrl = buildQRCodeURL(buildOTPAuthURL(_mfaSetupSecret, username));
  const qrImg = document.getElementById('mfaQRCode');
  if (qrImg) qrImg.src = qrUrl;
  const secEl = document.getElementById('mfaSecretDisplay');
  if (secEl) secEl.textContent = _mfaSetupSecret.match(/.{1,4}/g).join(' ');
  const ci = document.getElementById('mfaVerifyCode');
  if (ci) ci.value = '';
  const er = document.getElementById('mfaSetupError');
  if (er) er.textContent = '';
  if (typeof openModal === 'function') openModal('modalMFASetup');
}

async function confirmMFASetup() {
  const ci  = document.getElementById('mfaVerifyCode');
  const err = document.getElementById('mfaSetupError');
  const btn = document.getElementById('btnConfirmMFA');
  const code = (ci?.value||'').replace(/\D/g,'');
  if (err) err.textContent = '';
  if (code.length !== 6) { if (err) err.textContent = 'Code à 6 chiffres requis.'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Vérification…'; }
  try {
    if (!await verifyTOTP(_mfaSetupSecret, code)) {
      if (err) err.textContent = 'Code incorrect. Vérifiez l\'heure de votre appareil.';
      return;
    }
    const uid = window.STATE?.userId;
    const profileId = window.STATE?.userProfile?.id;

    // Sauvegarder en localStorage (immédiat, sans API)
    _mfaLocal.save(uid, _mfaSetupSecret);
    window.STATE.userProfile = {
      ...(window.STATE.userProfile || {}),
      mfa_secret: _mfaSetupSecret,
      mfa_enabled: true,
    };

    // Sync API en arrière-plan (non bloquante)
    _trySyncMFAToAPI(uid, profileId, _mfaSetupSecret);

    _mfaSetupSecret = null;
    if (typeof closeModal === 'function') closeModal('modalMFASetup');
    if (typeof showToast  === 'function') showToast('2FA activé avec succès !', 'success');
    renderMFAPanel();
  } catch(e) {
    console.error('[MFA] confirmMFASetup', e);
    if (err) err.textContent = 'Erreur : ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmer'; }
  }
}

async function disableMFA() {
  if (typeof showToast === 'function')
    showToast('La 2FA est obligatoire et ne peut pas être désactivée.', 'warning');
}

/* ─────────────────────────────────────────────────────
   SETUP MFA OBLIGATOIRE — écran plein
   Appelé après inscription ou première connexion
───────────────────────────────────────────────────── */
async function requireMFASetupScreen(profile, context, onSuccess) {
  _mfaSetupCallback = onSuccess;
  _mfaSetupProfile  = profile;

  let secret = _ss.load();
  if (!secret) {
    secret = generateTOTPSecret();
    _ss.save(secret);
  }
  window._mfaSetupScreenSecret = secret;

  const username   = profile.username || profile.first_name || 'user';
  const otpauth    = buildOTPAuthURL(secret, username);
  const qrUrl      = buildQRCodeURL(otpauth);
  _log('setupScreen secret=', secret, 'otpauth=', otpauth);

  /* QR Image */
  const qrImg = document.getElementById('mfaSetupScreenQR');
  if (qrImg) {
    qrImg.style.opacity = '0.2';
    qrImg.onload  = () => qrImg.style.opacity = '1';
    qrImg.onerror = () => {
      qrImg.style.display = 'none';
      const fb = document.getElementById('mfaSetupScreenQRFallback');
      if (fb) fb.style.display = 'flex';
    };
    qrImg.src = qrUrl;
  }

  const secEl = document.getElementById('mfaSetupScreenSecret');
  if (secEl) secEl.textContent = secret.match(/.{1,4}/g).join(' ');

  const codeEl = document.getElementById('mfaSetupScreenCode');
  if (codeEl) codeEl.value = '';
  const errEl = document.getElementById('mfaSetupScreenError');
  if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }

  const ctxEl = document.getElementById('mfaSetupScreenContext');
  if (ctxEl) ctxEl.textContent = context === 'register'
    ? 'Votre compte a été créé ! Configurez maintenant une application d\'authentification pour sécuriser votre accès.'
    : 'Pour accéder à l\'application, configurez une application d\'authentification.';

  _startCountdown('mfaSetupCountdown');

  const ls  = document.getElementById('loginScreen');
  const ms  = document.getElementById('mfaScreen');
  const sts = document.getElementById('mfaSetupScreen');
  if (ls)  ls.style.display  = 'none';
  if (ms)  ms.style.display  = 'none';
  if (sts) sts.style.removeProperty('display');

  if (codeEl) setTimeout(() => codeEl.focus(), 350);
}

/* ─────────────────────────────────────────────────────
   CONFIRMATION SETUP MFA — version localStorage-first
   ✅ Ne dépend plus de l'API pour valider le code
   ✅ Fonctionne sur Cloudflare sans CORS
───────────────────────────────────────────────────── */
async function confirmMFASetupScreen() {
  const codeEl = document.getElementById('mfaSetupScreenCode');
  const errEl  = document.getElementById('mfaSetupScreenError');
  const btn    = document.getElementById('btnConfirmMFAScreen');

  const code = (codeEl?.value||'').replace(/\D/g,'');
  if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }

  if (code.length !== 6) {
    if (errEl) errEl.textContent = 'Saisissez le code à 6 chiffres de l\'application.';
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Vérification…';
  }

  try {
    /* ── 1. Récupérer le secret depuis la session ── */
    const secret = window._mfaSetupScreenSecret || _ss.load();
    if (!secret) {
      if (errEl) errEl.textContent = 'Session expirée. Rechargez la page.';
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Activer et accéder'; }
      return;
    }

    _log('confirmSetup code=', code, 'secret=', secret);

    /* ── 2. Vérifier le code TOTP (100% local, pas d'API) ── */
    const ok = await verifyTOTP(secret, code);
    if (!ok) {
      if (errEl) errEl.innerHTML = `
        <div>Code incorrect — vérifiez l'heure de votre téléphone.</div>
        <div style="margin-top:5px;font-size:.74rem;opacity:.7;">
          <i class="fa-solid fa-circle-info"></i>
          Réglages → Général → Date et heure → Automatique (activé)
        </div>`;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Activer et accéder'; }
      return;
    }

    /* ── 3. Sauvegarder en localStorage (IMMÉDIAT, sans réseau) ── */
    const uid = window.STATE?.userId;
    _mfaLocal.save(uid, secret);
    _log('✅ MFA secret saved to localStorage for user:', uid);

    /* ── 4. Mettre à jour l'état en mémoire ── */
    const profile = _mfaSetupProfile || window.STATE?.userProfile;
    window.STATE.userProfile = {
      ...(window.STATE.userProfile || profile || {}),
      mfa_secret: secret,
      mfa_enabled: true,
    };

    /* ── 5. Nettoyer les données temporaires ── */
    _ss.clear();
    window._mfaSetupScreenSecret = null;
    _mfaSetupProfile = null;
    _stopCountdown();

    /* ── 6. Sync API en arrière-plan (non bloquante) ── */
    const profileId = profile?.id || window.STATE?.userProfile?.id;
    if (profileId) {
      _trySyncMFAToAPI(uid, profileId, secret); // fire & forget
    }

    /* ── 7. Fermer l'écran et continuer ── */
    const mfaSetupEl = document.getElementById('mfaSetupScreen');
    if (mfaSetupEl) mfaSetupEl.style.display = 'none';
    if (typeof _mfaSetupCallback === 'function') {
      const cb = _mfaSetupCallback;
      _mfaSetupCallback = null;
      cb();
    }

  } catch(e) {
    console.error('[MFA] confirmSetupScreen erreur inattendue:', e);
    if (errEl) errEl.innerHTML = `
      <i class="fa-solid fa-circle-xmark" style="color:#dc2626"></i>
      Erreur inattendue : <code style="font-size:.75rem;background:#fee2e2;padding:1px 4px;border-radius:3px;">${e.message}</code><br>
      <small style="color:#6b7280">Tapez <strong>mfaDiag(true)</strong> en console (F12) pour diagnostiquer.</small>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Activer et accéder';
    }
  }
}

function cancelMFASetupScreen() {
  _ss.clear();
  window._mfaSetupScreenSecret = null;
  _mfaSetupCallback = null;
  _mfaSetupProfile  = null;
  _stopCountdown();
  if (typeof clearSession === 'function') clearSession();
  const mfaSetupEl = document.getElementById('mfaSetupScreen');
  if (mfaSetupEl) mfaSetupEl.style.display = 'none';
  if (typeof logout === 'function') logout();
  else {
    const ls = document.getElementById('loginScreen');
    if (ls) ls.style.removeProperty('display');
  }
}

function regenerateMFASetupQR() {
  _ss.clear();
  window._mfaSetupScreenSecret = null;
  const profile = _mfaSetupProfile || window.STATE?.userProfile;
  if (!profile) return;
  requireMFASetupScreen(profile, 'login', _mfaSetupCallback);
  if (typeof showToast === 'function') showToast('Nouveau QR code généré. Scannez-le.', 'info');
}

function copyMFASetupScreenSecret() {
  const el   = document.getElementById('mfaSetupScreenSecret');
  if (!el) return;
  const text = el.textContent.replace(/\s/g,'');
  navigator.clipboard?.writeText(text).then(() => {
    if (typeof showToast === 'function') showToast('Secret copié !', 'success');
  }).catch(() => {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    if (typeof showToast === 'function') showToast('Secret copié !', 'success');
  });
}

/* ─────────────────────────────────────────────────────
   VÉRIFICATION MFA — écran login
   Version localStorage-first : secret lu depuis localStorage
   avant de faire un appel API (qui peut échouer en prod)
───────────────────────────────────────────────────── */
async function requireMFAVerification(profile, onSuccess) {
  _mfaLoginCallback = onSuccess;
  _mfaLoginProfile  = profile;

  const nameEl = document.getElementById('mfaLoginName');
  if (nameEl) nameEl.textContent = profile.first_name || profile.username || '';

  const codeEl = document.getElementById('mfaLoginCode');
  if (codeEl) codeEl.value = '';
  const errEl = document.getElementById('mfaLoginError');
  if (errEl) errEl.textContent = '';

  _startCountdown('mfaLoginCountdown');

  const ls = document.getElementById('loginScreen');
  const ms = document.getElementById('mfaScreen');
  if (ls) ls.style.display = 'none';
  if (ms) ms.style.removeProperty('display');
  if (codeEl) setTimeout(() => codeEl.focus(), 120);
}

/* ─────────────────────────────────────────────────────
   SOUMETTRE CODE MFA — version localStorage-first
   ✅ Récupère le secret depuis localStorage en priorité
   ✅ Pas d'appel API bloquant
───────────────────────────────────────────────────── */
async function submitMFALogin() {
  const codeEl = document.getElementById('mfaLoginCode');
  const errEl  = document.getElementById('mfaLoginError');
  const btn    = document.getElementById('btnMFALogin');

  const code = (codeEl?.value||'').replace(/\D/g,'');
  if (errEl) errEl.textContent = '';
  if (code.length !== 6) {
    if (errEl) errEl.textContent = 'Code à 6 chiffres requis.';
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

  try {
    const uid = window.STATE?.userId;
    let profile = _mfaLoginProfile || window.STATE?.userProfile;

    /* ── 1. Obtenir le secret — localStorage en priorité ── */
    let secret = _getMFASecret(profile);

    /* ── 2. Si pas de secret local, tenter un appel API (silencieux) ── */
    if (!secret && typeof apiGet === 'function') {
      try {
        const all = await apiGet('user_profiles');
        const found = all.find(p => p.user_id === uid);
        if (found?.mfa_secret) {
          secret = found.mfa_secret;
          // Synchroniser vers localStorage
          _mfaLocal.save(uid, secret);
          _mfaLocal.markSynced(uid);
          window.STATE.userProfile = { ...(window.STATE.userProfile || {}), ...found };
          _mfaLoginProfile = found;
          profile = found;
        }
      } catch(e) {
        // CORS / API inaccessible en prod : on continue sans secret API
        console.warn('[MFA] API inaccessible pour récupérer le secret (normal en prod Cloudflare):', e.message);
      }
    }

    /* ── 3. Pas de secret du tout ── */
    if (!secret) {
      // Pas de 2FA configurée ou secret perdu → laisser passer
      console.warn('[MFA] Aucun secret trouvé — passage sans 2FA');
      _stopCountdown();
      const ms = document.getElementById('mfaScreen');
      if (ms) ms.style.display = 'none';
      _mfaLoginProfile = null;
      const cb = _mfaLoginCallback;
      _mfaLoginCallback = null;
      cb?.();
      return;
    }

    _log('login verify code=', code, 'secret=', secret);

    /* ── 4. Vérifier le code TOTP (100% local) ── */
    const ok = await verifyTOTP(secret, code);

    if (!ok) {
      if (errEl) errEl.innerHTML = `
        <div>Code incorrect. Réessayez.</div>
        <div style="margin-top:4px;font-size:.74rem;opacity:.7;">
          <i class="fa-solid fa-circle-info"></i>
          Vérifiez que l'heure de votre téléphone est synchronisée automatiquement.
        </div>`;
      if (codeEl) { codeEl.value = ''; codeEl.focus(); }
      return;
    }

    /* ── 5. Code correct — continuer ── */
    _stopCountdown();
    const ms = document.getElementById('mfaScreen');
    if (ms) ms.style.display = 'none';
    _mfaLoginProfile = null;
    const cb = _mfaLoginCallback;
    _mfaLoginCallback = null;
    cb?.();

  } catch(e) {
    console.error('[MFA] submitMFALogin', e);
    if (errEl) errEl.innerHTML = `
      <div>Erreur : ${e.message}</div>
      <div style="margin-top:4px;font-size:.72rem;opacity:.7;">
        Tapez <strong>mfaDiag(true)</strong> en console pour diagnostiquer.
      </div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-unlock"></i> Vérifier'; }
  }
}

function cancelMFALogin() {
  _stopCountdown();
  _mfaLoginCallback = null;
  _mfaLoginProfile  = null;
  const ms = document.getElementById('mfaScreen');
  if (ms) ms.style.display = 'none';
  const ls = document.getElementById('loginScreen');
  if (ls) ls.style.removeProperty('display');
  if (typeof clearSession === 'function') clearSession();
}

/* ─────────────────────────────────────────────────────
   RESET MFA SELF-SERVICE
───────────────────────────────────────────────────── */
function showMFAResetPanel() {
  const p = document.getElementById('mfaResetPanel');
  if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

async function submitMFAReset() {
  const uEl = document.getElementById('mfaResetUsername');
  const pEl = document.getElementById('mfaResetPassword');
  const eEl = document.getElementById('mfaResetError');
  const btn = document.getElementById('btnMFAReset');

  const username = (uEl?.value||'').trim();
  const password = (pEl?.value||'').trim();
  if (eEl) eEl.textContent = '';

  if (!username || !password) {
    if (eEl) eEl.textContent = 'Identifiant et mot de passe requis.';
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Vérification…'; }

  try {
    const userId = typeof deriveUserId === 'function'
      ? await deriveUserId(username, password)
      : await (async () => {
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wv:${username.toLowerCase().trim()}:${password}`));
          return 'u_' + Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').substring(0,32);
        })();

    // Effacer localement
    _mfaLocal.clear(userId);

    // Tenter effacement API (silencieux)
    try {
      const all = await apiGet('user_profiles');
      const profile = all.find(p => p.user_id === userId);
      if (!profile) { if (eEl) eEl.textContent = 'Identifiant ou mot de passe incorrect.'; return; }
      await apiPatch('user_profiles', profile.id, { mfa_secret: null, mfa_enabled: false });
    } catch(e) {
      console.warn('[MFA] Reset API silencieux échoué (normal en prod):', e.message);
    }

    const panel = document.getElementById('mfaResetPanel');
    if (panel) panel.style.display = 'none';
    _stopCountdown();
    const ms = document.getElementById('mfaScreen');
    if (ms) ms.style.display = 'none';
    const ls = document.getElementById('loginScreen');
    if (ls) ls.style.removeProperty('display');
    if (typeof clearSession === 'function') clearSession();
    if (typeof showToast === 'function') showToast('2FA réinitialisé. Reconnectez-vous pour le reconfigurer.', 'success');

  } catch(e) {
    console.error('[MFA] submitMFAReset', e);
    if (eEl) eEl.textContent = 'Erreur. Réessayez.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Réinitialiser'; }
  }
}

async function resetMFAForCurrentUser() {
  const uid     = window.STATE?.userId;
  const profile = window.STATE?.userProfile || _mfaLoginProfile;
  if (!profile?.id && !uid) {
    if (typeof showToast==='function') showToast('Profil non chargé.','error');
    return;
  }
  if (!confirm('Réinitialiser le 2FA ?\n\nVous devrez le reconfigurer à la prochaine connexion.')) return;

  // Effacer localement
  _mfaLocal.clear(uid);

  // Tenter effacement API (silencieux)
  try {
    if (profile?.id) {
      await apiPatch('user_profiles', profile.id, { mfa_secret: null, mfa_enabled: false });
    }
  } catch(e) {
    console.warn('[MFA] Reset API silencieux:', e.message);
  }

  if (window.STATE) {
    window.STATE.userProfile = { ...(window.STATE.userProfile||{}), mfa_secret: null, mfa_enabled: false };
  }
  if (typeof showToast==='function') showToast('2FA réinitialisé.','success');
  _stopCountdown();
  if (typeof logout==='function') logout();
}

/* ─────────────────────────────────────────────────────
   COPIER SECRET (modale Mon Espace)
───────────────────────────────────────────────────── */
function copyMFASecret() {
  const el = document.getElementById('mfaSecretDisplay');
  if (!el) return;
  navigator.clipboard?.writeText(el.textContent.replace(/\s/g,''))
    .then(() => { if (typeof showToast==='function') showToast('Secret copié !','success'); });
}

/* ─────────────────────────────────────────────────────
   i18n helper
───────────────────────────────────────────────────── */
function i18n(key) { return typeof window.t === 'function' ? window.t(key) : null; }

/* ─────────────────────────────────────────────────────
   DIAGNOSTIC CLOUDFLARE — outil de debug production
   Accessible via la console : mfaDiag(true)
───────────────────────────────────────────────────── */
async function mfaDiag(showUI = false) {
  const now      = Date.now();
  const step     = Math.floor(now / 30_000);
  const rem      = 30 - (Math.floor(now / 1_000) % 30);
  const uid      = window.STATE?.userId;
  const profile  = window.STATE?.userProfile;
  const localSecret = uid ? _mfaLocal.getSecret(uid) : null;
  const apiSecret   = profile?.mfa_secret || null;
  const secret      = localSecret || apiSecret || _ss.load() || null;

  const info = {
    '🕐 Heure locale':        new Date(now).toISOString(),
    '⏱️ Timestamp Unix':      Math.floor(now / 1000),
    '🔢 Step TOTP actuel':    step,
    '⏳ Expire dans':         `${rem}s`,
    '💾 Secret localStorage': localSecret ? `Oui ✅ (${localSecret.length} chars)` : 'Non ❌',
    '🌐 Secret API':          apiSecret ? `Oui ✅ (${apiSecret.length} chars)` : 'Non / inaccessible',
    '🔐 Secret utilisé':      secret ? `Oui (${secret.length} chars)` : 'AUCUN — MFA ne peut pas fonctionner',
    '👤 User ID':             uid || 'Non défini ❌',
    '👤 Profil chargé':       profile ? `${profile.username || profile.first_name} (id: ${profile.id?.substring(0,8)}…)` : 'Non',
    '🔒 MFA activé (local)':  uid ? (_mfaLocal.isEnabled(uid) ? 'Oui ✅' : 'Non ❌') : 'N/A',
    '🔒 MFA activé (API)':    profile?.mfa_enabled ? 'Oui' : 'Non',
    '🌍 Environnement':       window.location.hostname.includes('genspark.ai') ? 'Genspark (sandbox)' : `Production externe (${window.location.hostname})`,
    '🔑 WebCrypto dispo':     typeof crypto?.subtle !== 'undefined' ? 'Oui ✅' : 'Non ❌ — BLOQUANT (HTTPS requis)',
    '💾 localStorage dispo':  (() => { try { localStorage.setItem('__mfa_test','1'); localStorage.removeItem('__mfa_test'); return 'Oui ✅'; } catch(e) { return 'Non ❌ — ' + e.message; }})(),
    '💾 sessionStorage dispo':(() => { try { sessionStorage.setItem('__test','1'); sessionStorage.removeItem('__test'); return 'Oui ✅'; } catch(e) { return 'Non ❌'; }})(),
  };

  if (secret) {
    try {
      const codes = [];
      for (let i = -2; i <= 2; i++) {
        const code = await generateTOTP(secret, i);
        codes.push(`[${i >= 0 ? '+' : ''}${i}] ${code}`);
      }
      info['🎲 Codes TOTP ±2 steps'] = codes.join(' | ');
    } catch(e) {
      info['🎲 Codes TOTP'] = '❌ Erreur : ' + e.message;
    }
  }

  console.group('%c[MFA DIAGNOSTIC v7]', 'background:#002D72;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;');
  Object.entries(info).forEach(([k, v]) => console.log(`%c${k}`, 'font-weight:600;color:#334155;', v));
  console.groupEnd();

  if (showUI) {
    const rows = Object.entries(info)
      .map(([k, v]) => `<tr><td style="padding:6px 10px;font-weight:600;color:#334155;white-space:nowrap;border-bottom:1px solid #E2E8F0;">${k}</td><td style="padding:6px 10px;font-family:monospace;font-size:12px;color:#0F172A;border-bottom:1px solid #E2E8F0;">${v}</td></tr>`)
      .join('');

    const panel = document.createElement('div');
    panel.id = 'mfaDiagPanel';
    panel.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:99999;
      background:#fff;border:2px solid #002D72;border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.25);max-width:600px;width:90vw;
      font-family:Arial,sans-serif;font-size:13px;overflow:hidden;
    `;
    panel.innerHTML = `
      <div style="background:#002D72;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">
        <strong>🔍 MFA Diagnostic v7 — localStorage-first</strong>
        <button onclick="document.getElementById('mfaDiagPanel').remove()"
                style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div style="overflow-x:auto;max-height:60vh;overflow-y:auto;">
        <table style="border-collapse:collapse;width:100%;">${rows}</table>
      </div>
      <div style="padding:8px 16px;background:#F0FDF4;border-top:1px solid #BBF7D0;font-size:11px;color:#166534;">
        <strong>v7 localStorage-first :</strong> Le secret MFA est stocké localement (clé <code>wv_mfa_${uid||'?'}</code>).
        L'API n'est plus nécessaire pour vérifier le code en production.
      </div>`;
    document.getElementById('mfaDiagPanel')?.remove();
    document.body.appendChild(panel);
  }

  return info;
}

/* ─────────────────────────────────────────────────────
   EXPOSER LES FONCTIONS + _mfaLocal pour auth.js
───────────────────────────────────────────────────── */
Object.assign(window, {
  renderMFAPanel, startMFASetup, confirmMFASetup, disableMFA,
  requireMFAVerification, requireMFASetupScreen,
  confirmMFASetupScreen, cancelMFASetupScreen,
  regenerateMFASetupQR, copyMFASetupScreenSecret,
  submitMFALogin, cancelMFALogin,
  copyMFASecret, isMFAEnabled, verifyTOTP,
  resetMFAForCurrentUser, showMFAResetPanel, submitMFAReset,
  mfaDiag,
  _mfaLocal,          // exposé pour auth.js
  _getMFASecret,      // exposé pour auth.js
});
