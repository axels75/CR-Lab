/* =====================================================
   WAVESTONE CR MASTER – module-reorder.js
   Glisser-déposer pour réordonner les sections du CR
   ===================================================== */
'use strict';

/* ─────────────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────────────── */
// Les IDs des sections reordonnables (hors contexte qui est toujours en 1er)
const REORDERABLE_SECTIONS = [
  'sectionParticipants',
  'sectionActions',
  'sectionKeyPoints',
  // Les sections optionnelles (Décisions, Risques, Budget, Prochaines étapes)
  // sont gérées dynamiquement
];

let _reorderDragSrc = null;
let _reorderPlaceholder = null;

/* ─────────────────────────────────────────────────────
   INITIALISATION DES POIGNÉES DRAG & DROP
───────────────────────────────────────────────────── */
function initModuleReorder() {
  const form = document.getElementById('crForm');
  if (!form) return;

  // Ajouter les poignées à toutes les sections du formulaire (sauf sectionContext)
  _addHandlesToSections(form);

  // Observer les nouvelles sections ajoutées dynamiquement
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.classList?.contains('form-section') && node.id !== 'sectionContext') {
          _addHandleToSection(node);
        }
      });
    });
  });
  observer.observe(form, { childList: true, subtree: false });
}

function _addHandlesToSections(form) {
  form.querySelectorAll('section.form-section').forEach(section => {
    if (section.id === 'sectionContext') return; // contexte toujours en 1er
    _addHandleToSection(section);
  });
}

function _addHandleToSection(section) {
  // Éviter double ajout
  if (section.querySelector('.module-drag-handle')) return;

  const header = section.querySelector('.section-header');
  if (!header) return;

  // Créer la poignée
  const handle = document.createElement('span');
  handle.className = 'module-drag-handle';
  handle.title = 'Déplacer ce module';
  handle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';
  handle.setAttribute('draggable', 'false'); // La poignée seule détermine le drag

  // Insérer au début du section-header
  header.insertBefore(handle, header.firstChild);

  // Rendre la section draggable via la poignée uniquement
  section.setAttribute('draggable', 'false');

  handle.addEventListener('mousedown', () => {
    section.setAttribute('draggable', 'true');
  });
  handle.addEventListener('mouseup', () => {
    section.setAttribute('draggable', 'false');
  });

  // Events drag
  section.addEventListener('dragstart', _onDragStart);
  section.addEventListener('dragend',   _onDragEnd);
  section.addEventListener('dragover',  _onDragOver);
  section.addEventListener('dragleave', _onDragLeave);
  section.addEventListener('drop',      _onDrop);
}

/* ─────────────────────────────────────────────────────
   HANDLERS DRAG & DROP
───────────────────────────────────────────────────── */
function _onDragStart(e) {
  _reorderDragSrc = this;
  this.classList.add('module-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.id || '');

  // Créer un placeholder
  _reorderPlaceholder = document.createElement('div');
  _reorderPlaceholder.className = 'module-drop-placeholder';
  _reorderPlaceholder.style.cssText = `
    height: ${this.offsetHeight}px;
    border: 2px dashed var(--primary);
    border-radius: 12px;
    background: rgba(0,45,114,.04);
    margin: 8px 0;
    opacity: 0.8;
    transition: all .15s;
  `;
}

function _onDragEnd(e) {
  this.classList.remove('module-dragging');
  this.setAttribute('draggable', 'false');
  if (_reorderPlaceholder && _reorderPlaceholder.parentNode) {
    _reorderPlaceholder.parentNode.removeChild(_reorderPlaceholder);
  }
  _reorderPlaceholder = null;
  _reorderDragSrc     = null;

  // Nettoyer les classes sur toutes les sections
  document.querySelectorAll('.form-section').forEach(s => {
    s.classList.remove('module-drag-over');
  });
}

function _onDragOver(e) {
  if (!_reorderDragSrc || _reorderDragSrc === this) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  this.classList.add('module-drag-over');

  // Insérer le placeholder avant ou après selon la position
  const rect   = this.getBoundingClientRect();
  const midY   = rect.top + rect.height / 2;
  const before = e.clientY < midY;

  if (_reorderPlaceholder) {
    if (before) {
      this.parentNode.insertBefore(_reorderPlaceholder, this);
    } else {
      this.parentNode.insertBefore(_reorderPlaceholder, this.nextSibling);
    }
  }
}

function _onDragLeave(e) {
  this.classList.remove('module-drag-over');
}

function _onDrop(e) {
  if (!_reorderDragSrc || _reorderDragSrc === this) return;
  e.preventDefault();
  e.stopPropagation();

  this.classList.remove('module-drag-over');

  // Calculer la position
  const rect   = this.getBoundingClientRect();
  const midY   = rect.top + rect.height / 2;
  const before = e.clientY < midY;

  // Déplacer l'élément source
  if (before) {
    this.parentNode.insertBefore(_reorderDragSrc, this);
  } else {
    this.parentNode.insertBefore(_reorderDragSrc, this.nextSibling);
  }

  // S'assurer que sectionContext reste en premier
  const form    = document.getElementById('crForm');
  const context = document.getElementById('sectionContext');
  if (form && context && form.firstElementChild !== context) {
    form.insertBefore(context, form.firstElementChild);
  }

  // Notification visuelle
  _reorderDragSrc.classList.add('module-just-moved');
  setTimeout(() => _reorderDragSrc?.classList.remove('module-just-moved'), 600);

  if (typeof showToast === 'function') {
    showToast('Module déplacé.', 'success', 1200);
  }
}

/* ─────────────────────────────────────────────────────
   EXPOSE + AUTO-INIT
───────────────────────────────────────────────────── */
window.initModuleReorder   = initModuleReorder;
window._addHandleToSection = _addHandleToSection;

// Lancer après que le DOM et les templates soient prêts
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initModuleReorder, 600);
});
