/* =====================================================
   WAVESTONE CR MASTER – section-editor.js
   Édition titre + icône des modules CR
   Édition des vignettes/projets
   ===================================================== */
'use strict';

/* ─────────────────────────────────────────────────────
   LISTE DES ICÔNES DISPONIBLES (Font Awesome 6)
───────────────────────────────────────────────────── */
const SECTION_ICONS = [
  // Réunion / CR
  'fa-file-lines','fa-briefcase','fa-users','fa-list-check','fa-gavel',
  'fa-triangle-exclamation','fa-chart-line','fa-arrow-right','fa-calendar-days',
  'fa-pen-to-square','fa-comment-dots','fa-lightbulb','fa-star','fa-flag',
  // Business
  'fa-building','fa-handshake','fa-chart-bar','fa-chart-pie','fa-coins',
  'fa-euro-sign','fa-dollar-sign','fa-wallet','fa-piggy-bank','fa-credit-card',
  // Tech / IT
  'fa-server','fa-database','fa-code','fa-bug','fa-gear','fa-microchip',
  'fa-shield-halved','fa-lock','fa-wifi','fa-cloud','fa-laptop',
  // Personnes
  'fa-user','fa-user-tie','fa-user-group','fa-person-chalkboard','fa-graduation-cap',
  // Actions / Statuts
  'fa-check-circle','fa-circle-xmark','fa-clock','fa-hourglass-half',
  'fa-fire','fa-rocket','fa-bullseye','fa-crosshairs','fa-sitemap',
  // Contenus
  'fa-image','fa-table','fa-link','fa-paperclip','fa-envelope',
  'fa-map-location-dot','fa-globe','fa-magnifying-glass','fa-info-circle',
  // Autres
  'fa-thumbtack','fa-tag','fa-tags','fa-bookmark','fa-heart',
  'fa-award','fa-trophy','fa-medal','fa-circle','fa-square',
];

/* ─────────────────────────────────────────────────────
   ÉTAT ÉDITEUR SECTION
───────────────────────────────────────────────────── */
let _sectionEditTarget = null;   // ID de la section en cours d'édition
let _sectionEditIcon   = '';
let _sectionEditColor  = '#002D72';

/* ─────────────────────────────────────────────────────
   OUVRIR LE PICKER D'ICÔNE
───────────────────────────────────────────────────── */
function openSectionIconPicker(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  _sectionEditTarget = sectionId;

  // Lire l'état actuel
  const iconEl   = section.querySelector('.section-icon i');
  const titleEl  = section.querySelector('h3');
  const iconName = (iconEl?.className.match(/fa-[\w-]+(?!\s*fa-solid)/) || [''])[0].replace('fa-solid ','').trim();
  const currentIcon  = iconName || section.dataset.sectionIcon || 'fa-file-lines';
  const currentColor = section.dataset.sectionColor ||
                       _extractColor(iconEl?.style?.color) || '#002D72';
  const currentTitle = titleEl?.textContent?.trim() || '';

  _sectionEditIcon  = currentIcon;
  _sectionEditColor = currentColor;

  // Remplir le formulaire
  const titleInput = document.getElementById('sectionEditTitle');
  const colorInput = document.getElementById('sectionEditColor');
  if (titleInput) titleInput.value = currentTitle;
  if (colorInput) colorInput.value = _hexFromColor(currentColor);

  // Générer la grille d'icônes
  _buildIconGrid(currentIcon);

  // Aperçu initial
  _sectionEditUpdatePreview();

  // Bouton Appliquer
  const btn = document.getElementById('btnApplySectionEdit');
  if (btn) btn.onclick = _applySectionEdit;

  // Sync couleur sur input change
  const colorInputEl = document.getElementById('sectionEditColor');
  if (colorInputEl) {
    colorInputEl.oninput = () => {
      _sectionEditColor = colorInputEl.value;
      _sectionEditUpdatePreview();
    };
  }

  openModal('modalSectionEdit');
}
window.openSectionIconPicker = openSectionIconPicker;

function _hexFromColor(color) {
  if (!color) return '#002D72';
  if (color.startsWith('#')) return color;
  // rgb() → hex
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
  }
  return '#002D72';
}

function _extractColor(str) {
  if (!str) return null;
  if (str.startsWith('#') || str.startsWith('rgb')) return str;
  return null;
}

function _buildIconGrid(currentIcon) {
  const grid = document.getElementById('sectionIconGrid');
  if (!grid) return;
  grid.innerHTML = SECTION_ICONS.map(icon => `
    <button type="button"
            class="section-icon-pick-btn${icon === currentIcon ? ' selected' : ''}"
            data-icon="${icon}"
            onclick="_selectSectionIcon('${icon}')"
            title="${icon.replace('fa-','')}">
      <i class="fa-solid ${icon}"></i>
    </button>
  `).join('');
}

