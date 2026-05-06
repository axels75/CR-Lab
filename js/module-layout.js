/* =====================================================
   WAVESTONE CR MASTER – module-layout.js  v3
   Sélecteur de disposition par module :
   Texte (Quill) | Tableau éditable | Image | Planning
   ===================================================== */
'use strict';

/* ─────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────── */
const LAYOUT_LABELS = {
  text:     { icon: 'fa-align-left',    label: 'Texte'    },
  table:    { icon: 'fa-table',         label: 'Tableau'  },
  image:    { icon: 'fa-image',         label: 'Image'    },
  planning: { icon: 'fa-calendar-days', label: 'Planning' },
};

// layout actif par sectionId
const _layouts = {};

/* ─────────────────────────────────────────────────────
   INJECTION DE LA BARRE DE LAYOUT
───────────────────────────────────────────────────── */
function _injectLayoutBar(section, types, sectionId) {
  if (section.querySelector('.module-layout-bar')) return; // déjà injectée
  const header = section.querySelector('.section-header');
  if (!header) return;

  const bar = document.createElement('div');
  bar.className = 'module-layout-bar';
  bar.setAttribute('data-for', sectionId);

  bar.innerHTML = types.map((t, i) => {
    const cfg = LAYOUT_LABELS[t];
    return `<button type="button"
              class="module-layout-btn${i === 0 ? ' active' : ''}"
              data-layout="${t}"
              onclick="setModuleLayout('${sectionId}','${t}')"
              title="${cfg.label}">
      <i class="fa-solid ${cfg.icon}"></i>
      <span>${cfg.label}</span>
    </button>`;
  }).join('');

  header.appendChild(bar);
  _layouts[sectionId] = types[0]; // défaut = premier
}

/* ─────────────────────────────────────────────────────
   INIT GLOBAL
───────────────────────────────────────────────────── */
function initModuleLayoutSelectors() {
  // Section Key Points statique
  const kp = document.getElementById('sectionKeyPoints');
  if (kp) _injectLayoutBar(kp, ['text', 'table', 'image'], 'sectionKeyPoints');

  // Sections optionnelles
  _attachLayoutToOptionalSections();
}

function _attachLayoutToOptionalSections() {
  const ids = ['sectionDecisions', 'sectionRisks', 'sectionBudget', 'sectionNextSteps'];
  ids.forEach(id => {
    const s = document.getElementById(id);
    if (s && !s.querySelector('.module-layout-bar')) {
      _injectLayoutBar(s, ['text', 'table', 'image', 'planning'], id);
    }
  });
  // Sections custom
  document.querySelectorAll('.section-custom').forEach(s => {
    if (!s.id) s.id = 'custom_' + Math.random().toString(36).slice(2, 8);
    if (!s.querySelector('.module-layout-bar')) {
      _injectLayoutBar(s, ['text', 'table', 'image', 'planning'], s.id);
    }
  });
}

/* ─────────────────────────────────────────────────────
   SWITCH DE LAYOUT — point d'entrée
───────────────────────────────────────────────────── */
function setModuleLayout(sectionId, layout) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  _layouts[sectionId] = layout;

  // Mettre à jour les boutons actifs
  section.querySelectorAll('.module-layout-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === layout);
  });

  const body = section.querySelector('.section-body');
  if (!body) return;

  // Masquer toutes les zones de layout
  _hideAllLayoutZones(body, sectionId);

  // Afficher / créer la zone cible
  switch (layout) {
    case 'text':     _showTextZone(section, body, sectionId);     break;
    case 'table':    _showTableZone(section, body, sectionId);    break;
    case 'image':    _showImageZone(section, body, sectionId);    break;
    case 'planning': _showPlanningZone(section, body, sectionId); break;
  }
}
window.setModuleLayout = setModuleLayout;

