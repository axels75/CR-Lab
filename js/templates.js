/* =====================================================
   WAVESTONE CR MASTER – templates.js
   Bibliothèque de templates CR + éditeur personnalisé
   ─────────────────────────────────────────────────────
   Fonctionnalités :
   • Templates par défaut (5 types pré-définis)
   • Création de templates personnalisés par glisser-déposer de modules
   • Application d'un template lors de la création d'un CR
   • Bibliothèque accessible depuis la vue d'édition CR
   ===================================================== */

'use strict';

/* ─────────────────────────────────────────────────────
   MODULES DISPONIBLES
   Chaque module correspond à une section du CR
───────────────────────────────────────────────────── */
const CR_MODULES = {
  context: {
    id:     'context',
    icon:   'fa-briefcase',
    color:  '#002D72',
    required: true, // toujours présent
    defaultConfig: {
      showMission:     true,
      showMeetingName: true,
      showDate:        true,
      showLocation:    true,
      showFacilitator: true,
      showAuthor:      true,
      showStatus:      true,
    },
  },
  participants: {
    id:    'participants',
    icon:  'fa-users',
    color: '#0066CC',
    required: false,
    defaultConfig: {
      showRole:    true,
      showCompany: true,
      showEmail:   false,
    },
  },
  actions: {
    id:    'actions',
    icon:  'fa-list-check',
    color: '#6366F1',
    required: false,
    defaultConfig: {
      showOwner:  true,
      showDue:    true,
      showStatus: true,
    },
  },
  key_points: {
    id:    'key_points',
    icon:  'fa-file-lines',
    color: '#0EA5E9',
    required: false,
    defaultConfig: {
      placeholder: '',
    },
  },
  decisions: {
    id:    'decisions',
    icon:  'fa-gavel',
    color: '#7C3AED',
    required: false,
    defaultConfig: {
      placeholder: '',
    },
  },
  risks: {
    id:    'risks',
    icon:  'fa-triangle-exclamation',
    color: '#EF4444',
    required: false,
    defaultConfig: {
      showImpact:      true,
      showProbability: true,
      showMitigation:  true,
    },
  },
  budget: {
    id:    'budget',
    icon:  'fa-chart-line',
    color: '#059669',
    required: false,
    defaultConfig: {
      currency: 'EUR',
    },
  },
  next_steps: {
    id:    'next_steps',
    icon:  'fa-arrow-right',
    color: '#D97706',
    required: false,
    defaultConfig: {
      placeholder: '',
    },
  },
  custom: {
    id:    'custom',
    icon:  'fa-pen-to-square',
    color: '#94A3B8',
    required: false,
    defaultConfig: {
      sectionTitle: '',
      placeholder:  '',
    },
  },
};

/* ─────────────────────────────────────────────────────
   TEMPLATES PAR DÉFAUT
───────────────────────────────────────────────────── */
const DEFAULT_TEMPLATES = [
  {
    id:          'tpl_standard',
    name_fr:     'CR Standard',
    name_en:     'Standard Meeting Note',
    desc_fr:     'Template complet pour réunions classiques : contexte, participants, actions et points clés.',
    desc_en:     'Complete template for standard meetings: context, participants, actions and key points.',
    icon:        'fa-file-lines',
    color:       '#002D72',
    category:    'default',
    is_system:   true,
    sort_order:  1,
    modules:     ['context','participants','actions','key_points'],
    modules_config: {},
  },
  {
    id:          'tpl_copil',
    name_fr:     'Comité de pilotage',
    name_en:     'Steering Committee',
    desc_fr:     'Adapté aux COPIL : décisions prises, actions, risques et prochaines étapes.',
    desc_en:     'For steering committees: decisions, actions, risks and next steps.',
    icon:        'fa-users-gear',
    color:       '#7C3AED',
    category:    'default',
    is_system:   true,
    sort_order:  2,
    modules:     ['context','participants','decisions','actions','risks','next_steps'],
    modules_config: {},
  },
  {
    id:          'tpl_workshop',
    name_fr:     'Atelier / Workshop',
    name_en:     'Workshop',
    desc_fr:     'Pour les ateliers de co-construction : points structurants, décisions et prochaines étapes.',
    desc_en:     'For co-creation workshops: key points, decisions and next steps.',
    icon:        'fa-lightbulb',
    color:       '#D97706',
    category:    'default',
    is_system:   true,
    sort_order:  3,
    modules:     ['context','participants','key_points','decisions','next_steps'],
    modules_config: {},
  },
  {
    id:          'tpl_quick',
    name_fr:     'CR Rapide',
    name_en:     'Quick Note',
    desc_fr:     'Template minimaliste : contexte et points clés uniquement.',
    desc_en:     'Minimal template: context and key points only.',
    icon:        'fa-bolt',
    color:       '#E8007D',
    category:    'default',
    is_system:   true,
    sort_order:  4,
    modules:     ['context','key_points'],
    modules_config: {},
  },
  {
    id:          'tpl_project',
    name_fr:     'Réunion Projet',
    name_en:     'Project Meeting',
    desc_fr:     'Suivi de projet complet : budget, risques, actions et prochaines étapes.',
    desc_en:     'Full project tracking: budget, risks, actions and next steps.',
    icon:        'fa-diagram-project',
    color:       '#059669',
    category:    'default',
    is_system:   true,
    sort_order:  5,
    modules:     ['context','participants','budget','risks','actions','next_steps'],
    modules_config: {},
  },
];

/* ─────────────────────────────────────────────────────
   ÉTAT LOCAL
───────────────────────────────────────────────────── */
let _userTemplates    = [];   // templates custom de l'utilisateur
let _editingTemplate  = null; // template en cours d'édition dans la modale
let _dragSrcModule    = null; // drag & drop

/* ─────────────────────────────────────────────────────
   FETCH DES TEMPLATES UTILISATEUR
───────────────────────────────────────────────────── */
async function fetchUserTemplates() {
  try {
    if (!STATE.userId) { _userTemplates = []; return; }
    const all = await apiGet('cr_templates');
    _userTemplates = all.filter(t => t.user_id === STATE.userId);
  } catch(e) {
    console.warn('[Templates] fetchUserTemplates failed:', e.message);
    _userTemplates = [];
  }
}

/* ─────────────────────────────────────────────────────
   OUVRIR LA BIBLIOTHÈQUE
───────────────────────────────────────────────────── */
async function openTemplateLibrary() {
  await fetchUserTemplates();
  renderTemplateLibrary();
  openModal('modalTemplateLibrary');
}