function _selectSectionIcon(icon) {
  _sectionEditIcon = icon;
  // Mettre à jour visuellement
  document.querySelectorAll('.section-icon-pick-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.icon === icon);
  });
  _sectionEditUpdatePreview();
}
window._selectSectionIcon = _selectSectionIcon;

function _sectionEditUpdatePreview() {
  const colorInput = document.getElementById('sectionEditColor');
  const titleInput = document.getElementById('sectionEditTitle');
  if (colorInput) _sectionEditColor = colorInput.value;

  const previewIcon  = document.getElementById('sectionEditPreviewIcon');
  const previewTitle = document.getElementById('sectionEditPreviewTitle');

  if (previewIcon) {
    previewIcon.style.background = _sectionEditColor + '20';
    previewIcon.innerHTML = `<i class="fa-solid ${_sectionEditIcon}" style="color:${_sectionEditColor}"></i>`;
  }
  if (previewTitle) {
    previewTitle.textContent = titleInput?.value || 'Titre de la section';
    previewTitle.style.color = 'var(--gray-900)';
  }
}
window._sectionEditUpdatePreview = _sectionEditUpdatePreview;

function _applySectionEdit() {
  const section = document.getElementById(_sectionEditTarget);
  if (!section) return;

  const newTitle = document.getElementById('sectionEditTitle')?.value.trim();
  const newColor = _sectionEditColor;
  const newIcon  = _sectionEditIcon;

  // Mettre à jour l'icône
  const iconWrap = section.querySelector('.section-icon');
  if (iconWrap) {
    iconWrap.style.background = newColor + '20';
    iconWrap.innerHTML = `<i class="fa-solid ${newIcon}" style="color:${newColor}"></i>`;
  }

  // Mettre à jour le titre
  const titleEl = section.querySelector('h3');
  if (titleEl && newTitle) {
    // Conserver les attributs data-i18n si présents, mais remplacer le texte
    titleEl.textContent = newTitle;
    // Supprimer l'attribut i18n pour ne pas être écrasé par i18n
    titleEl.removeAttribute('data-i18n');
  }

  // Sauvegarder dans les data-attributes
  section.dataset.sectionIcon  = newIcon;
  section.dataset.sectionColor = newColor;

  closeModal('modalSectionEdit');
  if (typeof showToast === 'function') showToast('Section modifiée ✓', 'success', 1600);
}

/* ─────────────────────────────────────────────────────
   DOUBLE-CLIC TITRE → édition inline
───────────────────────────────────────────────────── */
function startEditSectionTitle(h3El) {
  if (!h3El || h3El.contentEditable === 'true') return;
  const prev = h3El.textContent;
  h3El.contentEditable = 'true';
  h3El.style.outline = '2px solid var(--primary)';
  h3El.style.borderRadius = '4px';
  h3El.style.padding = '2px 6px';
  h3El.focus();

  // Sélectionner tout le texte
  const range = document.createRange();
  range.selectNodeContents(h3El);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);

  const finish = () => {
    h3El.contentEditable = 'false';
    h3El.style.outline = '';
    h3El.style.borderRadius = '';
    h3El.style.padding = '';
    h3El.removeAttribute('data-i18n');
    if (!h3El.textContent.trim()) h3El.textContent = prev;
    if (typeof showToast === 'function') showToast('Titre modifié ✓', 'success', 1400);
  };

  h3El.addEventListener('blur', finish, { once: true });
  h3El.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); h3El.blur(); }
    if (e.key === 'Escape') { h3El.textContent = prev; h3El.blur(); }
  });
}
window.startEditSectionTitle = startEditSectionTitle;

/* ─────────────────────────────────────────────────────
   ÉDITION DES VIGNETTES PROJET
───────────────────────────────────────────────────── */
let _editProjectLogoData = null; // base64 du nouveau logo
let _editProjectRemoveLogo = false;

function openEditProjectModal(projectId) {
  const project = STATE?.projects?.find(p => p.id === projectId);
  if (!project) return;

  document.getElementById('editProjectId').value     = projectId;
  document.getElementById('editProjectName').value   = project.name || '';
  document.getElementById('editProjectDescription').value = project.description || '';
  document.getElementById('editProjectClient').value = project.client_name || '';

  const color = project.color || '#002D72';
  document.getElementById('editProjectColor').value  = _hexFromColor(color);

  // Logo actuel
  _editProjectLogoData   = null;
  _editProjectRemoveLogo = false;
  _updateEditProjectLogoPreview(project.logo_url || project._logoData || null);

  // Bouton Enregistrer
  document.getElementById('btnSaveEditProject').onclick = _saveEditProject;

  // Bouton Supprimer logo
  document.getElementById('btnRemoveEditLogo').onclick = () => {
    _editProjectRemoveLogo = true;
    _editProjectLogoData   = null;
    _updateEditProjectLogoPreview(null);
  };

  openModal('modalEditProject');
}
window.openEditProjectModal = openEditProjectModal;