/* ─────────────────────────────────────────────────────
   MASQUER TOUTES LES ZONES
───────────────────────────────────────────────────── */
function _hideAllLayoutZones(body, sectionId) {
  // Masquer les zones non-texte
  body.querySelectorAll('.mlt-table-zone, .mlt-image-zone, .mlt-planning-zone').forEach(el => {
    el.style.display = 'none';
  });
  // Masquer les wrappers de texte dédiés (créés par layout)
  body.querySelectorAll('.mlt-text-zone').forEach(el => {
    el.style.display = 'none';
  });
  // Masquer aussi les éditeurs Quill optionnels natifs et leur container Quill
  body.querySelectorAll('.optional-quill-editor').forEach(el => {
    // Si l'éditeur est déjà initialisé (Quill l'a transformé), chercher le parent .ql-toolbar + .ql-container
    // On masque le wrapper direct dans le body, ou le conteneur Quill
    const qlToolbar = el.previousElementSibling;
    if (qlToolbar && qlToolbar.classList.contains('ql-toolbar')) {
      qlToolbar.style.display = 'none';
    }
    el.style.display = 'none';
  });

  // Pour sectionKeyPoints : NE PAS masquer le Quill principal (il sera géré par _showTextZone)
  // Pour les autres sections : masquer les .ql-toolbar/.ql-container natifs
  if (sectionId !== 'sectionKeyPoints') {
    body.querySelectorAll('.ql-toolbar').forEach(el => {
      el.style.display = 'none';
    });
    body.querySelectorAll('.ql-container').forEach(el => {
      el.style.display = 'none';
    });
  } else {
    // Pour sectionKeyPoints : masquer les .ql-toolbar/.ql-container
    // sauf si on revient en mode texte (géré dans _showTextZone)
    body.querySelectorAll('.ql-toolbar').forEach(el => {
      el.style.display = 'none';
    });
    body.querySelectorAll('.ql-container').forEach(el => {
      el.style.display = 'none';
    });
  }
}

/* ─────────────────────────────────────────────────────
   ZONE TEXTE (Quill)
───────────────────────────────────────────────────── */
function _showTextZone(section, body, sectionId) {
  // ── Cas spécial : sectionKeyPoints → éditeur principal STATE.quillEditor ──
  // L'éditeur principal (#quillEditor) n'a pas la classe .optional-quill-editor
  // Il faut le ré-afficher explicitement (toolbar + container)
  if (sectionId === 'sectionKeyPoints') {
    body.querySelectorAll('.ql-toolbar').forEach(el => { el.style.display = ''; });
    body.querySelectorAll('.ql-container').forEach(el => { el.style.display = ''; });
    // S'assurer que l'instance Quill est bien active (focus possible)
    if (window.STATE?.quillEditor) {
      try { window.STATE.quillEditor.enable(true); } catch(e) {}
    }
    return;
  }

  // 1. Chercher une zone texte dédiée déjà créée
  let textZone = body.querySelector(`.mlt-text-zone[data-sid="${sectionId}"]`);
  if (textZone) {
    textZone.style.display = '';
    return;
  }

  // 2. Chercher un éditeur Quill optionnel natif (optional-quill-editor)
  // Ces éditeurs sont déjà initialisés par app.js/_initOptionalQuillEditors
  const nativeEditor = body.querySelector('.optional-quill-editor, .ql-container');
  if (nativeEditor) {
    // Ré-afficher l'éditeur natif et sa toolbar
    const qlToolbar = body.querySelector('.ql-toolbar');
    if (qlToolbar) qlToolbar.style.display = '';

    // Si c'est un .optional-quill-editor (wrapper), afficher le wrapper + toolbar Quill
    const optEditor = body.querySelector('.optional-quill-editor');
    if (optEditor) {
      // La toolbar Quill est le sibling précédent si Quill a été init
      const prev = optEditor.previousElementSibling;
      if (prev && prev.classList.contains('ql-toolbar')) {
        prev.style.display = '';
      }
      optEditor.style.display = '';
    }
    // Ré-afficher aussi directement les .ql-toolbar et .ql-container (pour les sections optionnelles)
    body.querySelectorAll('.ql-toolbar').forEach(el => { el.style.display = ''; });
    body.querySelectorAll('.ql-container').forEach(el => { el.style.display = ''; });
    return;
  }

  // 3. Créer un nouveau Quill dans un wrapper mlt-text-zone
  const wrapper = document.createElement('div');
  wrapper.className = 'mlt-text-zone';
  wrapper.dataset.sid = sectionId;

  const editorId = `mlt_editor_${sectionId}`;
  const editorDiv = document.createElement('div');
  editorDiv.id = editorId;
  editorDiv.style.minHeight = '160px';
  wrapper.appendChild(editorDiv);
  body.appendChild(wrapper);

  if (!window.Quill) return;

  try {
    const q = new Quill(`#${editorId}`, {
      theme: 'snow',
      placeholder: 'Rédigez ici… (vous pouvez coller un tableau Excel directement)',
      modules: {
        toolbar: _getLayoutQuillToolbar(),
        clipboard: { matchVisual: false },
      },
    });

    if (typeof _attachExcelPasteToQuill === 'function') _attachExcelPasteToQuill(q);
    if (!STATE._quillEditors) STATE._quillEditors = {};
    STATE._quillEditors[editorId] = q;

  } catch (e) {
    console.warn('[ModuleLayout] Quill init:', e);
  }
}