function renderTemplateLibrary() {
  const lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';
  const container = document.getElementById('templateLibraryGrid');
  if (!container) return;

  let html = '';

  // ── Templates par défaut ──────────────────────────
  html += `<div class="tpl-section-title">${lang==='en' ? 'Default templates' : 'Templates par défaut'}</div>`;
  html += '<div class="tpl-grid">';
  DEFAULT_TEMPLATES.forEach(tpl => {
    const name = lang === 'en' ? tpl.name_en : tpl.name_fr;
    const desc = lang === 'en' ? tpl.desc_en : tpl.desc_fr;
    const mods = tpl.modules.map(m => _moduleLabel(m, lang)).join(', ');
    html += `
      <div class="tpl-card" onclick="applyTemplate('${_tplEsc(tpl.id)}')">
        <div class="tpl-card-header" style="background:${tpl.color}">
          <i class="fa-solid ${tpl.icon}"></i>
        </div>
        <div class="tpl-card-body">
          <div class="tpl-card-name">${_tplEsc(name)}</div>
          <div class="tpl-card-desc">${_tplEsc(desc)}</div>
          <div class="tpl-card-modules">${_tplEsc(mods)}</div>
        </div>
        <button class="tpl-use-btn" onclick="event.stopPropagation();applyTemplate('${_tplEsc(tpl.id)}')">
          <i class="fa-solid fa-check"></i> ${lang==='en' ? 'Use' : 'Utiliser'}
        </button>
      </div>`;
  });
  html += '</div>';

  // ── Templates personnalisés ───────────────────────
  html += `<div class="tpl-section-title" style="margin-top:24px;">
    ${lang==='en' ? 'My templates' : 'Mes templates'}
    <button class="tpl-create-btn" onclick="openTemplateEditor(null)">
      <i class="fa-solid fa-plus"></i> ${lang==='en' ? 'Create' : 'Créer'}
    </button>
  </div>`;

  if (_userTemplates.length === 0) {
    html += `<div class="tpl-empty">${lang==='en' ? 'No custom templates yet. Create your first one!' : 'Aucun template personnalisé. Créez le vôtre !'}</div>`;
  } else {
    html += '<div class="tpl-grid">';
    _userTemplates.forEach(tpl => {
      const modules = _parseJSON(tpl.modules, ['context','key_points']);
      const mods = modules.map(m => _moduleLabel(m, lang)).join(', ');
      html += `
        <div class="tpl-card" onclick="applyTemplate('${_tplEsc(tpl.id)}', true)">
          <div class="tpl-card-header" style="background:${tpl.color||'#6366F1'}">
            <i class="fa-solid ${tpl.icon||'fa-file-lines'}"></i>
          </div>
          <div class="tpl-card-body">
            <div class="tpl-card-name">${_tplEsc(tpl.name)}</div>
            <div class="tpl-card-desc">${_tplEsc(tpl.description||'')}</div>
            <div class="tpl-card-modules">${_tplEsc(mods)}</div>
          </div>
          <div class="tpl-card-actions">
            <button class="tpl-use-btn" onclick="event.stopPropagation();applyTemplate('${_tplEsc(tpl.id)}',true)">
              <i class="fa-solid fa-check"></i> ${lang==='en' ? 'Use' : 'Utiliser'}
            </button>
            <button class="tpl-edit-btn" onclick="event.stopPropagation();openTemplateEditor('${_tplEsc(tpl.id)}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="tpl-delete-btn" onclick="event.stopPropagation();deleteTemplate('${_tplEsc(tpl.id)}','${_tplEsc(tpl.name)}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

/* ─────────────────────────────────────────────────────
   APPLIQUER UN TEMPLATE AU FORMULAIRE CR
───────────────────────────────────────────────────── */
function applyTemplate(templateId, isCustom = false) {
  let tpl;
  if (isCustom) {
    tpl = _userTemplates.find(t => t.id === templateId);
    if (!tpl) return;
  } else {
    tpl = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
  }

  const modules = isCustom
    ? _parseJSON(tpl.modules, ['context'])
    : tpl.modules;

  const config  = isCustom
    ? _parseJSON(tpl.modules_config, {})
    : (tpl.modules_config || {});

  // Masquer/afficher les sections selon les modules
  _applyModulesToForm(modules, config, tpl);

  // Sauvegarder le template actif dans STATE
  STATE._activeTemplate = { id: templateId, modules, config, isCustom };

  closeModal('modalTemplateLibrary');

  const lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';
  const name = isCustom ? tpl.name : (lang === 'en' ? tpl.name_en : tpl.name_fr);
  if (typeof showToast === 'function') {
    showToast(`Template "${name}" appliqué.`, 'success');
  }
}

function _applyModulesToForm(modules, config, tpl) {
  const allSectionIds = {
    context:      'sectionContext',
    participants: 'sectionParticipants',
    actions:      'sectionActions',
    key_points:   'sectionKeyPoints',
    decisions:    'sectionDecisions',
    risks:        'sectionRisks',
    budget:       'sectionBudget',
    next_steps:   'sectionNextSteps',
  };

  // Masquer toutes les sections optionnelles
  Object.entries(allSectionIds).forEach(([mod, sectionId]) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    if (mod === 'context') return; // toujours visible
    el.style.display = modules.includes(mod) ? '' : 'none';
  });

  // Gérer les custom sections dynamiques
  document.querySelectorAll('.section-custom').forEach(el => el.remove());

  // Ajouter les sections "custom" et "custom_mod_*" dans l'ordre
  const form = document.getElementById('crForm');
  if (!form) return;

  const toolbarConfig = [
    [{ header:[1,2,3,false] }],
    ['bold','italic','underline'],
    [{ color:[] }],
    [{ list:'ordered' },{ list:'bullet' }],
    ['link'],
    ['clean'],
  ];

  modules.forEach((modId, idx) => {
    const isBuiltInCustom = modId === 'custom';
    const isCustomMod     = modId.startsWith('custom_mod_');

    if (!allSectionIds[modId] && !isBuiltInCustom && !isCustomMod) return;

    if (isBuiltInCustom || isCustomMod) {
      let cfgKey, cfg, icon, color, title;

      if (isBuiltInCustom) {
        cfgKey = `custom_${idx}`;
        cfg    = config[cfgKey] || {};
        icon   = 'fa-pen-to-square';
        color  = '#94A3B8';
        title  = cfg.sectionTitle || (getCurrentLang?.() === 'en' ? 'Custom section' : 'Section personnalisée');
      } else {
        cfgKey = modId;
        cfg    = config[modId] || {};
        icon   = cfg.icon || 'fa-pen-to-square';
        color  = cfg.color || '#6366F1';
        title  = cfg.title || modId.replace('custom_mod_','');
      }

      const quillId = `customQuill_${idx}`;
      const sect = document.createElement('section');
      sect.className = 'form-section section-custom';
      const sectId = sect.id || `sect_${idx}`;
      if (!sect.id) sect.id = sectId;
      sect.dataset.sectionColor = color;
      sect.dataset.sectionIcon  = icon;
      sect.innerHTML = `
        <div class="section-header">
          <span class="section-icon section-icon-editable" style="background:${color}20" onclick="openSectionIconPicker('${sectId}')" title="Changer l'icône">
            <i class="fa-solid ${icon}" style="color:${color}"></i>
          </span>
          <h3 class="section-title-editable" ondblclick="startEditSectionTitle(this)">${_tplEsc(title)}</h3>
          <button type="button" class="section-edit-btn" onclick="openSectionIconPicker('${sectId}')" title="Modifier titre et icône">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
        </div>
        <div class="section-body">
          <div id="${quillId}" class="optional-quill-editor" style="min-height:120px;"></div>
        </div>`;
      form.querySelector('.form-save-bar')?.before(sect) || form.appendChild(sect);

      // Initialiser Quill sur ce conteneur
      if (window.Quill) {
        try {
          const q = new Quill(`#${quillId}`, {
            theme: 'snow',
            placeholder: cfg.placeholder || (getCurrentLang?.() === 'en' ? 'Enter content…' : 'Saisissez le contenu…'),
            modules: { toolbar: toolbarConfig }
          });
          if (!STATE._quillEditors) STATE._quillEditors = {};
          STATE._quillEditors[quillId] = q;
        } catch(e) {
          console.warn('[Quill] custom section init error:', e);
        }
      }
    }
  });

  // Re-init les éditeurs Quill des sections standards si nécessaire
  if (typeof reinitOptionalQuillEditors === 'function') {
    setTimeout(reinitOptionalQuillEditors, 100);
  }

  // Initialiser les sélecteurs de layout pour les nouvelles sections
  if (typeof _attachLayoutToOptionalSections === 'function') {
    setTimeout(_attachLayoutToOptionalSections, 200);
  }

  // Initialiser le réordonnancement pour les nouvelles sections
  if (typeof initModuleReorder === 'function') {
    setTimeout(initModuleReorder, 250);
  }

  // Mettre à jour le badge template dans le header CR
  _updateTemplateBadge(tpl);
}

