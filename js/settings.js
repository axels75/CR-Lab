/* =====================================================
   WAVESTONE CR MASTER – settings.js  v3 (réécriture complète)
   =====================================================
   ARCHITECTURE :
   - Settings GLOBAUX  : localStorage('wv_settings')
   - Settings PROJET   : champ template_settings (JSON) + template_logo (base64) dans D1
   - Quand un projet est actif, la modale affiche ses settings.
   - "Appliquer" sauvegarde dans le projet (D1) ou globalement (localStorage).
   - "Réinitialiser" supprime le template du projet actif (revient au global).
   ===================================================== */

/* ── Valeurs par défaut (défini dans app.js, accessible ici) ─────────── */
/* DEFAULT_SETTINGS_INLINE est déclaré dans app.js (chargé avant) */

/* ══════════════════════════════════════════════════════════════════════
   PERSISTANCE
══════════════════════════════════════════════════════════════════════ */

function saveSettings(settings) {
  try { localStorage.setItem('wv_settings', JSON.stringify(settings)); } catch(e) {}
}

/* ══════════════════════════════════════════════════════════════════════
   APPLICATION DES SETTINGS (couleurs CSS + typo + sidebar contrast)
══════════════════════════════════════════════════════════════════════ */

function applySettings(settings) {
  if (!settings) return;
  const root    = document.documentElement;
  const sidebar = document.querySelector('.sidebar');
  const primary = (settings.primaryColor || '#002D72').trim();
  const accent  = (settings.accentColor  || '#E8007D').trim();

  /* ── Couleurs de base ── */
  const primaryLight = adjustColor(primary,  40);
  const primaryDark  = adjustColor(primary, -20);

  root.style.setProperty('--primary',       primary);
  root.style.setProperty('--primary-light', primaryLight);
  root.style.setProperty('--primary-dark',  primaryDark);
  root.style.setProperty('--accent',        accent);
  root.style.setProperty('--font',   settings.font     || 'Inter, Arial, sans-serif');
  root.style.setProperty('--font-size', (settings.fontSize || 14) + 'px');

  /* ── Contraste sidebar ── */
  const lumP = _lum(primary);
  const lumD = _lum(primaryDark);

  const bodyDark   = _useDark(lumD);   // fond principal sidebar
  const headerDark = _useDark(lumP);   // fond header sidebar

  /* Helper : applique une variable sur :root ET sur .sidebar (pour override les defaults CSS) */
  const setSidebarVar = (name, value) => {
    root.style.setProperty(name, value);
    if (sidebar) sidebar.style.setProperty(name, value);
  };

  if (bodyDark) {
    // Fond clair → texte sombre
    setSidebarVar('--sidebar-fg',           '#1a1a1a');
    setSidebarVar('--sidebar-fg-muted',     'rgba(0,0,0,0.58)');
    setSidebarVar('--sidebar-fg-subtle',    'rgba(0,0,0,0.38)');
    setSidebarVar('--sidebar-hover-bg',     'rgba(0,0,0,0.07)');
    setSidebarVar('--sidebar-active-bg',    'rgba(0,0,0,0.13)');
    setSidebarVar('--sidebar-border',       'rgba(0,0,0,0.14)');
    setSidebarVar('--sidebar-input-bg',     'rgba(0,0,0,0.06)');
    setSidebarVar('--sidebar-input-border', 'rgba(0,0,0,0.18)');
    setSidebarVar('--sidebar-cr-bg',        'rgba(0,0,0,0.05)');
    setSidebarVar('--sidebar-scroll',       'rgba(0,0,0,0.22)');
    _adaptLogo('dark');
  } else {
    // Fond sombre → texte clair
    setSidebarVar('--sidebar-fg',           'rgba(255,255,255,0.93)');
    setSidebarVar('--sidebar-fg-muted',     'rgba(255,255,255,0.60)');
    setSidebarVar('--sidebar-fg-subtle',    'rgba(255,255,255,0.38)');
    setSidebarVar('--sidebar-hover-bg',     'rgba(255,255,255,0.09)');
    setSidebarVar('--sidebar-active-bg',    'rgba(255,255,255,0.16)');
    setSidebarVar('--sidebar-border',       'rgba(255,255,255,0.12)');
    setSidebarVar('--sidebar-input-bg',     'rgba(255,255,255,0.09)');
    setSidebarVar('--sidebar-input-border', 'rgba(255,255,255,0.16)');
    setSidebarVar('--sidebar-cr-bg',        'rgba(0,0,0,0.15)');
    setSidebarVar('--sidebar-scroll',       'rgba(255,255,255,0.22)');
    _adaptLogo('light');
  }

  /* ── Header sidebar ── */
  setSidebarVar('--sidebar-header-fg',
    headerDark ? '#1a1a1a' : 'rgba(255,255,255,0.92)');
  setSidebarVar('--sidebar-header-border',
    headerDark ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.11)');

  /* ── Bouton "Nouveau CR" ── */
  let btnBg = (_cr(accent, primaryDark) >= 3.0)
    ? accent
    : _ensureContrast(accent, primaryDark, 3.0);
  setSidebarVar('--sidebar-btn-new-bg', btnBg);
  setSidebarVar('--sidebar-btn-new-fg', _best(btnBg));

  /* ── Accent text ── */
  setSidebarVar('--accent-fg',  _best(accent));
  root.style.setProperty('--primary-fg', _best(primary));

  /* ── Titre ── */
  document.title = (settings.orgName || 'Wavestone') + ' CR Master';
  const nameEl = document.querySelector('.sidebar-app-name');
  if (nameEl) nameEl.textContent = 'CR Master';
}

