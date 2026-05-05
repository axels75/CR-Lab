const { animate, spring, stagger, inView } = window.Motion;

/**
 * Initialisation des animations via Framer Motion (Motion One vanilla)
 * Cela ajoute une touche "premium" à l'interface de CR Master.
 */

// Animation du dashboard : apparition en cascade des cartes
function animateDashboard() {
  const cards = document.querySelectorAll('.dashboard-stat-card, .dashboard-widget');
  if (cards.length > 0) {
    // Reset opacité
    cards.forEach(c => c.style.opacity = '0');
    
    animate(
      cards,
      { opacity: [0, 1], y: [20, 0], scale: [0.95, 1] },
      { 
        delay: stagger(0.08, { startDelay: 0.1 }), 
        duration: 0.5,
        easing: spring({ stiffness: 300, damping: 20 })
      }
    );
  }
}

// Animation de la sidebar : glissement
function animateSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    animate(
      sidebar,
      { x: [-20, 0], opacity: [0, 1] },
      { duration: 0.4, easing: "ease-out" }
    );
  }
}

// Animation des lignes du tableau (CRs)
function animateTableRows() {
  const rows = document.querySelectorAll('.cr-list-table tbody tr');
  if (rows.length > 0) {
    rows.forEach(r => r.style.opacity = '0');
    animate(
      rows,
      { opacity: [0, 1], x: [-10, 0] },
      { delay: stagger(0.05), duration: 0.3, easing: "ease-out" }
    );
  }
}

// Attacher un Observer sur le changement de vue (viewDashboard, viewList, etc.)
// via une mutation observer sur appRoot ou simplement s'injecter dans showView
document.addEventListener('DOMContentLoaded', () => {
  // Animation initiale
  setTimeout(() => {
    animateSidebar();
    animateDashboard();
  }, 100);

  // Hook dans la fonction globale showView de app.js
  const originalShowView = window.showView;
  if (typeof originalShowView === 'function') {
    window.showView = function(viewId) {
      originalShowView(viewId);
      
      // Lancer les animations en fonction de la vue
      setTimeout(() => {
        if (viewId === 'viewDashboard') {
          animateDashboard();
        } else if (viewId === 'viewList') {
          animateTableRows();
        } else if (viewId === 'viewEditor') {
          const formSecs = document.querySelectorAll('.form-section');
          formSecs.forEach(s => s.style.opacity = '0');
          animate(
            formSecs,
            { opacity: [0, 1], y: [15, 0] },
            { delay: stagger(0.05), duration: 0.4, easing: "ease-out" }
          );
        }
      }, 50);
    };
  }
});