function _updateTemplateBadge(tpl) {
  const badge = document.getElementById('currentTemplateBadge');
  if (!badge) return;
  const lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';
  const name = tpl ? (tpl.name || (lang==='en' ? tpl.name_en : tpl.name_fr)) : '';
  badge.textContent = name;
  badge.style.display = name ? 'inline-flex' : 'none';
}

/* ─────────────────────────────────────────────────────
   ÉDITEUR DE TEMPLATES PERSONNALISÉS
───────────────────────────────────────────────────── */
function openTemplateEditor(templateId) {
  const lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';

  if (templateId) {
    // Édition d'un template existant
    _editingTemplate = _userTemplates.find(t => t.id === templateId) || null;
  } else {
    // Nouveau template
    _editingTemplate = {
      name:           '',
      description:    '',
      icon:           'fa-file-lines',
      color:          '#6366F1',
      modules:        JSON.stringify(['context','participants','actions','key_points']),
      modules_config: '{}',
    };
  }

  // Remplir le formulaire éditeur
  const nameEl = document.getElementById('tplEditorName');
  const descEl = document.getElementById('tplEditorDesc');
  const colorEl = document.getElementById('tplEditorColor');
  const colorHex = document.getElementById('tplEditorColorHex');
  if (nameEl)    nameEl.value    = _editingTemplate.name || '';
  if (descEl)    descEl.value    = _editingTemplate.description || '';
  if (colorEl)   colorEl.value   = _editingTemplate.color || '#6366F1';
  if (colorHex)  colorHex.value  = _editingTemplate.color || '#6366F1';

  // Rendre les listes de modules
  _renderEditorModules();

  openModal('modalTemplateEditor');
}

