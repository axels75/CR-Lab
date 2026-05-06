/* =====================================================
   WAVESTONE CR MASTER – animations.js
   Premium UI animations via Framer Motion (dynamic import)
   Falls back gracefully if Motion can't be loaded.
   ===================================================== */
'use strict';

let _animate, _spring, _stagger;
let _motionReady = false;

/* ─── Load Motion asynchronously ─── */
async function _loadMotion() {
  try {
    const m = await import('https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm');
    _animate = m.animate;
    _spring  = m.spring;
    _stagger = m.stagger;
    _motionReady = true;
    console.log('[Animations] ✅ Framer Motion loaded');
  } catch (e) {
    console.warn('[Animations] ⚠️ Motion unavailable, animations disabled:', e.message);
  }
}

/* ─── Animation functions ─── */

function animateDashboard() {
  if (!_motionReady) return;
  const cards = document.querySelectorAll('.stat-card, .project-card.pc-new, .pd-kpi-card, .pd-card');
  if (!cards.length) return;
  cards.forEach(c => { c.style.opacity = '0'; c.style.transform = 'translateY(20px)'; });
  _animate(
    cards,
    { opacity: [0, 1], y: [20, 0], scale: [0.95, 1] },
    { delay: _stagger(0.08, { startDelay: 0.1 }), duration: 0.5,
      easing: _spring({ stiffness: 300, damping: 20 }) }
  );
}

function animateSidebar() {
  if (!_motionReady) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  _animate(sidebar, { x: [-20, 0], opacity: [0, 1] }, { duration: 0.4, easing: 'ease-out' });
}

function animateTableRows() {
  if (!_motionReady) return;
  const rows = document.querySelectorAll('.cr-card, .project-item');
  if (!rows.length) return;
  rows.forEach(r => { r.style.opacity = '0'; });
  _animate(rows, { opacity: [0, 1], x: [-10, 0] },
    { delay: _stagger(0.05), duration: 0.3, easing: 'ease-out' });
}

function animateEditor() {
  if (!_motionReady) return;
  const secs = document.querySelectorAll('.form-section');
  if (!secs.length) return;
  secs.forEach(s => { s.style.opacity = '0'; });
  _animate(secs, { opacity: [0, 1], y: [15, 0] },
    { delay: _stagger(0.05), duration: 0.4, easing: 'ease-out' });
}

/* ─── Hook into showView ─── */
function _hookShowView() {
  const orig = window.showView;
  if (typeof orig !== 'function') {
    console.warn('[Animations] showView not found on window — retrying in 500ms');
    setTimeout(_hookShowView, 500);
    return;
  }
  window.showView = function(viewId) {
    orig(viewId);
    setTimeout(() => {
      if (viewId === 'viewDashboard')  animateDashboard();
      else if (viewId === 'viewList' || viewId === 'viewProjectCRs') animateTableRows();
      else if (viewId === 'viewEditor') animateEditor();
    }, 60);
  };
  console.log('[Animations] ✅ showView hook installed');
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', async () => {
  // Hook showView first (even if motion is still loading)
  _hookShowView();

  // Load motion library
  await _loadMotion();

  // Run initial animations if dashboard is already visible
  if (_motionReady) {
    setTimeout(() => {
      animateSidebar();
      animateDashboard();
    }, 200);
  }
});

/* Relance les animations après rerender des vues */
['renderDashboard', 'showProjectCRs'].forEach((fnName) => {
  const orig = window[fnName];
  if (typeof orig !== 'function') return;
  window[fnName] = async function(...args) {
    const out = await orig.apply(this, args);
    setTimeout(() => {
      if (fnName === 'renderDashboard') animateDashboard();
      if (fnName === 'showProjectCRs') animateTableRows();
    }, 80);
    return out;
  };
});