function _updateEditProjectLogoPreview(src) {
  const prev = document.getElementById('editProjectLogoPreview');
  if (!prev) return;
  if (src) {
    prev.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:contain;border-radius:6px;" />`;
  } else {
    prev.innerHTML = `<i class="fa-solid fa-image" style="color:var(--gray-400);font-size:1.2rem;"></i>`;
  }
}

function _handleEditProjectLogo(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast('Fichier non reconnu comme image.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    _editProjectLogoData   = e.target.result;
    _editProjectRemoveLogo = false;
    _updateEditProjectLogoPreview(_editProjectLogoData);
  };
  reader.readAsDataURL(file);
}
window._handleEditProjectLogo = _handleEditProjectLogo;

async function _saveEditProject() {
  const projectId = document.getElementById('editProjectId').value;
  const name      = document.getElementById('editProjectName').value.trim();
  if (!name) {
    if (typeof showToast === 'function') showToast('Le nom du projet est obligatoire.', 'error');
    return;
  }

  const project = STATE?.projects?.find(p => p.id === projectId);
  if (!project) return;

  const color       = document.getElementById('editProjectColor').value;
  const description = document.getElementById('editProjectDescription').value.trim();
  const clientName  = document.getElementById('editProjectClient').value.trim();

  // Déterminer le logo final
  let logoUrl = project.logo_url || '';
  if (_editProjectRemoveLogo) {
    logoUrl = '';
  } else if (_editProjectLogoData) {
    logoUrl = _editProjectLogoData;
  }

  // Mettre à jour en mémoire immédiatement
  project.name         = name;
  project.color        = color;
  project.description  = description;
  project.client_name  = clientName;
  project.company      = clientName;
  project.logo_url     = logoUrl;
  if (_editProjectRemoveLogo) project._logoData = '';
  if (_editProjectLogoData)  project._logoData = _editProjectLogoData;

  // Persister via l'API REST (apiPatch ou fetch direct)
  try {
    const patch = { name, color, description, company: clientName, logo_url: logoUrl };
    if (typeof apiPatch === 'function') {
      await apiPatch('projects', projectId, patch);
    } else {
      // Fallback — passe par apiBase() si disponible
      const base = typeof apiBase === 'function' ? apiBase() : 'tables';
      await fetch(`${base}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    }
  } catch(e) {
    console.warn('[EditProject] Patch failed (offline mode):', e);
  }

  closeModal('modalEditProject');

  // Re-rendre la vue
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderSidebar   === 'function') renderSidebar();
  if (typeof renderProjectDashboard === 'function' && STATE.currentProjectId === projectId) {
    renderProjectDashboard(projectId);
  }
  // Ré-injecter les boutons d'édition après le re-rendu
  setTimeout(injectEditBtnInProjectCards, 100);

  if (typeof showToast === 'function') showToast('Projet mis à jour ✓', 'success');
}

/* ─────────────────────────────────────────────────────
   AJOUTER BOUTON ÉDITION DANS LES CARTES PROJET
   (injecté dynamiquement dans les cards existantes)
───────────────────────────────────────────────────── */
function injectEditBtnInProjectCards() {
  document.querySelectorAll('.project-card.pc-new[data-pid]').forEach(card => {
    if (card.querySelector('.pc-edit-btn')) return; // déjà injecté
    const pid = card.dataset.pid;
    const project = STATE?.projects?.find(p => p.id === pid);
    if (!project || project._shared) return; // pas d'édition pour les projets partagés (non propriétaire)

    const btn = document.createElement('button');
    btn.className = 'pc-action-btn pc-edit-btn';
    btn.title = 'Modifier le projet';
    btn.setAttribute('onclick', `event.stopPropagation();openEditProjectModal('${pid}')`);
    btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';

    // Insérer avant le bouton supprimer (dernier pc-action-btn)
    const actions = card.querySelector('.pc-header-actions');
    if (actions) {
      const firstBtn = actions.querySelector('.pc-action-btn');
      if (firstBtn) actions.insertBefore(btn, firstBtn);
      else actions.appendChild(btn);
    }
  });
}
window.injectEditBtnInProjectCards = injectEditBtnInProjectCards;

/* ─────────────────────────────────────────────────────
   OBSERVER : injecter le bouton édit quand les cards
   apparaissent dans le DOM
───────────────────────────────────────────────────── */
const _projectCardObserver = new MutationObserver(() => {
  if (document.querySelectorAll('.project-card.pc-new').length > 0) {
    injectEditBtnInProjectCards();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  _projectCardObserver.observe(document.body, { childList: true, subtree: true });
  injectEditBtnInProjectCards();
});