function _renderEditorModules() {
  const lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';
  const activeModules = _parseJSON(
    _editingTemplate?.modules,
    ['context','participants','actions','key_points']
  );

  // ── Modules actifs (zone de construction) ──────────
  const activeContainer = document.getElementById('tplActiveModules');
  if (activeContainer) {
    if (activeModules.length === 0) {
      activeContainer.innerHTML = `<div class="tpl-drop-hint">${lang==='en' ? 'Drag modules here' : 'Glissez des modules ici'}</div>`;
    } else {
      activeContainer.innerHTML = activeModules.map((modId, idx) => {
        // Support modules custom (custom_mod_xxx) et modules prédéfinis
        const isCustomBuilt = modId.startsWith('custom_mod_');
        const config = _parseJSON(_editingTemplate?.modules_config || '{}', {});
        const customCfg = isCustomBuilt ? (config[modId] || {}) : null;

        const mod = isCustomBuilt
          ? { id: modId, icon: customCfg.icon || 'fa-pen-to-square', color: customCfg.color || '#94A3B8' }
          : (CR_MODULES[modId] || CR_MODULES.custom);

        const label = isCustomBuilt
          ? (customCfg.title || modId)
          : _moduleLabel(modId, lang);

        const isRequired = modId === 'context';
        const modKeyForEdit = isCustomBuilt ? modId.replace('custom_mod_','') : null;

        return `
          <div class="tpl-module-chip${isRequired ? ' required' : ''}${isCustomBuilt ? ' custom-built' : ''}" 
               draggable="${!isRequired}" 
               data-mod="${modId}" 
               data-idx="${idx}"
               ondragstart="tplDragStart(event)"
               ondragover="tplDragOver(event)"
               ondrop="tplDrop(event)"
               ondragend="tplDragEnd(event)">
            <i class="fa-solid ${mod.icon}" style="color:${mod.color}"></i>
            <span>${label}</span>
            ${isCustomBuilt ? `<button class="cme-edit-chip-btn" onclick="openCustomModuleEditor('${modKeyForEdit}')" title="Éditer ce module">
              <i class="fa-solid fa-pencil"></i>
            </button>` : ''}
            ${!isRequired ? `<button class="tpl-chip-remove" onclick="tplRemoveModule(${idx})" title="${lang==='en'?'Remove':'Retirer'}">
              <i class="fa-solid fa-xmark"></i>
            </button>` : '<span class="tpl-required-badge">requis</span>'}
          </div>`;
      }).join('');
    }
  }

  // ── Catalogue de modules disponibles ───────────────
  const catalogContainer = document.getElementById('tplModuleCatalog');
  if (catalogContainer) {
    const config = _parseJSON(_editingTemplate?.modules_config || '{}', {});
    // Modules custom existants dans ce template
    const customMods = Object.entries(config)
      .filter(([k]) => k.startsWith('custom_mod_'))
      .map(([k, v]) => ({ id: k, icon: v.icon||'fa-pen-to-square', color: v.color||'#94A3B8', label: v.title||k }));

    const predefinedHtml = Object.values(CR_MODULES).map(mod => {
      const label = _moduleLabel(mod.id, lang);
      const isActive = activeModules.includes(mod.id) && mod.id !== 'custom';
      return `
        <div class="tpl-catalog-item${isActive ? ' active' : ''}" 
             onclick="tplAddModule('${mod.id}')"
             title="${label}">
          <div class="tpl-catalog-icon" style="background:${mod.color}20;color:${mod.color}">
            <i class="fa-solid ${mod.icon}"></i>
          </div>
          <div class="tpl-catalog-label">${label}</div>
          ${isActive && mod.id !== 'custom' 
            ? `<span class="tpl-active-dot" title="${lang==='en'?'Already added':'Déjà ajouté'}"><i class="fa-solid fa-check"></i></span>`
            : `<span class="tpl-add-dot"><i class="fa-solid fa-plus"></i></span>`}
        </div>`;
    }).join('');

    const customHtml = customMods.map(mod => {
      const isActive = activeModules.includes(mod.id);
      return `
        <div class="tpl-catalog-item${isActive ? ' active' : ''} custom-built"
             onclick="tplAddModule('${mod.id}')"
             title="${mod.label}">
          <div class="tpl-catalog-icon" style="background:${mod.color}20;color:${mod.color}">
            <i class="fa-solid ${mod.icon}"></i>
          </div>
          <div class="tpl-catalog-label">${mod.label}</div>
          ${isActive 
            ? `<span class="tpl-active-dot"><i class="fa-solid fa-check"></i></span>`
            : `<span class="tpl-add-dot"><i class="fa-solid fa-plus"></i></span>`}
        </div>`;
    }).join('');

    catalogContainer.innerHTML = predefinedHtml + customHtml;
  }
}

/* ── Drag & Drop ────────────────────────────────────── */
function tplDragStart(e) {
  _dragSrcModule = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.idx);
  e.currentTarget.classList.add('dragging');
}
function tplDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function tplDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
  const toIdx   = parseInt(e.currentTarget.dataset.idx);
  if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;

  const modules = _parseJSON(_editingTemplate.modules, []);
  const [moved] = modules.splice(fromIdx, 1);
  modules.splice(toIdx, 0, moved);
  _editingTemplate.modules = JSON.stringify(modules);
  _renderEditorModules();
}
function tplDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.tpl-module-chip').forEach(el => el.classList.remove('drag-over'));
}
window.tplDragStart = tplDragStart;
window.tplDragOver  = tplDragOver;
window.tplDrop      = tplDrop;
window.tplDragEnd   = tplDragEnd;

/* ── Ajouter / retirer un module ──────────────────── */
function tplAddModule(modId) {
  const modules = _parseJSON(_editingTemplate.modules, []);
  // "custom" peut être ajouté plusieurs fois
  if (modId !== 'custom' && modules.includes(modId)) {
    showToast?.((getCurrentLang?.() === 'en' ? 'Module already added.' : 'Module déjà présent.'), 'info');
    return;
  }
  modules.push(modId);
  _editingTemplate.modules = JSON.stringify(modules);
  _renderEditorModules();
}

function tplRemoveModule(idx) {
  const modules = _parseJSON(_editingTemplate.modules, []);
  if (modules[idx] === 'context') return; // non supprimable
  modules.splice(idx, 1);
  _editingTemplate.modules = JSON.stringify(modules);
  _renderEditorModules();
}
window.tplAddModule    = tplAddModule;
window.tplRemoveModule = tplRemoveModule;

/* Sync couleur color picker */
function tplSyncColor(src) {
  const val = src.value;
  const other = src.id === 'tplEditorColor'
    ? document.getElementById('tplEditorColorHex')
    : document.getElementById('tplEditorColor');
  if (other) other.value = val;
  if (_editingTemplate) _editingTemplate.color = val;
}
window.tplSyncColor = tplSyncColor;

/* Sync icone */
function tplSelectIcon(icon) {
  if (_editingTemplate) _editingTemplate.icon = icon;
  document.querySelectorAll('.tpl-icon-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.icon === icon);
  });
}
window.tplSelectIcon = tplSelectIcon;

