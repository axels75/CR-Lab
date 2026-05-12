# Neumorphic Lifting — Design Spec
**Date:** 2026-05-12  
**Approche:** A — Neumorphisme total  
**Périmètre:** Zone de contenu (light) + Sidebar (dark) + Animations

---

## 0. Contexte & périmètre

### Fix export (déjà fait)
Le commit `5483684` a supprimé la ligne qui affichait `d.templateName` au-dessus du titre de réunion dans `generateEmailHTML()`. Email et PDF sont couverts (même fonction). Il reste à supprimer la variable `templateName` de la valeur de retour de `buildCRData()` (dead code).

### Lifting neumorphique
Lifting visuel de l'interface CR Master en appliquant un style neumorphique complet :
- **Zone de contenu** : light neumorphism — fond gris neutre, éléments en relief ou enfoncés
- **Sidebar** : dark neumorphism — reflets bleutés sur fond navy Wavestone
- **Animations** : transitions fluides sur les ombres + nouvelles animations d'entrée

---

## 1. Système de couleurs

### Tokens CSS à ajouter dans `css/visual-refresh.css` (section `:root`)

```css
/* Light neumorphism — zone de contenu */
--neu-base:         #E8ECF1;
--neu-shadow-dark:  rgba(163, 177, 198, 0.6);
--neu-shadow-light: rgba(255, 255, 255, 0.8);
--neu-raised:       6px 6px 16px var(--neu-shadow-dark), -6px -6px 16px var(--neu-shadow-light);
--neu-inset:        inset 4px 4px 10px var(--neu-shadow-dark), inset -4px -4px 10px var(--neu-shadow-light);
--neu-flat:         3px 3px 8px var(--neu-shadow-dark), -3px -3px 8px var(--neu-shadow-light);
--neu-transition:   box-shadow .22s var(--ease-out), transform .18s var(--ease-out);

/* Dark neumorphism — sidebar */
--neu-dark-shadow:  rgba(0, 12, 36, 0.7);
--neu-dark-light:   rgba(0, 55, 120, 0.4);
--neu-dark-raised:  4px 4px 12px var(--neu-dark-shadow), -4px -4px 12px var(--neu-dark-light);
--neu-dark-inset:   inset 3px 3px 8px var(--neu-dark-shadow), inset -3px -3px 8px var(--neu-dark-light);
```

**Couleurs Wavestone inchangées :** `--primary: #002D72`, `--accent: #E8007D`

---

## 2. Zone de contenu (light neumorphism)

Fichier cible : `css/visual-refresh.css`

| Élément | Changements |
|---|---|
| `body` | `background: var(--neu-base)` |
| `.content-area` | `background: var(--neu-base)` |
| `.form-section` | `background: var(--neu-base)`, `border: none`, `box-shadow: var(--neu-raised)`, `border-radius: 16px` |
| `.section-header` | `background: transparent`, `border-bottom: none` |
| `.section-icon` | `background: var(--neu-base)`, `color: var(--primary)`, `box-shadow: var(--neu-raised)` |
| Inputs / Quill | `background: var(--neu-base)`, `box-shadow: var(--neu-inset)`, `border: none`, `border-radius: 10px` |
| `.export-bar` | `background: var(--neu-base)`, `box-shadow: var(--neu-raised)`, `border: none` |
| `.modal` | `background: var(--neu-base)`, `box-shadow: var(--neu-raised), 0 25px 50px rgba(0,0,0,.15)`, `border: none` |

Tous ces éléments reçoivent `transition: var(--neu-transition)`.

---

## 3. Sidebar (dark neumorphism)

Fichier cible : `css/visual-refresh.css`

| Élément | Changements |
|---|---|
| `.sidebar` | `box-shadow: var(--neu-dark-raised), 4px 0 20px rgba(0,0,0,.3)`, `border-right: none` |
| `.sidebar-header` | `background: rgba(0,0,0,.2)`, `box-shadow: var(--neu-dark-inset)`, `border-bottom: none` |
| `.btn-new-cr` | `box-shadow: var(--neu-dark-raised)`, hover `translateY(-1px)` + shadow amplifiée, active → `var(--neu-dark-inset)` |
| `.cr-item:hover`, `.project-header:hover` | `box-shadow: var(--neu-dark-raised)`, `border-radius: 8px`, `background: transparent` |
| `.cr-item.active`, `.project-header.active` | `box-shadow: var(--neu-dark-inset)`, `border-radius: 8px`, `background: transparent` |
| Input recherche sidebar | `background: transparent`, `box-shadow: var(--neu-dark-inset)`, `border: none` |

---

## 4. Animations

### CSS (`css/visual-refresh.css`)
```css
@keyframes neu-pulse {
  0%, 100% { box-shadow: var(--neu-raised); }
  50%       { box-shadow: 8px 8px 20px var(--neu-shadow-dark), -8px -8px 20px var(--neu-shadow-light); }
}
.btn-new-cr:focus-visible { animation: neu-pulse 1.4s ease-in-out infinite; }
```

### JS (`js/animations.js`)

**`animateFormSections()`** — sections entrent en cascade avec spring
```js
function animateFormSections() {
  if (!_motionReady) return;
  try {
    const sections = document.querySelectorAll('.form-section');
    if (!sections.length) return;
    sections.forEach(s => { s.style.opacity = '1'; s.style.transform = 'none'; });
    _animate(sections,
      { opacity: [0, 1], y: [20, 0], scale: [0.98, 1] },
      { delay: _stagger(0.07), duration: 0.5,
        easing: _spring({ stiffness: 280, damping: 22 }) }
    );
  } catch (e) {
    console.debug('[Animations] sections skipped:', e.message);
  }
}
```

**`animateExportBar()`** — barre glisse depuis le bas
```js
function animateExportBar() {
  if (!_motionReady) return;
  try {
    const bar = document.querySelector('.export-bar');
    if (!bar) return;
    _animate(bar, { opacity: [0, 1], y: [12, 0] }, { duration: 0.35, easing: 'ease-out' });
  } catch (e) {
    console.debug('[Animations] export-bar skipped:', e.message);
  }
}
```

Ces deux fonctions sont appelées dans `animateEditor()` (déjà appelée à l'ouverture du formulaire CR).

---

## 5. Nettoyage export

Dans `js/export.js`, fonction `buildCRData()` :
- Supprimer `templateName` de la valeur de retour (ligne 200) — plus utilisé nulle part.
- Supprimer `const templateName = ...` (ligne 50) — dead code.

---

## 6. Dark mode

Les overrides dark mode dans `visual-refresh.css` doivent être mis à jour pour ne pas écraser les nouvelles valeurs neumorphiques. Les surfaces dark mode gardent leurs propres couleurs mais héritent du `--neu-transition`.

---

## Fichiers touchés

| Fichier | Nature des changements |
|---|---|
| `css/visual-refresh.css` | Tokens + overrides neumorphiques (light + dark sidebar) |
| `js/animations.js` | 2 nouvelles fonctions + appels |
| `js/export.js` | Suppression dead code `templateName` |