function _getLayoutQuillToolbar() {
  return [
    [{ font: [] }],
    [{ header: [1, 2, 3, false] }],
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

/* ─────────────────────────────────────────────────────
   ZONE TABLEAU ÉDITABLE
───────────────────────────────────────────────────── */
function _showTableZone(section, body, sectionId) {
  let zone = body.querySelector(`.mlt-table-zone[data-sid="${sectionId}"]`);

  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'mlt-table-zone';
    zone.dataset.sid = sectionId;
    zone.innerHTML = _buildTableZoneHTML(sectionId);
    body.appendChild(zone);
    // Attacher collage Excel
    const tbl = zone.querySelector(`#mltTable_${sectionId}`);
    if (tbl) _attachExcelPasteToTable(tbl, sectionId);
  }

  zone.style.display = '';
}

function _buildTableZoneHTML(sid) {
  return `
  <div class="mlt-table-toolbar">
    <button type="button" class="mlt-ctrl-btn" onclick="mltTableAddRow('${sid}')">
      <i class="fa-solid fa-plus"></i> Ligne
    </button>
    <button type="button" class="mlt-ctrl-btn" onclick="mltTableAddCol('${sid}')">
      <i class="fa-solid fa-plus"></i> Colonne
    </button>
    <button type="button" class="mlt-ctrl-btn" onclick="mltTableDelRow('${sid}')">
      <i class="fa-solid fa-minus"></i> Suppr. ligne
    </button>
    <button type="button" class="mlt-ctrl-btn mlt-ctrl-danger" onclick="mltTableReset('${sid}')">
      <i class="fa-solid fa-rotate-left"></i> Réinitialiser
    </button>
    <span class="mlt-table-hint">
      <i class="fa-solid fa-paste"></i> Collez directement depuis Excel
    </span>
  </div>
  <div class="mlt-table-wrap">
    <table class="mlt-table" id="mltTable_${sid}">
      <thead>
        <tr>
          <th contenteditable="true">Colonne 1</th>
          <th contenteditable="true">Colonne 2</th>
          <th contenteditable="true">Colonne 3</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td contenteditable="true"></td>
          <td contenteditable="true"></td>
          <td contenteditable="true"></td>
        </tr>
        <tr>
          <td contenteditable="true"></td>
          <td contenteditable="true"></td>
          <td contenteditable="true"></td>
        </tr>
        <tr>
          <td contenteditable="true"></td>
          <td contenteditable="true"></td>
          <td contenteditable="true"></td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

/* Contrôles tableau */
function mltTableAddRow(sid) {
  const tbl = document.querySelector(`#mltTable_${sid}`);
  if (!tbl) return;
  const cols = tbl.querySelector('tr')?.children.length || 3;
  const tr = document.createElement('tr');
  for (let i = 0; i < cols; i++) {
    const td = document.createElement('td');
    td.contentEditable = 'true';
    tr.appendChild(td);
  }
  tbl.querySelector('tbody')?.appendChild(tr);
  // Focus sur la première cellule
  tr.querySelector('td')?.focus();
}
window.mltTableAddRow = mltTableAddRow;

function mltTableAddCol(sid) {
  const tbl = document.querySelector(`#mltTable_${sid}`);
  if (!tbl) return;
  const th = document.createElement('th');
  th.contentEditable = 'true';
  th.textContent = 'Nouvelle colonne';
  tbl.querySelector('thead tr')?.appendChild(th);
  tbl.querySelectorAll('tbody tr').forEach(tr => {
    const td = document.createElement('td');
    td.contentEditable = 'true';
    tr.appendChild(td);
  });
}
window.mltTableAddCol = mltTableAddCol;

function mltTableDelRow(sid) {
  const tbody = document.querySelector(`#mltTable_${sid} tbody`);
  if (tbody?.lastElementChild) tbody.removeChild(tbody.lastElementChild);
}
window.mltTableDelRow = mltTableDelRow;

function mltTableReset(sid) {
  const zone = document.querySelector(`.mlt-table-zone[data-sid="${sid}"]`);
  if (!zone) return;
  const wrap = zone.querySelector('.mlt-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <table class="mlt-table" id="mltTable_${sid}">
      <thead><tr>
        <th contenteditable="true">Colonne 1</th>
        <th contenteditable="true">Colonne 2</th>
        <th contenteditable="true">Colonne 3</th>
      </tr></thead>
      <tbody>
        <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
        <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
        <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
      </tbody>
    </table>`;
  const newTbl = wrap.querySelector('.mlt-table');
  if (newTbl) _attachExcelPasteToTable(newTbl, sid);
}
window.mltTableReset = mltTableReset;

/* ─────────────────────────────────────────────────────
   ZONE IMAGE
───────────────────────────────────────────────────── */
function _showImageZone(section, body, sectionId) {
  let zone = body.querySelector(`.mlt-image-zone[data-sid="${sectionId}"]`);

  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'mlt-image-zone';
    zone.dataset.sid = sectionId;
    zone.innerHTML = _buildImageZoneHTML(sectionId);
    body.appendChild(zone);
  }

  zone.style.display = '';
}

function _buildImageZoneHTML(sid) {
  return `
  <div class="mlt-image-dropzone" id="mltImgDrop_${sid}"
       onclick="document.getElementById('mltImgFile_${sid}').click()"
       ondragover="event.preventDefault();this.classList.add('drag-over')"
       ondragleave="this.classList.remove('drag-over')"
       ondrop="mltImageDrop(event,'${sid}')">
    <i class="fa-solid fa-cloud-arrow-up"></i>
    <p><strong>Cliquez ici</strong> ou glissez une image</p>
    <p class="mlt-image-hint">JPG, PNG, GIF, SVG, WEBP — max 8 Mo</p>
  </div>
  <input type="file" id="mltImgFile_${sid}" accept="image/*" style="display:none"
         onchange="mltImageSelected('${sid}', this)" />
  <div class="mlt-image-preview-zone" id="mltImgPreview_${sid}" style="display:none">
    <div class="mlt-image-preview-inner">
      <img id="mltImgTag_${sid}" src="" alt="" class="mlt-image-preview-img" />
    </div>
    <div class="mlt-image-caption-row">
      <input type="text" class="mlt-image-caption-input" id="mltImgCaption_${sid}"
             placeholder="Légende de l'image (optionnel)…" />
    </div>
    <div class="mlt-image-actions">
      <button type="button" class="mlt-ctrl-btn"
              onclick="document.getElementById('mltImgFile_${sid}').click()">
        <i class="fa-solid fa-arrow-up-from-bracket"></i> Changer l'image
      </button>
      <button type="button" class="mlt-ctrl-btn mlt-ctrl-danger"
              onclick="mltImageClear('${sid}')">
        <i class="fa-solid fa-trash"></i> Supprimer
      </button>
    </div>
  </div>`;
}

function mltImageSelected(sid, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast('Fichier non reconnu comme image.', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('Image trop volumineuse (max 8 Mo).', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => _mltShowImagePreview(sid, e.target.result, file.name);
  reader.readAsDataURL(file);
}
window.mltImageSelected = mltImageSelected;

function mltImageDrop(e, sid) {
  e.preventDefault();
  document.getElementById(`mltImgDrop_${sid}`)?.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = ev => _mltShowImagePreview(sid, ev.target.result, file.name);
  reader.readAsDataURL(file);
}
window.mltImageDrop = mltImageDrop;

function _mltShowImagePreview(sid, src, name) {
  const dropzone = document.getElementById(`mltImgDrop_${sid}`);
  const preview  = document.getElementById(`mltImgPreview_${sid}`);
  const img      = document.getElementById(`mltImgTag_${sid}`);
  const caption  = document.getElementById(`mltImgCaption_${sid}`);

  if (dropzone) dropzone.style.display = 'none';
  if (img)      { img.src = src; img.alt = name || 'image'; }
  if (caption)  caption.placeholder = name || 'Légende…';
  if (preview)  {
    preview.style.display = '';
    preview.dataset.src = src; // pour l'export
  }
}

function mltImageClear(sid) {
  const dropzone  = document.getElementById(`mltImgDrop_${sid}`);
  const preview   = document.getElementById(`mltImgPreview_${sid}`);
  const img       = document.getElementById(`mltImgTag_${sid}`);
  const caption   = document.getElementById(`mltImgCaption_${sid}`);
  const fileInput = document.getElementById(`mltImgFile_${sid}`);
  if (img)      img.src = '';
  if (caption)  caption.value = '';
  if (preview)  { preview.style.display = 'none'; preview.dataset.src = ''; }
  if (dropzone) dropzone.style.display = '';
  if (fileInput)fileInput.value = '';
}
window.mltImageClear = mltImageClear;

/* ─────────────────────────────────────────────────────
   ZONE PLANNING
───────────────────────────────────────────────────── */
function _showPlanningZone(section, body, sectionId) {
  let zone = body.querySelector(`.mlt-planning-zone[data-sid="${sectionId}"]`);

  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'mlt-planning-zone';
    zone.dataset.sid = sectionId;
    zone.innerHTML = _buildPlanningZoneHTML(sectionId);
    body.appendChild(zone);
    // Appliquer les couleurs de statut initiales
    zone.querySelectorAll('.mlt-plan-status-sel').forEach(sel => mltPlanUpdateStatus(sel));
  }

  zone.style.display = '';
}

function _buildPlanningZoneHTML(sid) {
  const statusOpts = [
    { v:'todo',    l:'À faire'  },
    { v:'wip',     l:'En cours' },
    { v:'done',    l:'Terminé'  },
    { v:'blocked', l:'Bloqué'   },
  ];
  const opts = statusOpts.map(s => `<option value="${s.v}">${s.l}</option>`).join('');

  const defaultRows = [
    { task:'Phase 1 - Initialisation',  owner:'',  start:'', end:'', pct:0,  status:'done'    },
    { task:'Phase 2 - Développement',   owner:'',  start:'', end:'', pct:50, status:'wip'     },
    { task:'Phase 3 - Recette',         owner:'',  start:'', end:'', pct:0,  status:'todo'    },
    { task:'Phase 4 - Déploiement',     owner:'',  start:'', end:'', pct:0,  status:'todo'    },
  ];

  const rowsHtml = defaultRows.map(r => _buildPlanningRow(sid, r, opts)).join('');

  return `
  <div class="mlt-planning-header">
    <span class="mlt-planning-legend">
      <span class="mlt-plan-badge mlt-plan-done">Terminé</span>
      <span class="mlt-plan-badge mlt-plan-wip">En cours</span>
      <span class="mlt-plan-badge mlt-plan-todo">À faire</span>
      <span class="mlt-plan-badge mlt-plan-blocked">Bloqué</span>
    </span>
  </div>
  <div class="mlt-planning-wrap">
    <table class="mlt-planning-table" id="mltPlan_${sid}">
      <thead>
        <tr>
          <th class="col-task">Tâche / Étape</th>
          <th class="col-owner">Responsable</th>
          <th class="col-date">Début</th>
          <th class="col-date">Fin</th>
          <th class="col-pct">Avancement</th>
          <th class="col-status">Statut</th>
          <th class="col-del"></th>
        </tr>
      </thead>
      <tbody id="mltPlanBody_${sid}">
        ${rowsHtml}
      </tbody>
    </table>
  </div>
  <div class="mlt-table-toolbar">
    <button type="button" class="mlt-ctrl-btn" onclick="mltPlanAddRow('${sid}')">
      <i class="fa-solid fa-plus"></i> Ajouter une étape
    </button>
    <button type="button" class="mlt-ctrl-btn mlt-ctrl-danger" onclick="mltPlanReset('${sid}')">
      <i class="fa-solid fa-rotate-left"></i> Réinitialiser
    </button>
  </div>`;
}

function _buildPlanningRow(sid, r, opts) {
  const safeOpts = opts.replace(
    `value="${r.status || 'todo'}"`,
    `value="${r.status || 'todo'}" selected`
  );
  const pct = r.pct || 0;
  return `<tr class="mlt-plan-row">
    <td><input type="text" class="mlt-plan-input" value="${r.task || ''}" placeholder="Nom de la tâche…" /></td>
    <td><input type="text" class="mlt-plan-input" value="${r.owner || ''}" placeholder="Responsable…" /></td>
    <td><input type="date" class="mlt-plan-input" value="${r.start || ''}" /></td>
    <td><input type="date" class="mlt-plan-input" value="${r.end || ''}" /></td>
    <td>
      <div class="mlt-plan-pct-wrap">
        <div class="mlt-plan-pct-bar-bg">
          <div class="mlt-plan-pct-bar-fill" style="width:${pct}%"></div>
        </div>
        <input type="range" min="0" max="100" step="5" value="${pct}"
               class="mlt-plan-range"
               oninput="
                 const fill = this.parentElement.querySelector('.mlt-plan-pct-bar-fill');
                 if(fill) fill.style.width=this.value+'%';
                 this.parentElement.querySelector('.mlt-plan-pct-label').textContent=this.value+'%';
               " />
        <span class="mlt-plan-pct-label">${pct}%</span>
      </div>
    </td>
    <td>
      <select class="mlt-plan-status-sel" onchange="mltPlanUpdateStatus(this)">
        ${safeOpts}
      </select>
    </td>
    <td>
      <button type="button" class="mlt-plan-del-btn" onclick="this.closest('tr').remove()"
              title="Supprimer cette ligne">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </td>
  </tr>`;
}

function mltPlanAddRow(sid) {
  const tbody = document.getElementById(`mltPlanBody_${sid}`);
  if (!tbody) return;
  const opts = [
    { v:'todo',l:'À faire'}, {v:'wip',l:'En cours'}, {v:'done',l:'Terminé'}, {v:'blocked',l:'Bloqué'}
  ].map(s => `<option value="${s.v}">${s.l}</option>`).join('');
  const tr = document.createElement('tr');
  tr.className = 'mlt-plan-row';
  tr.innerHTML = `
    <td><input type="text" class="mlt-plan-input" placeholder="Nom de la tâche…" /></td>
    <td><input type="text" class="mlt-plan-input" placeholder="Responsable…" /></td>
    <td><input type="date" class="mlt-plan-input" /></td>
    <td><input type="date" class="mlt-plan-input" /></td>
    <td>
      <div class="mlt-plan-pct-wrap">
        <div class="mlt-plan-pct-bar-bg">
          <div class="mlt-plan-pct-bar-fill" style="width:0%"></div>
        </div>
        <input type="range" min="0" max="100" step="5" value="0" class="mlt-plan-range"
               oninput="
                 const fill = this.parentElement.querySelector('.mlt-plan-pct-bar-fill');
                 if(fill) fill.style.width=this.value+'%';
                 this.parentElement.querySelector('.mlt-plan-pct-label').textContent=this.value+'%';
               " />
        <span class="mlt-plan-pct-label">0%</span>
      </div>
    </td>
    <td><select class="mlt-plan-status-sel" onchange="mltPlanUpdateStatus(this)">${opts}</select></td>
    <td><button type="button" class="mlt-plan-del-btn" onclick="this.closest('tr').remove()" title="Supprimer">
      <i class="fa-solid fa-xmark"></i></button></td>`;
  tbody.appendChild(tr);
  tr.querySelector('input')?.focus();
}
window.mltPlanAddRow = mltPlanAddRow;

function mltPlanReset(sid) {
  const tbody = document.getElementById(`mltPlanBody_${sid}`);
  if (!tbody) return;
  const opts = [
    {v:'todo',l:'À faire'},{v:'wip',l:'En cours'},{v:'done',l:'Terminé'},{v:'blocked',l:'Bloqué'}
  ].map(s => `<option value="${s.v}">${s.l}</option>`).join('');
  const defaultRows = [
    {task:'',owner:'',start:'',end:'',pct:0,status:'todo'},
    {task:'',owner:'',start:'',end:'',pct:0,status:'todo'},
  ];
  tbody.innerHTML = defaultRows.map(r => _buildPlanningRow(sid, r, opts)).join('');
}
window.mltPlanReset = mltPlanReset;

function mltPlanUpdateStatus(sel) {
  if (!sel) return;
  const colorMap = {
    todo:    { bg: '#FEF3C7', text: '#D97706' },
    wip:     { bg: '#DBEAFE', text: '#2563EB' },
    done:    { bg: '#D1FAE5', text: '#059669' },
    blocked: { bg: '#FEE2E2', text: '#DC2626' },
  };
  const c = colorMap[sel.value] || { bg: '#F3F4F6', text: '#555' };
  sel.style.background = c.bg;
  sel.style.color = c.text;
  sel.style.fontWeight = '600';
  sel.style.border = `1.5px solid ${c.text}40`;
}
window.mltPlanUpdateStatus = mltPlanUpdateStatus;

/* ─────────────────────────────────────────────────────
   COLLAGE EXCEL DANS QUILL
───────────────────────────────────────────────────── */
function _attachExcelPasteToQuill(quill) {
  if (!quill) return;
  quill.root.addEventListener('paste', function(e) {
    const html = e.clipboardData?.getData('text/html') || '';
    const text = e.clipboardData?.getData('text/plain') || '';
    const hasTable = /<table[\s>]/i.test(html);
    if (!hasTable && !text.includes('\t')) return;
    e.preventDefault();
    const insertHtml = hasTable ? _cleanExcelHtml(html) : _tsvToHtmlTable(text);
    if (!insertHtml) return;
    const range = quill.getSelection(true) || { index: 0 };
    quill.clipboard.dangerouslyPasteHTML(range.index, insertHtml);
    if (typeof showToast === 'function') showToast('Tableau collé depuis Excel ✓', 'success', 1800);
  }, true);
}

/* Collage Excel dans tableau éditable */
function _attachExcelPasteToTable(table, sid) {
  if (!table) return;
  table.addEventListener('paste', function(e) {
    const html = e.clipboardData?.getData('text/html') || '';
    const text = e.clipboardData?.getData('text/plain') || '';
    if (html && /<table[\s>]/i.test(html)) {
      e.preventDefault();
      _pasteHtmlIntoTable(table, html);
    } else if (text && text.includes('\t')) {
      e.preventDefault();
      _pasteTsvIntoTable(table, text);
    }
  });
}

function _cleanExcelHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');
  let result = '';
  tables.forEach(t => {
    result += '<table style="border-collapse:collapse;width:100%">';
    t.querySelectorAll('tr').forEach((row, idx) => {
      result += '<tr>';
      row.querySelectorAll('td,th').forEach(cell => {
        const tag = idx === 0 ? 'th' : 'td';
        const cs = cell.getAttribute('colspan') ? ` colspan="${cell.getAttribute('colspan')}"` : '';
        const rs = cell.getAttribute('rowspan') ? ` rowspan="${cell.getAttribute('rowspan')}"` : '';
        const style = idx === 0
          ? 'border:1px solid #ccc;padding:6px 10px;background:#f5f5f5;font-weight:700'
          : 'border:1px solid #ccc;padding:5px 8px';
        result += `<${tag}${cs}${rs} style="${style}">${(cell.textContent || '').trim()}</${tag}>`;
      });
      result += '</tr>';
    });
    result += '</table>';
  });
  return result;
}

function _tsvToHtmlTable(text) {
  const lines = text.trim().split('\n').map(l => l.split('\t'));
  if (!lines.length) return '';
  let html = '<table style="border-collapse:collapse;width:100%">';
  lines.forEach((cols, i) => {
    html += '<tr>' + cols.map(c => {
      return i === 0
        ? `<th style="border:1px solid #ccc;padding:6px 10px;background:#f5f5f5;font-weight:700">${c.trim()}</th>`
        : `<td style="border:1px solid #ccc;padding:5px 8px">${c.trim()}</td>`;
    }).join('') + '</tr>';
  });
  return html + '</table>';
}

function _pasteHtmlIntoTable(table, html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const srcRows = doc.querySelectorAll('tr');
  if (!srcRows.length) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (thead && srcRows[0]) {
    thead.innerHTML = '<tr>' + Array.from(srcRows[0].querySelectorAll('td,th')).map(c =>
      `<th contenteditable="true" style="min-width:80px">${(c.textContent || '').trim()}</th>`
    ).join('') + '</tr>';
  }
  if (tbody) {
    tbody.innerHTML = Array.from(srcRows).slice(1).map(row =>
      '<tr>' + Array.from(row.querySelectorAll('td,th')).map(c =>
        `<td contenteditable="true">${(c.textContent || '').trim()}</td>`
      ).join('') + '</tr>'
    ).join('');
  }
  if (typeof showToast === 'function') showToast('Tableau Excel collé ✓', 'success', 1800);
}

function _pasteTsvIntoTable(table, text) {
  const lines = text.trim().split('\n').map(l => l.split('\t'));
  if (!lines.length) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (thead && lines[0]) {
    thead.innerHTML = '<tr>' + lines[0].map(h =>
      `<th contenteditable="true" style="min-width:80px">${h.trim()}</th>`
    ).join('') + '</tr>';
  }
  if (tbody) {
    tbody.innerHTML = lines.slice(1).map(cols =>
      '<tr>' + cols.map(c => `<td contenteditable="true">${c.trim()}</td>`).join('') + '</tr>'
    ).join('');
  }
  if (typeof showToast === 'function') showToast('Données Excel collées ✓', 'success', 1800);
}

/* ─────────────────────────────────────────────────────
   MAPPING sectionId -> quillEditorId (sections standards)
───────────────────────────────────────────────────── */
const _SECTION_QUILL_MAP = {
  sectionDecisions: 'decisions_quill_editor',
  sectionRisks:     'risks_quill_editor',
  sectionBudget:    'budget_quill_editor',
  sectionNextSteps: 'next_steps_quill_editor',
};

/* ─────────────────────────────────────────────────────
   EXPORT : récupérer le contenu d'un module
───────────────────────────────────────────────────── */
function getModuleLayoutContent(sectionId) {
  const layout  = _layouts[sectionId] || 'text';
  const section = document.getElementById(sectionId);
  if (!section) return { layout, html: '' };
  const body = section.querySelector('.section-body');
  if (!body) return { layout, html: '' };

  switch (layout) {
    case 'text': {
      // 1. Éditeur créé par le sélecteur de layout (mlt_editor_xxx)
      const editorId = `mlt_editor_${sectionId}`;
      const q1 = STATE?._quillEditors?.[editorId];
      if (q1) return { layout, html: q1.root.innerHTML };

      // 2. Éditeur standard mappé (decisions_quill_editor, etc.)
      const mappedId = _SECTION_QUILL_MAP[sectionId];
      if (mappedId) {
        const q2 = STATE?._quillEditors?.[mappedId];
        if (q2) return { layout, html: q2.root.innerHTML };
      }

      // 3. Éditeur custom sections (quillId = uuid, stocké dans STATE._quillEditors)
      const nativeKeys = [
        sectionId,
        `${sectionId}_quill_editor`,
        `quill_layout_${sectionId}`,
      ];
      for (const k of nativeKeys) {
        const q = STATE?._quillEditors?.[k];
        if (q) return { layout, html: q.root.innerHTML };
      }

      // 4. Key Points principal (éditeur principal du formulaire)
      if (sectionId === 'sectionKeyPoints' && STATE?.quillEditor) {
        return { layout, html: STATE.quillEditor.root.innerHTML };
      }

      // 5. Chercher dans le DOM un éditeur Quill déjà initialisé
      const qlEditor = body.querySelector('.ql-editor');
      if (qlEditor) return { layout, html: qlEditor.innerHTML };

      return { layout, html: '' };
    }
    case 'table': {
      const tbl = body.querySelector('.mlt-table');
      return { layout, html: tbl ? tbl.outerHTML : '' };
    }
    case 'image': {
      const preview = body.querySelector('.mlt-image-preview-zone');
      const src     = preview?.dataset.src || '';
      const caption = body.querySelector('.mlt-image-caption-input')?.value || '';
      if (!src) return { layout, html: '' };
      return {
        layout,
        html: `<figure style="text-align:center;margin:8px 0">
          <img src="${src}" alt="${caption}" loading="lazy" decoding="async" style="max-width:100%;height:auto;border-radius:8px;object-fit:contain" />
          ${caption ? `<figcaption style="font-size:.8rem;color:#666;margin-top:4px">${caption}</figcaption>` : ''}
        </figure>`,
      };
    }
    case 'planning': {
      const tbl = body.querySelector('.mlt-planning-table');
      if (!tbl) return { layout, html: '', planningRows: [] };
      // Lire les valeurs DIRECTEMENT depuis le DOM vivant (les .value des inputs/selects
      // ne sont pas sérialisés dans outerHTML après modification par l'utilisateur)
      const rows = [];
      tbl.querySelectorAll('tbody tr.mlt-plan-row, tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 2) return;
        const taskEl    = cells[0]?.querySelector('input[type="text"]');
        const ownerEl   = cells[1]?.querySelector('input[type="text"]');
        const startEl   = cells[2]?.querySelector('input[type="date"]');
        const endEl     = cells[3]?.querySelector('input[type="date"]');
        const rangeEl   = cells[4]?.querySelector('input[type="range"]');
        const pctLbl    = cells[4]?.querySelector('.mlt-plan-pct-label');
        const statusEl  = cells[5]?.querySelector('select.mlt-plan-status-sel');
        rows.push({
          task:    taskEl?.value   || taskEl?.getAttribute('value')   || '',
          owner:   ownerEl?.value  || ownerEl?.getAttribute('value')  || '',
          start:   startEl?.value  || startEl?.getAttribute('value')  || '',
          end:     endEl?.value    || endEl?.getAttribute('value')    || '',
          pct:     parseInt(rangeEl?.value || pctLbl?.textContent?.replace('%','') || '0') || 0,
          status:  statusEl?.value || 'todo',
          statusLabel: statusEl?.options?.[statusEl.selectedIndex]?.text || 'À faire',
        });
      });
      // Retourner à la fois le HTML (fallback) et les données structurées
      return { layout, html: tbl.outerHTML, planningRows: rows };
    }
  }
  return { layout, html: '' };
}
window.getModuleLayoutContent         = getModuleLayoutContent;

/* ─────────────────────────────────────────────────────
   RESET DES LAYOUTS
   ───────────────────────────────────────────────────── */
function resetModuleLayouts() {
  _layouts = {};
  document.querySelectorAll('.module-layout-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === 'text');
  });
  document.querySelectorAll('.form-section, .section-custom').forEach(sec => {
    const body = sec.querySelector('.section-body');
    if (body) {
      _hideAllLayoutZones(body, sec.id);
      _showTextZone(sec, body, sec.id);
    }
  });
  
  // Vider les previews d'images
  document.querySelectorAll('.mlt-image-preview-zone').forEach(el => {
    el.style.display = 'none';
    el.dataset.src = '';
  });
  document.querySelectorAll('.mlt-image-dropzone').forEach(el => {
    el.style.display = '';
  });
  document.querySelectorAll('.mlt-image-caption-input').forEach(el => { el.value = ''; });
  document.querySelectorAll('.mlt-image-preview-img').forEach(el => { el.src = ''; });
  
  // Vider les tableaux
  document.querySelectorAll('.mlt-table-zone').forEach(el => {
    const sid = el.dataset.sid;
    if (sid && typeof mltTableReset === 'function') mltTableReset(sid);
  });
  
  // Vider le planning
  document.querySelectorAll('.mlt-planning-zone').forEach(el => {
    const sid = el.dataset.sid;
    if (sid && typeof mltPlanReset === 'function') mltPlanReset(sid);
  });
}
window.resetModuleLayouts = resetModuleLayouts;

window.initModuleLayoutSelectors      = initModuleLayoutSelectors;
window._attachLayoutToOptionalSections = _attachLayoutToOptionalSections;
window._attachExcelPasteToQuill       = _attachExcelPasteToQuill;

/* ─────────────────────────────────────────────────────
   AUTO-INIT
───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Délai pour laisser le temps au DOM et aux éditeurs natifs de s'initialiser
  setTimeout(initModuleLayoutSelectors, 800);
});