/* ─────────────────────────────────────────────────────
   SAUVEGARDER UN TEMPLATE
───────────────────────────────────────────────────── */
async function saveTemplate() {
  const nameEl = document.getElementById('tplEditorName');
  const descEl = document.getElementById('tplEditorDesc');
  const colorEl = document.getElementById('tplEditorColor');
  const btn    = document.getElementById('btnSaveTemplate');

  const name = (nameEl?.value || '').trim();
  if (!name) {
    showToast?.((getCurrentLang?.() === 'en' ? 'Template name required.' : 'Nom du template requis.'), 'warning');
    return;
  }

  const modules = _parseJSON(_editingTemplate?.modules, ['context']);
  if (modules.length === 0) {
    showToast?.((getCurrentLang?.() === 'en' ? 'Add at least one module.' : 'Ajoutez au moins un module.'), 'warning');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const payload = {
      user_id:        STATE.userId,
      name,
      description:    descEl?.value?.trim() || '',
      icon:           _editingTemplate?.icon || 'fa-file-lines',
      color:          colorEl?.value || '#6366F1',
      modules:        JSON.stringify(modules),
      modules_config: _editingTemplate?.modules_config || '{}',
      category:       'custom',
      is_system:      false,
      sort_order:     Date.now(),
    };

    let saved;
    if (_editingTemplate?.id) {
      saved = await apiPatch('cr_templates', _editingTemplate.id, payload);
      const idx = _userTemplates.findIndex(t => t.id === _editingTemplate.id);
      if (idx !== -1) _userTemplates[idx] = { ..._userTemplates[idx], ...saved };
    } else {
      saved = await apiPost('cr_templates', payload);
      _userTemplates.push(saved);
    }

    closeModal('modalTemplateEditor');
    renderTemplateLibrary();
    showToast?.((getCurrentLang?.() === 'en' ? 'Template saved.' : 'Template enregistré.'), 'success');
  } catch(e) {
    console.error('[Templates] saveTemplate error:', e);
    showToast?.((getCurrentLang?.() === 'en' ? 'Error saving template.' : 'Erreur lors de la sauvegarde.'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = getCurrentLang?.() === 'en' ? 'Save template' : 'Enregistrer'; }
  }
}

/* ─────────────────────────────────────────────────────
   SUPPRIMER UN TEMPLATE
───────────────────────────────────────────────────── */
async function deleteTemplate(templateId, templateName) {
  const lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';
  const msg = lang === 'en'
    ? `Delete template "${templateName}"? This cannot be undone.`
    : `Supprimer le template "${templateName}" ? Cette action est irréversible.`;

  const ok = await new Promise(resolve => {
    const modal   = document.getElementById('modalConfirm');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl   = document.getElementById('confirmModalMessage');
    const btnYes  = document.getElementById('btnConfirmAction');
    const btnNo   = document.getElementById('btnCancelConfirm');
    if (!modal) { resolve(true); return; }
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> ${lang==='en'?'Delete':'Supprimer'}`;
    if (msgEl) msgEl.textContent = msg;
    btnYes.textContent = lang === 'en' ? 'Delete' : 'Supprimer';
    btnYes.className = 'btn-primary btn-danger';
    const cleanup = () => { btnYes.onclick = null; btnNo.onclick = null; closeModal('modalConfirm'); };
    btnYes.onclick = () => { cleanup(); resolve(true); };
    btnNo.onclick  = () => { cleanup(); resolve(false); };
    openModal('modalConfirm');
  });
  if (!ok) return;

  try {
    await apiDelete('cr_templates', templateId);
    _userTemplates = _userTemplates.filter(t => t.id !== templateId);
    renderTemplateLibrary();
    showToast?.(lang === 'en' ? 'Template deleted.' : 'Template supprimé.', 'success');
  } catch(e) {
    showToast?.(lang === 'en' ? 'Error deleting.' : 'Erreur lors de la suppression.', 'error');
  }
}

/* ─────────────────────────────────────────────────────
   AJOUTER LES SECTIONS MANQUANTES AU DOM
   (appelé une seule fois au chargement pour créer
    les sections optionnelles initalement cachées)
───────────────────────────────────────────────────── */
function initOptionalSections() {
  const form = document.getElementById('crForm');
  if (!form) return;

  const existing = new Set([...form.querySelectorAll('section')].map(s => s.id));

  // Décisions
  if (!existing.has('sectionDecisions')) {
    const s = _createOptionalSection('sectionDecisions','fa-gavel','#7C3AED',
      'Décisions / Decisions','decisions_content','Saisissez les décisions prises… / Enter decisions…');
    form.querySelector('#sectionKeyPoints')?.after(s);
  }
  // Risques
  if (!existing.has('sectionRisks')) {
    const s = _createOptionalSection('sectionRisks','fa-triangle-exclamation','#EF4444',
      'Risques / Risks','risks_content','Identifiez les risques… / Identify risks…');
    form.querySelector('#sectionDecisions')?.after(s);
  }
  // Budget
  if (!existing.has('sectionBudget')) {
    const s = _createOptionalSection('sectionBudget','fa-chart-line','#059669',
      'Budget','budget_content','Situation budgétaire… / Budget status…');
    form.querySelector('#sectionRisks')?.after(s);
  }
  // Prochaines étapes
  if (!existing.has('sectionNextSteps')) {
    const s = _createOptionalSection('sectionNextSteps','fa-arrow-right','#D97706',
      'Prochaines étapes / Next steps','next_steps_content','Prochaines étapes… / Next steps…');
    form.querySelector('#sectionBudget')?.after(s);
  }

  // Masquer toutes les sections optionnelles par défaut
  ['sectionDecisions','sectionRisks','sectionBudget','sectionNextSteps'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function _createOptionalSection(id, icon, color, titleBilingual, contentId, placeholder) {
  const lang  = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';
  const titles = titleBilingual.split(' / ');
  const title  = lang === 'en' ? (titles[1]||titles[0]) : titles[0];
  const s = document.createElement('section');
  s.className = 'form-section optional-section';
  s.id = id;

  // ID du conteneur Quill = contentId remplacé par _quill_editor
  const quillId = contentId.replace('_content', '_quill_editor');

  s.dataset.sectionColor = color;
  s.dataset.sectionIcon  = icon;
  s.innerHTML = `
    <div class="section-header">
      <span class="section-icon section-icon-editable" style="background:${color}20" onclick="openSectionIconPicker('${id}')" title="Changer l'icône">
        <i class="fa-solid ${icon}" style="color:${color}"></i>
      </span>
      <h3 class="section-title-editable" ondblclick="startEditSectionTitle(this)">${title}</h3>
      <button type="button" class="section-edit-btn" onclick="openSectionIconPicker('${id}')" title="Modifier titre et icône">
        <i class="fa-solid fa-pen-to-square"></i>
      </button>
    </div>
    <div class="section-body">
      <div id="${quillId}" class="optional-quill-editor" style="min-height:120px;"></div>
    </div>`;
  return s;
}

/* Lire le contenu des sections optionnelles (Quill ou textarea fallback) */
function getOptionalSectionsData() {
  const _getContent = (quillId, textareaId) => {
    const q = STATE?._quillEditors?.[quillId];
    if (q) return q.root.innerHTML;
    const el = document.getElementById(quillId) || document.getElementById(textareaId);
    if (!el) return '';
    return el.classList.contains('ql-editor') ? el.innerHTML : el.value || '';
  };
  return {
    decisions:  _getContent('decisions_quill_editor',  'decisions_content'),
    risks:      _getContent('risks_quill_editor',       'risks_content'),
    budget:     _getContent('budget_quill_editor',      'budget_content'),
    next_steps: _getContent('next_steps_quill_editor',  'next_steps_content'),
  };
}

function setOptionalSectionsData(data) {
  const _setContent = (quillId, textareaId, val) => {
    const q = STATE?._quillEditors?.[quillId];
    if (q) {
      // Quill 2 : passer par clipboard.convert + setContents pour synchroniser le delta
      try {
        const html = val || '';
        const delta = q.clipboard.convert({ html });
        q.setContents(delta, 'user');
      } catch {
        // Fallback : reset puis paste
        q.setContents([], 'silent');
        if (val) q.clipboard.dangerouslyPasteHTML(0, val, 'user');
      }
      return;
    }
    const el = document.getElementById(quillId) || document.getElementById(textareaId);
    if (!el) return;
    if (el.classList.contains('ql-editor')) el.innerHTML = val || '';
    else el.value = val || '';
  };
  _setContent('decisions_quill_editor',  'decisions_content',  data?.decisions  || '');
  _setContent('risks_quill_editor',      'risks_content',      data?.risks      || '');
  _setContent('budget_quill_editor',     'budget_content',     data?.budget     || '');
  _setContent('next_steps_quill_editor', 'next_steps_content', data?.next_steps || '');
}

/* Vrai test de vacuité d'un contenu Quill (un Quill vide = "<p><br></p>") */
function _isQuillContentEmpty(html) {
  if (!html) return true;
  const stripped = String(html)
    .replace(/<p><br\s*\/?><\/p>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/&nbsp;/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  return stripped.length === 0;
}
window._isQuillContentEmpty = _isQuillContentEmpty;

/* ─────────────────────────────────────────────────────
   HELPERS PRIVÉS
───────────────────────────────────────────────────── */
function _moduleLabel(modId, lang) {
  const labels = {
    context:      { fr: 'Contexte',             en: 'Context'         },
    participants: { fr: 'Participants',          en: 'Participants'    },
    actions:      { fr: 'Suivi des actions',     en: 'Action tracking' },
    key_points:   { fr: 'Points structurants',   en: 'Key points'      },
    decisions:    { fr: 'Décisions',             en: 'Decisions'       },
    risks:        { fr: 'Risques',               en: 'Risks'           },
    budget:       { fr: 'Budget',                en: 'Budget'          },
    next_steps:   { fr: 'Prochaines étapes',     en: 'Next steps'      },
    custom:       { fr: 'Section personnalisée', en: 'Custom section'  },
  };
  return (labels[modId] && labels[modId][lang||'fr']) || modId;
}

function _parseJSON(val, fallback) {
  if (!val) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function _tplEsc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ─────────────────────────────────────────────────────
   INIT AU CHARGEMENT
───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Initialiser les sections optionnelles après que le DOM est prêt
  setTimeout(() => {
    initOptionalSections();
    // Puis initialiser les éditeurs Quill des sections optionnelles
    setTimeout(() => {
      if (typeof reinitOptionalQuillEditors === 'function') {
        reinitOptionalQuillEditors();
      }
    }, 200);
  }, 300);
});

/* =====================================================
   ÉDITEUR DE MODULE PERSONNALISÉ
   Permet de créer un module from scratch avec des blocs :
   texte libre, tableau, checklist, 2 colonnes, KPI, séparateur
   ===================================================== */

/* Icônes disponibles pour les modules */
const CME_ICONS = [
  'fa-file-lines','fa-list-check','fa-users','fa-gavel','fa-lightbulb',
  'fa-triangle-exclamation','fa-chart-line','fa-arrow-right','fa-briefcase',
  'fa-pen-to-square','fa-table','fa-calendar','fa-star','fa-flag',
  'fa-bullseye','fa-handshake','fa-lock','fa-globe','fa-chart-bar',
  'fa-clipboard','fa-diagram-project','fa-magnifying-glass','fa-comment-dots',
  'fa-circle-check','fa-gear','fa-tag','fa-clock','fa-bookmark',
];

let _cmeEditingModuleId   = null; // id du module custom en édition (ou null = nouveau)
let _cmeBlocks            = [];   // blocs du module en cours

/* ── Ouvrir le panneau éditeur de module ── */
function openCustomModuleEditor(moduleId) {
  _cmeEditingModuleId = moduleId;
  _cmeBlocks = [];

  const lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';

  // Si on édite un module existant dans _editingTemplate
  if (moduleId && _editingTemplate) {
    const config  = _parseJSON(_editingTemplate.modules_config || '{}', {});
    const modCfg  = config[`custom_mod_${moduleId}`] || {};
    document.getElementById('cmeModuleName').value = modCfg.title || '';
    document.getElementById('cmeModuleColor').value = modCfg.color || '#6366F1';
    _cmeBlocks = modCfg.blocks ? JSON.parse(JSON.stringify(modCfg.blocks)) : [];
    document.getElementById('cmeTitle').textContent = lang === 'en' ? 'Edit module' : 'Modifier le module';
  } else {
    document.getElementById('cmeModuleName').value = '';
    document.getElementById('cmeModuleColor').value = '#6366F1';
    document.getElementById('cmeTitle').textContent = lang === 'en' ? 'New module' : 'Nouveau module';
  }

  // Remplir le sélecteur d'icônes
  _renderCMEIconPicker();
  // Rendre les blocs existants
  _renderCMEBlocks();

  document.getElementById('customModuleEditorPanel').style.display = 'flex';
  document.getElementById('customModuleEditorPanel').style.flexDirection = 'column';
  // Focus nom
  setTimeout(() => document.getElementById('cmeModuleName')?.focus(), 100);
}

function closeCustomModuleEditor() {
  document.getElementById('customModuleEditorPanel').style.display = 'none';
  _cmeBlocks = [];
  _cmeEditingModuleId = null;
}

/* ── Rendre le sélecteur d'icônes ── */
function _renderCMEIconPicker() {
  const picker = document.getElementById('cmeIconPicker');
  if (!picker) return;
  picker.innerHTML = CME_ICONS.map(icon => `
    <div class="cme-icon-opt" data-icon="${icon}" onclick="cmeSelectIcon('${icon}')" title="${icon.replace('fa-','')}">
      <i class="fa-solid ${icon}"></i>
    </div>`).join('');
  // Sélectionner la première par défaut
  picker.querySelector('.cme-icon-opt')?.classList.add('selected');
}

function cmeSelectIcon(icon) {
  document.querySelectorAll('.cme-icon-opt').forEach(el =>
    el.classList.toggle('selected', el.dataset.icon === icon)
  );
}

/* ── Ajouter un bloc ── */
function cmeAddBlock(type) {
  const id = `blk_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  let block;
  switch(type) {
    case 'text':
      block = { id, type, label: 'Texte libre', placeholder: '', value: '' };
      break;
    case 'table':
      block = { id, type, label: 'Tableau', rows: 3, cols: 3,
        headers: ['Colonne 1','Colonne 2','Colonne 3'],
        data: Array(3).fill(null).map(() => Array(3).fill('')) };
      break;
    case 'checklist':
      block = { id, type, label: 'Liste à cocher', items: ['Élément 1','Élément 2'] };
      break;
    case 'columns':
      block = { id, type, label: '2 colonnes',
        col1: { label: 'Colonne gauche', placeholder: '' },
        col2: { label: 'Colonne droite', placeholder: '' } };
      break;
    case 'kpi':
      block = { id, type, label: 'KPI',
        items: [{ label: 'Métrique 1', value: '0' }, { label: 'Métrique 2', value: '0' }] };
      break;
    case 'separator':
      block = { id, type, label: 'Séparateur' };
      break;
    default: return;
  }
  _cmeBlocks.push(block);
  _renderCMEBlocks();
}

function cmeRemoveBlock(blockId) {
  _cmeBlocks = _cmeBlocks.filter(b => b.id !== blockId);
  _renderCMEBlocks();
}

/* ── Rendre la liste des blocs ── */
function _renderCMEBlocks() {
  const container = document.getElementById('cmeBlocksList');
  if (!container) return;
  if (_cmeBlocks.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:.82rem;border:2px dashed var(--gray-200);border-radius:10px;">
      Ajoutez des blocs pour composer votre module
    </div>`;
    return;
  }
  container.innerHTML = _cmeBlocks.map((block, idx) => _renderBlockHTML(block, idx)).join('');
}

const CME_BLOCK_META = {
  text:      { icon: 'fa-align-left',     color: '#6366F1', label: 'Texte libre' },
  table:     { icon: 'fa-table',          color: '#0EA5E9', label: 'Tableau' },
  checklist: { icon: 'fa-list-check',     color: '#059669', label: 'Liste à cocher' },
  columns:   { icon: 'fa-table-columns',  color: '#D97706', label: '2 colonnes' },
  kpi:       { icon: 'fa-gauge-high',     color: '#EF4444', label: 'KPI' },
  separator: { icon: 'fa-minus',          color: '#94A3B8', label: 'Séparateur' },
};

function _renderBlockHTML(block, idx) {
  const meta = CME_BLOCK_META[block.type] || { icon: 'fa-block', color: '#94A3B8', label: block.type };
  let bodyHtml = '';

  switch(block.type) {
    case 'text':
      bodyHtml = `
        <div class="cme-field" style="margin-bottom:6px;">
          <label>Label de ce champ</label>
          <input type="text" value="${_tplEsc(block.label||'')}"
            oninput="_cmeUpdateBlock('${block.id}','label',this.value)" placeholder="ex : Résumé exécutif" />
        </div>
        <div class="cme-field">
          <label>Texte d'aide (placeholder)</label>
          <input type="text" value="${_tplEsc(block.placeholder||'')}"
            oninput="_cmeUpdateBlock('${block.id}','placeholder',this.value)" placeholder="ex : Rédigez ici…" />
        </div>`;
      break;

    case 'table': {
      const rows = block.rows || 3;
      const cols = block.cols || 3;
      const headers = block.headers || Array(cols).fill('').map((_,i) => `Colonne ${i+1}`);
      bodyHtml = `
        <div class="cme-table-controls">
          <label>Lignes</label>
          <input type="number" min="1" max="20" value="${rows}"
            oninput="_cmeUpdateTableSize('${block.id}','rows',this.value)" style="width:52px" />
          <label>Colonnes</label>
          <input type="number" min="1" max="10" value="${cols}"
            oninput="_cmeUpdateTableSize('${block.id}','cols',this.value)" style="width:52px" />
        </div>
        <div style="overflow-x:auto;">
          <table class="cme-table-preview">
            <thead><tr>
              ${headers.map((h,c) => `<th><input value="${_tplEsc(h)}"
                oninput="_cmeUpdateTableHeader('${block.id}',${c},this.value)"
                placeholder="En-tête ${c+1}" /></th>`).join('')}
            </tr></thead>
            <tbody>
              ${Array(rows-1).fill(0).map((_,r) => `<tr>
                ${Array(cols).fill(0).map((_,c) => `<td><input value=""
                  placeholder="Valeur ${r+2},${c+1}" /></td>`).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      break;
    }

    case 'checklist': {
      const items = block.items || [];
      bodyHtml = `
        <div class="cme-checklist-items" id="checklist_${block.id}">
          ${items.map((item, i) => `
            <div class="cme-checklist-item" data-item-idx="${i}">
              <i class="fa-regular fa-square" style="color:var(--gray-300);font-size:.8rem;flex-shrink:0"></i>
              <input type="text" value="${_tplEsc(item)}"
                oninput="_cmeUpdateChecklistItem('${block.id}',${i},this.value)"
                placeholder="Élément de liste" />
              <button class="cme-checklist-item-remove" onclick="_cmeRemoveChecklistItem('${block.id}',${i})">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>`).join('')}
        </div>
        <button class="cme-add-checklist-item" onclick="_cmeAddChecklistItem('${block.id}')">
          <i class="fa-solid fa-plus"></i> Ajouter un élément
        </button>`;
      break;
    }

    case 'columns': {
      const c1 = block.col1 || {};
      const c2 = block.col2 || {};
      bodyHtml = `
        <div class="cme-columns-wrap">
          <div class="cme-col-input">
            <label>Label colonne gauche</label>
            <input type="text" value="${_tplEsc(c1.label||'Colonne 1')}"
              oninput="_cmeUpdateColLabel('${block.id}','col1',this.value)" />
          </div>
          <div class="cme-col-input">
            <label>Label colonne droite</label>
            <input type="text" value="${_tplEsc(c2.label||'Colonne 2')}"
              oninput="_cmeUpdateColLabel('${block.id}','col2',this.value)" />
          </div>
        </div>`;
      break;
    }

    case 'kpi': {
      const kpis = block.items || [];
      bodyHtml = `
        <div class="cme-kpi-row" id="kpi_${block.id}">
          ${kpis.map((k,i) => `
            <div class="cme-kpi-item">
              <button class="cme-kpi-remove" onclick="_cmeRemoveKPI('${block.id}',${i})">
                <i class="fa-solid fa-xmark"></i>
              </button>
              <input class="cme-kpi-val" type="text" value="${_tplEsc(k.value||'0')}"
                oninput="_cmeUpdateKPI('${block.id}',${i},'value',this.value)" placeholder="0" />
              <input class="cme-kpi-label" type="text" value="${_tplEsc(k.label||'')}"
                oninput="_cmeUpdateKPI('${block.id}',${i},'label',this.value)" placeholder="Label" />
            </div>`).join('')}
          <button class="cme-add-kpi" onclick="_cmeAddKPI('${block.id}')" title="Ajouter un KPI">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>`;
      break;
    }

    case 'separator':
      bodyHtml = `<div class="cme-sep-preview"><div class="cme-sep-line"></div></div>`;
      break;
  }

  return `
    <div class="cme-block cme-block-${block.type}" data-block-id="${block.id}">
      <div class="cme-block-header">
        <div class="cme-block-header-icon" style="background:${meta.color}">
          <i class="fa-solid ${meta.icon}"></i>
        </div>
        <span class="cme-block-header-label">${meta.label}</span>
        <button class="cme-block-remove" onclick="cmeRemoveBlock('${block.id}')" title="Supprimer">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
      <div class="cme-block-body">${bodyHtml}</div>
    </div>`;
}

/* ── Helpers de mise à jour des blocs ── */
function _cmeGetBlock(id) { return _cmeBlocks.find(b => b.id === id); }

function _cmeUpdateBlock(id, key, val) {
  const b = _cmeGetBlock(id);
  if (b) b[key] = val;
}

function _cmeUpdateTableSize(id, dim, val) {
  const b = _cmeGetBlock(id);
  if (!b) return;
  const n = Math.max(1, parseInt(val) || 1);
  if (dim === 'cols') {
    b.cols = n;
    b.headers = Array(n).fill('').map((_,i) => b.headers[i] || `Colonne ${i+1}`);
    b.data = (b.data||[]).map(row => Array(n).fill('').map((_,i) => row[i]||''));
  } else {
    b.rows = n;
    b.data = Array(n-1).fill(null).map((_,r) => b.data?.[r] || Array(b.cols||3).fill(''));
  }
  _renderCMEBlocks();
}

function _cmeUpdateTableHeader(id, colIdx, val) {
  const b = _cmeGetBlock(id);
  if (b && b.headers) b.headers[colIdx] = val;
}

function _cmeUpdateChecklistItem(id, idx, val) {
  const b = _cmeGetBlock(id);
  if (b && b.items) b.items[idx] = val;
}

function _cmeAddChecklistItem(id) {
  const b = _cmeGetBlock(id);
  if (b) { b.items = b.items || []; b.items.push(''); _renderCMEBlocks(); }
}

function _cmeRemoveChecklistItem(id, idx) {
  const b = _cmeGetBlock(id);
  if (b) { b.items.splice(idx, 1); _renderCMEBlocks(); }
}

function _cmeUpdateColLabel(id, col, val) {
  const b = _cmeGetBlock(id);
  if (b && b[col]) b[col].label = val;
}

function _cmeAddKPI(id) {
  const b = _cmeGetBlock(id);
  if (b) { b.items = b.items || []; b.items.push({ label: `Métrique ${b.items.length+1}`, value: '0' }); _renderCMEBlocks(); }
}

function _cmeRemoveKPI(id, idx) {
  const b = _cmeGetBlock(id);
  if (b) { b.items.splice(idx, 1); _renderCMEBlocks(); }
}

function _cmeUpdateKPI(id, idx, key, val) {
  const b = _cmeGetBlock(id);
  if (b && b.items[idx]) b.items[idx][key] = val;
}

/* ── Sauvegarder le module et l'ajouter au template ── */
function saveCustomModule() {
  const name  = (document.getElementById('cmeModuleName')?.value || '').trim();
  const color = document.getElementById('cmeModuleColor')?.value || '#6366F1';
  const icon  = document.querySelector('.cme-icon-opt.selected')?.dataset.icon || 'fa-pen-to-square';
  const lang  = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';

  if (!name) {
    showToast?.(lang === 'en' ? 'Module name required.' : 'Nom du module requis.', 'warning');
    document.getElementById('cmeModuleName')?.focus();
    return;
  }

  // ID unique pour ce module custom
  const modKey = _cmeEditingModuleId || `cmod_${Date.now().toString(36)}`;

  // Stocker la config dans _editingTemplate.modules_config
  if (_editingTemplate) {
    const config = _parseJSON(_editingTemplate.modules_config || '{}', {});
    config[`custom_mod_${modKey}`] = {
      title:  name,
      color,
      icon,
      blocks: JSON.parse(JSON.stringify(_cmeBlocks)),
    };
    _editingTemplate.modules_config = JSON.stringify(config);

    // Ajouter ce module à la liste des modules actifs si nouveau
    if (!_cmeEditingModuleId) {
      const modules = _parseJSON(_editingTemplate.modules || '[]', []);
      modules.push(`custom_mod_${modKey}`);
      _editingTemplate.modules = JSON.stringify(modules);
    }
  }

  closeCustomModuleEditor();
  _renderEditorModules();
  showToast?.(lang === 'en' ? 'Module added.' : 'Module ajouté au template.', 'success');
}

/* ── Exposer les globals du CME ── */
window.openCustomModuleEditor  = openCustomModuleEditor;
window.closeCustomModuleEditor = closeCustomModuleEditor;
window.cmeAddBlock             = cmeAddBlock;
window.cmeRemoveBlock          = cmeRemoveBlock;
window.cmeSelectIcon           = cmeSelectIcon;
window.saveCustomModule        = saveCustomModule;
window._cmeUpdateBlock         = _cmeUpdateBlock;
window._cmeUpdateTableSize     = _cmeUpdateTableSize;
window._cmeUpdateTableHeader   = _cmeUpdateTableHeader;
window._cmeUpdateChecklistItem = _cmeUpdateChecklistItem;
window._cmeAddChecklistItem    = _cmeAddChecklistItem;
window._cmeRemoveChecklistItem = _cmeRemoveChecklistItem;
window._cmeUpdateColLabel      = _cmeUpdateColLabel;
window._cmeAddKPI              = _cmeAddKPI;
window._cmeRemoveKPI           = _cmeRemoveKPI;
window._cmeUpdateKPI           = _cmeUpdateKPI;

/* =====================================================
   EXPOSE GLOBALS
───────────────────────────────────────────────────── */
window.openTemplateLibrary   = openTemplateLibrary;
window.applyTemplate         = applyTemplate;
window.openTemplateEditor    = openTemplateEditor;
window.saveTemplate          = saveTemplate;
window.deleteTemplate        = deleteTemplate;
window.fetchUserTemplates    = fetchUserTemplates;
window.getOptionalSectionsData = getOptionalSectionsData;
window.setOptionalSectionsData = setOptionalSectionsData;
window.renderTemplateLibrary = renderTemplateLibrary;
