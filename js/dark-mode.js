/* =====================================================
   WAVESTONE CR MASTER – dark-mode.js
   Gestion du mode sombre/clair
   ===================================================== */

const DARK_KEY = 'wv_dark_mode';

function initDarkMode() {
  const saved = localStorage.getItem(DARK_KEY);
  if (saved === 'true') applyDark(true, false);
}

function toggleDarkMode() {
  const isDark = document.documentElement.classList.contains('dark-mode');
  applyDark(!isDark, true);
}

function applyDark(enable, save) {
  const html = document.documentElement;
  const icon  = document.getElementById('darkModeIcon');
  const label = document.getElementById('darkModeLabel');

  if (enable) {
    html.classList.add('dark-mode');
    if (icon)  { icon.className  = 'fa-solid fa-sun'; }
    if (label) { label.textContent = 'Mode clair'; }
  } else {
    html.classList.remove('dark-mode');
    if (icon)  { icon.className  = 'fa-solid fa-moon'; }
    if (label) { label.textContent = 'Mode sombre'; }
  }
  if (save) localStorage.setItem(DARK_KEY, enable ? 'true' : 'false');
}

/* Photo participant preview */
function previewParticipantPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const src     = e.target.result;
    const preview = document.getElementById('ppPhotoPreview');
    const noImg   = document.getElementById('ppPhotoNoImg');
    if (preview) {
      preview.src = src;
      preview.style.display = 'block';
    }
    if (noImg) noImg.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/* Ajouter une ligne participant depuis le dashboard */
/* Ajouter un participant depuis le dashboard projet dans l'éditeur CR ouvert */
function addParticipantFromDashboard(name, role, company) {
  // Utilise la fonction native d'app.js
  const container = document.getElementById('participantsList');
  if (!container) return;
  if (typeof addParticipantRow === 'function') {
    addParticipantRow(container, { name, role, company });
  }
}

function _dmEscHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Init au chargement
document.addEventListener('DOMContentLoaded', initDarkMode);

window.toggleDarkMode           = toggleDarkMode;
window.previewParticipantPhoto  = previewParticipantPhoto;
window.addParticipantFromDashboard = addParticipantFromDashboard;