/* ══════════════════════════════════════════════════════════════════════
   LOGO SIDEBAR
══════════════════════════════════════════════════════════════════════ */

function _adaptLogo(mode) {
  const logo = document.getElementById('sidebarLogo');
  if (!logo) return;
  const isCustom = localStorage.getItem('wv_logo_custom') === '1'
    || (logo.src && !logo.src.includes('wavestone-logo.png'));
  if (isCustom) { logo.style.filter = 'none'; return; }
  logo.style.filter = (mode === 'dark') ? 'invert(1) brightness(0.15)' : 'none';
}

function _applyProjectLogo(project) {
  const logo = document.getElementById('sidebarLogo');
  if (!logo) return;
  if (project && project.template_logo) {
    logo.src = project.template_logo;
    logo.style.filter = 'none';
  } else {
    logo.src = localStorage.getItem('wv_logo') || 'images/wavestone-logo.png';
    logo.style.filter = 'none';
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SETTINGS ACTIFS (projet ou global)
══════════════════════════════════════════════════════════════════════ */

function getActiveSettings() {
  const global = STATE.settings;
  if (!STATE.currentProjectId) return global;
  const proj = STATE.projects && STATE.projects.find(p => p.id === STATE.currentProjectId);
  if (!proj || !proj.template_settings) return global;
  try {
    const ps = typeof proj.template_settings === 'string'
      ? JSON.parse(proj.template_settings)
      : proj.template_settings;
    return { ...global, ...ps };
  } catch { return global; }
}

function applyProjectSettings(projectId) {
  const proj = STATE.projects && STATE.projects.find(p => p.id === projectId);
  applySettings(proj ? getActiveSettings() : STATE.settings);
  _applyProjectLogo(proj || null);
}

/* ══════════════════════════════════════════════════════════════════════
   INITIALISATION DE LA MODALE (appelée UNE FOIS au démarrage)
══════════════════════════════════════════════════════════════════════ */

function initSettingsModal() {
  /* ── Guard : éviter double-initialisation ── */
  if (initSettingsModal._done) return;
  initSettingsModal._done = true;

  /* ── Color pickers ── */
  try {
    const colPrimary = document.getElementById('settingPrimaryColor');
    const hexPrimary = document.getElementById('settingPrimaryHex');
    const colAccent  = document.getElementById('settingAccentColor');
    const hexAccent  = document.getElementById('settingAccentHex');

    if (!colPrimary) {
      console.warn('[Settings] Color picker not found – check HTML');
    } else {
      colPrimary.addEventListener('input', () => {
        if (hexPrimary) hexPrimary.value = colPrimary.value;
        _livePreview();
      });
      if (hexPrimary) {
        hexPrimary.addEventListener('input', () => {
          if (/^#[0-9A-Fa-f]{6}$/.test(hexPrimary.value)) {
            colPrimary.value = hexPrimary.value;
            _livePreview();
          }
        });
      }
    }

    if (colAccent) {
      colAccent.addEventListener('input', () => {
        if (hexAccent) hexAccent.value = colAccent.value;
        _livePreview();
      });
      if (hexAccent) {
        hexAccent.addEventListener('input', () => {
          if (/^#[0-9A-Fa-f]{6}$/.test(hexAccent.value)) {
            colAccent.value = hexAccent.value;
            _livePreview();
          }
        });
      }
    }
  } catch(e) { console.error('[Settings] Color pickers init error:', e); }

  /* ── Font size range ── */
  try {
    const rangeSize = document.getElementById('settingFontSize');
    const lblSize   = document.getElementById('settingFontSizeVal');
    if (rangeSize && lblSize) {
      rangeSize.addEventListener('input', () => {
        lblSize.textContent = rangeSize.value + 'px';
      });
    }
  } catch(e) { console.error('[Settings] FontSize range init error:', e); }

  /* ── Font picker ── */
  try {
    _initFontPicker();
  } catch(e) { console.error('[Settings] FontPicker init error:', e); }

  /* ── Bouton Appliquer ── */
  try {
    const btnApply = document.getElementById('btnApplySettings');
    if (btnApply) {
      btnApply.removeAttribute('onclick');
      btnApply.addEventListener('click', applyAndSaveSettings);
      console.log('[Settings] btnApplySettings listener attached');
    } else {
      console.warn('[Settings] btnApplySettings not found in DOM');
    }
  } catch(e) { console.error('[Settings] btnApply init error:', e); }

  /* ── Bouton Réinitialiser ── */
  try {
    const btnReset = document.getElementById('btnResetSettings');
    if (btnReset) {
      btnReset.removeAttribute('onclick');
      btnReset.addEventListener('click', resetSettingsToDefault);
      console.log('[Settings] btnResetSettings listener attached');
    }
  } catch(e) { console.error('[Settings] btnReset init error:', e); }

  /* ── Logo upload ── */
  try {
    const btnLogo   = document.getElementById('btnChangeLogo');
    const inputLogo = document.getElementById('logoFileInput');
    if (btnLogo && inputLogo) {
      btnLogo.addEventListener('click', () => inputLogo.click());
      inputLogo.addEventListener('change', _onLogoChange);
      console.log('[Settings] Logo upload listener attached');
    } else {
      console.warn('[Settings] btnChangeLogo or logoFileInput not found');
    }
  } catch(e) { console.error('[Settings] Logo upload init error:', e); }

  console.log('[Settings] initSettingsModal completed successfully');
}

/* Preview en temps réel (pendant la sélection dans le color picker) */
function _livePreview() {
  const primary = document.getElementById('settingPrimaryColor')?.value;
  const accent  = document.getElementById('settingAccentColor')?.value;
  if (primary && accent) {
    applySettings({ ...getActiveSettings(), primaryColor: primary, accentColor: accent });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   OUVERTURE DE LA MODALE (appelée à chaque ouverture)
══════════════════════════════════════════════════════════════════════ */

let _snap = null; // snapshot avant ouverture pour annulation

function openSettingsModal() {
  /* S'assurer que les listeners sont bien initialisés (au cas où init non encore appelée) */
  if (!initSettingsModal._done) initSettingsModal();

  const settings = getActiveSettings();
  _syncControls(settings);
  _updateBanner();

  /* Snapshot pour annulation */
  _snap = { ...settings };

  /* Attacher listener annulation une seule fois */
  const overlay  = document.getElementById('modalSettings');
  const closeBtn = overlay && overlay.querySelector('[data-close="modalSettings"]');
  if (closeBtn && !closeBtn._cancelBound) {
    closeBtn._cancelBound = true;
    closeBtn.addEventListener('click', _cancelSettings);
  }

  openModal('modalSettings');
}

function _cancelSettings() {
  if (_snap) {
    applySettings(_snap);
    if (STATE.currentProjectId) {
      const proj = STATE.projects && STATE.projects.find(p => p.id === STATE.currentProjectId);
      _applyProjectLogo(proj || null);
    }
    _snap = null;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SYNCHRONISATION DES CONTRÔLES AVEC LES SETTINGS
══════════════════════════════════════════════════════════════════════ */

function _syncControls(s) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('settingPrimaryColor', s.primaryColor);
  set('settingPrimaryHex',   s.primaryColor);
  set('settingAccentColor',  s.accentColor);
  set('settingAccentHex',    s.accentColor);
  set('settingFontSize',     s.fontSize);
  set('settingOrgName',      s.orgName || 'Wavestone');
  setText('settingFontSizeVal', (s.fontSize || 14) + 'px');

  _selectFont(s.font);

  /* Logo preview */
  const preview = document.getElementById('settingsLogoPreview');
  if (preview) {
    delete preview.dataset.pendingLogo;
    if (STATE.currentProjectId) {
      const proj = STATE.projects && STATE.projects.find(p => p.id === STATE.currentProjectId);
      preview.src = (proj && proj.template_logo) || localStorage.getItem('wv_logo') || 'images/wavestone-logo.png';
    } else {
      preview.src = localStorage.getItem('wv_logo') || 'images/wavestone-logo.png';
    }
  }
}

/* Alias public (utilisé depuis app.js) */
function syncSettingsControls(s) { _syncControls(s); }

/* ══════════════════════════════════════════════════════════════════════
   FONT PICKER
══════════════════════════════════════════════════════════════════════ */

function _initFontPicker() {
  const opts = document.querySelectorAll('.font-option');
  if (!opts.length) { console.warn('[Settings] No .font-option elements found'); return; }

  opts.forEach(opt => {
    /* Charger Google Font si nécessaire */
    const gf = opt.dataset.gfont;
    if (gf) _loadGFont(gf);

    /* Guard : ne pas ajouter le listener deux fois */
    if (opt._fontBound) return;
    opt._fontBound = true;

    opt.addEventListener('click', () => {
      opts.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const hidden = document.getElementById('settingFont');
      if (hidden) hidden.value = opt.dataset.font;
    });
  });
  _selectFont((STATE.settings && STATE.settings.font) || 'Inter, Arial, sans-serif');
}

function _selectFont(fontValue) {
  const opts = document.querySelectorAll('.font-option');
  let found  = false;
  opts.forEach(opt => {
    opt.classList.remove('selected');
    if (opt.dataset.font === fontValue) { opt.classList.add('selected'); found = true; }
  });
  if (!found && opts.length > 0) {
    opts[0].classList.add('selected');
    fontValue = opts[0].dataset.font;
  }
  const hidden = document.getElementById('settingFont');
  if (hidden) hidden.value = fontValue || 'Inter, Arial, sans-serif';
}

function _loadGFont(family) {
  const id = 'gfont_' + family.replace(/[^a-z0-9]/gi, '_');
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap';
  document.head.appendChild(link);
}

/* Alias public (anciennement utilisé depuis app.js) */
function initFontPicker()         { _initFontPicker(); }
function selectFontOption(f)      { _selectFont(f); }
function loadGoogleFont(f)        { _loadGFont(f); }

/* ══════════════════════════════════════════════════════════════════════
   LOGO CHANGE HANDLER
══════════════════════════════════════════════════════════════════════ */

function _onLogoChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast(t('logo_image_required'), 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    const preview = document.getElementById('settingsLogoPreview');
    if (preview) preview.src = dataUrl;

    if (STATE.currentProjectId) {
      /* Stocker en attente : sera sauvegardé en D1 au clic Appliquer */
      if (preview) preview.dataset.pendingLogo = dataUrl;
      if (typeof showToast === 'function') showToast(t('logo_project_pending'), 'info');
    } else {
      /* Logo global → localStorage immédiatement */
      const sidebar = document.getElementById('sidebarLogo');
      if (sidebar) { sidebar.src = dataUrl; sidebar.style.filter = 'none'; }
      localStorage.setItem('wv_logo', dataUrl);
      localStorage.setItem('wv_logo_custom', '1');
      if (typeof showToast === 'function') showToast(t('logo_global_updated'), 'success');
    }
  };
  reader.readAsDataURL(file);
  /* Reset input pour permettre re-sélection du même fichier */
  e.target.value = '';
}

/* ══════════════════════════════════════════════════════════════════════
   BANDEAU PROJET
══════════════════════════════════════════════════════════════════════ */

function _updateBanner() {
  const banner = document.getElementById('settingsProjectBanner');
  if (!banner) return;

  if (STATE.currentProjectId) {
    const proj = STATE.projects && STATE.projects.find(p => p.id === STATE.currentProjectId);
    const name  = proj ? esc(proj.name) : t('settings_global_label');
    const color = proj ? (proj.color || '#002D72') : '#002D72';
    banner.style.display = 'flex';
    banner.innerHTML = `
      <span class="settings-banner-dot" style="background:${color}"></span>
      <span>Template <strong>${name}</strong></span>
      <span class="settings-banner-hint">${t('settings_project_hint')}</span>`;
  } else {
    banner.style.display = 'flex';
    banner.innerHTML = `
      <span class="settings-banner-dot" style="background:#94A3B8"></span>
      <span><strong>${t('settings_global_label')}</strong></span>
      <span class="settings-banner-hint">${t('settings_global_hint')}</span>`;
  }
}

/* ── esc() helper local (au cas où la globale ne soit pas dispo) ── */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════════════════
   APPLIQUER ET SAUVEGARDER
══════════════════════════════════════════════════════════════════════ */

async function applyAndSaveSettings() {
  /* Snapshot annulé : l'utilisateur valide */
  _snap = null;

  /* Lire les valeurs depuis la modale */
  const fontHidden = document.getElementById('settingFont');
  const settings = {
    primaryColor: document.getElementById('settingPrimaryColor')?.value || '#002D72',
    accentColor:  document.getElementById('settingAccentColor')?.value  || '#E8007D',
    font:         (fontHidden && fontHidden.value) || 'Inter, Arial, sans-serif',
    fontSize:     parseInt(document.getElementById('settingFontSize')?.value || '14'),
    orgName:      (document.getElementById('settingOrgName')?.value || '').trim() || 'Wavestone',
  };

  const preview     = document.getElementById('settingsLogoPreview');
  const pendingLogo = preview && preview.dataset.pendingLogo || null;

  if (STATE.currentProjectId) {
    /* ── Sauvegarder dans le projet (PATCH partiel) ── */
    const proj = STATE.projects && STATE.projects.find(p => p.id === STATE.currentProjectId);
    if (!proj) {
      if (typeof showToast === 'function') showToast(t('template_save_error'), 'error');
      return;
    }
    /* N'envoyer QUE les champs qui changent, pas les champs système */
    const patch = { template_settings: JSON.stringify(settings) };
    if (pendingLogo) patch.template_logo = pendingLogo;

    try {
      const saved = await apiPatch('projects', proj.id, patch);
      const idx = STATE.projects.findIndex(p => p.id === proj.id);
      if (idx !== -1) {
        // Fusionner : réponse API + patch local (au cas où l'API ne retourne pas tous les champs)
        STATE.projects[idx] = { ...STATE.projects[idx], ...patch, ...saved };
      }
      applySettings(settings);
      _applyProjectLogo(STATE.projects[idx] || proj);
      if (preview) delete preview.dataset.pendingLogo;
      if (typeof closeModal === 'function') closeModal('modalSettings');
      if (typeof showToast === 'function') {
        showToast(`${t('template_project_saved').replace('!', '')} "${proj.name}" !`, 'success');
      }
    } catch(err) {
      console.error('[Settings] save project template:', err);
      if (typeof showToast === 'function') showToast(t('template_save_error'), 'error');
    }

  } else {
    /* ── Sauvegarder globalement (localStorage) ── */
    STATE.settings = settings;
    saveSettings(settings);
    applySettings(settings);
    if (pendingLogo) {
      localStorage.setItem('wv_logo', pendingLogo);
      localStorage.setItem('wv_logo_custom', '1');
      const sidebar = document.getElementById('sidebarLogo');
      if (sidebar) sidebar.src = pendingLogo;
      if (preview) delete preview.dataset.pendingLogo;
    }
    if (typeof closeModal === 'function') closeModal('modalSettings');
    if (typeof showToast === 'function') showToast(t('settings_global_applied'), 'success');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   RÉINITIALISER
══════════════════════════════════════════════════════════════════════ */

async function resetSettingsToDefault() {
  if (STATE.currentProjectId) {
    const proj = STATE.projects && STATE.projects.find(p => p.id === STATE.currentProjectId);
    if (!proj) return;

    /* Utiliser confirmAction si disponible, sinon confirm() natif */
    const confirmed = (typeof window.confirmAction === 'function')
      ? await window.confirmAction(
          t('reset_project_template'),
          `"${proj.name}" ${t('reset_project_template_msg')}`,
          t('reset_btn'),
          'danger')
      : window.confirm(`${t('reset_project_template')}\n"${proj.name}" ${t('reset_project_template_msg')}`);

    if (!confirmed) return;

    try {
      /* PATCH partiel : effacer uniquement les champs template */
      const resetPatch = { template_settings: '', template_logo: '' };
      const saved = await apiPatch('projects', proj.id, resetPatch);
      const idx = STATE.projects.findIndex(p => p.id === proj.id);
      if (idx !== -1) {
        STATE.projects[idx] = { ...STATE.projects[idx], ...resetPatch, ...saved };
      }
      _syncControls(STATE.settings);
      applySettings(STATE.settings);
      _applyProjectLogo(null);
      if (typeof showToast === 'function') showToast(t('template_project_reset'), 'info');
    } catch(err) {
      console.error('[Settings] reset project template:', err);
      if (typeof showToast === 'function') showToast(t('template_reset_error'), 'error');
    }

  } else {
    /* Reset global */
    STATE.settings = { ...DEFAULT_SETTINGS_INLINE };
    saveSettings(STATE.settings);
    _syncControls(STATE.settings);
    applySettings(STATE.settings);
    localStorage.removeItem('wv_logo');
    localStorage.removeItem('wv_logo_custom');
    const sidebar = document.getElementById('sidebarLogo');
    if (sidebar) { sidebar.src = 'images/wavestone-logo.png'; sidebar.style.filter = 'none'; }
    const preview = document.getElementById('settingsLogoPreview');
    if (preview) { preview.src = 'images/wavestone-logo.png'; delete preview.dataset.pendingLogo; }
    if (typeof showToast === 'function') showToast(t('settings_global_reset'), 'info');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   UTILITAIRES WCAG 2.1
══════════════════════════════════════════════════════════════════════ */

function _lum(hex) {
  if (!hex || hex.length < 7) return 0;
  try {
    const lin = c => { const v = parseInt(c, 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(hex.slice(1,3)) + 0.7152 * lin(hex.slice(3,5)) + 0.0722 * lin(hex.slice(5,7));
  } catch { return 0; }
}

function _useDark(bgLum) {
  /* true = texte sombre sur ce fond */
  return (bgLum + 0.05) / 0.05 >= 1.05 / (bgLum + 0.05);
}

function _cr(hexA, hexB) {
  const a = _lum(hexA) + 0.05, b = _lum(hexB) + 0.05;
  return a > b ? a / b : b / a;
}

function _best(bgHex) {
  const l = _lum(bgHex);
  return ((l + 0.05) / 0.05) > (1.05 / (l + 0.05)) ? '#000000' : '#ffffff';
}

function _ensureContrast(hex, bgHex, minRatio) {
  for (let d = 10; d <= 160; d += 10) {
    if (_cr(adjustColor(hex, -d), bgHex) >= minRatio) return adjustColor(hex, -d);
    if (_cr(adjustColor(hex,  d), bgHex) >= minRatio) return adjustColor(hex,  d);
  }
  return _best(bgHex) === '#000000' ? '#1a1a1a' : '#f5f5f5';
}

function adjustColor(hex, amount) {
  try {
    const r = Math.min(255, Math.max(0, parseInt(hex.slice(1,3), 16) + amount));
    const g = Math.min(255, Math.max(0, parseInt(hex.slice(3,5), 16) + amount));
    const b = Math.min(255, Math.max(0, parseInt(hex.slice(5,7), 16) + amount));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  } catch { return hex; }
}

/* ══════════════════════════════════════════════════════════════════════
   EXPORTS GLOBAUX
══════════════════════════════════════════════════════════════════════ */

window.applySettings          = applySettings;
window.saveSettings           = saveSettings;
window.getActiveSettings      = getActiveSettings;
window.applyProjectSettings   = applyProjectSettings;
window.syncSettingsControls   = syncSettingsControls;
window.initSettingsModal      = initSettingsModal;
window.openSettingsModal      = openSettingsModal;
window.applyAndSaveSettings   = applyAndSaveSettings;
window.resetSettingsToDefault = resetSettingsToDefault;
window.initFontPicker         = initFontPicker;
window.selectFontOption       = selectFontOption;
window.loadGoogleFont         = loadGoogleFont;
window.adjustColor            = adjustColor;

/* loadSettings est défini dans app.js – on l'expose ici aussi pour rétrocompat */
window.loadSettings = window.loadSettings || function() {
  try {
    const saved = localStorage.getItem('wv_settings');
    return saved ? { ...DEFAULT_SETTINGS_INLINE, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS_INLINE };
  } catch { return { ...DEFAULT_SETTINGS_INLINE }; }
};
