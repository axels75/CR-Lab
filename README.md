# CR Master — Wavestone

Application web de gestion de comptes-rendus de réunion (Single Page App statique).

---

## Fonctionnalités complétées

### 🔐 Authentification & Sécurité
- Login / inscription (mot de passe SHA-256, session persistante)
- Récupération de mot de passe (question de sécurité hashée) — flux 4 étapes
- **Google Authenticator & Microsoft Authenticator obligatoires** : à la connexion et à la création de compte, un setup MFA est forcé (QR Code, code TOTP, fenêtre de setup dédiée)
- 2FA TOTP client-side avec fenêtre de saisie du code à chaque login
- **Bug Cloudflare TOTP corrigé** : counter TOTP encodé en BigInt 64-bit (évite overflow 32-bit) — `mfa.js v6`
- Tolérance étendue ±8 périodes (±4 min) pour couvrir les dérives d'horloge Cloudflare
- Secret TOTP persisté en `sessionStorage` (anti-race-condition lors du setup)
- Panel de réinitialisation 2FA self-service (identifiant + mot de passe requis)
- Countdown SVG circulaire (vert → orange → rouge) en temps réel sur écrans MFA

### 🎨 Interface de connexion — Redesign v2
- **Layout split-screen** : branding Wavestone gauche + formulaire droite
- Colonne gauche : logo, titre animé, liste de fonctionnalités, fond orbes animés
- Colonne droite : carte glassmorphism, onglets, badge 2FA avec chips Google/Microsoft/Authy
- Formulaire de connexion et d'inscription refondus (classes `auth-*`)
- Mot de passe oublié : flux 4 étapes avec animations CSS (`auth-step`)
- **Écran MFA vérification** : card centrée full-screen, badge utilisateur, pills apps, input grand format, countdown
- **Écran MFA setup** : card large, 3 étapes (apps → QR → code), grille apps avec liens store
- CSS isolé dans `css/login.css` (chargé après style.css pour priorité correcte)
- **Icônes corrigées** : remplacement de `fa-shield-check` (FA Pro uniquement) par `fa-shield-halved` (FA Free) dans tout le projet
- **Triangle blanc corrigé** : suppression du `::after` triangle sur le header de carte — "Comptes-rendus professionnels" lisible

### 📱 Responsive (mobile & tablette)
- **Nouveau fichier `css/responsive.css`** : règles responsive complètes pour tous les composants
- Login : bandeau horizontal compact sur mobile (logo + titre sur une ligne), formulaire pleine largeur
- Sidebar : overlay foncé sur mobile, collapsed par défaut à la connexion
- Dashboard : grid adaptatif (1 colonne sur mobile)
- Modals : pleine largeur, footer en colonne sur mobile
- Topbar : boutons compactés, labels masqués
- Formulaires CR : grilles en colonne unique sur mobile
- Setup 2FA : steps empilés sur mobile

### 🏠 Tableau de bord
- Cartes de projet avec **logo client chargé dynamiquement** :
  - Champ "Société / Client" dans la création de projet
  - Autocomplétion avec 50+ entreprises connues
  - Recherche dynamique via Clearbit Logo API + Google Favicon (sz=128)
  - Fallback : initiales colorées si aucun logo trouvé
  - Logo sauvegardé en BDD (`logo_url`) et rechargé à l'affichage
  - Chargement automatique des logos manquants au rendu du dashboard
- Barre de progression (ratio CRs finaux / total)
- Badges statuts (final / brouillon)
- Actions hover (+ nouveau CR, 🗑 supprimer)
- Badge "Partagé" pour projets co-édition

### 📋 Gestion des projets & CRs
- Création / suppression de projets (avec société, couleur, description)
- Création / édition / duplication / suppression de CRs
- Statuts : Brouillon / Final / Archivé
- Sauvegarde de tous les modules actifs (décisions, risques, budget, prochaines étapes)

### 📝 Formulaire CR
- Tous les champs texte libre utilisent **Quill WYSIWYG** (gras, listes, titres, liens, couleurs)
- Sections optionnelles avec éditeur Quill : Décisions, Risques, Budget, Prochaines étapes
- Sections personnalisées de template avec Quill intégré

### 🧩 Templates personnalisés
- 5 templates par défaut (Standard, COPIL, Atelier, Rapide, Projet)
- Éditeur drag & drop de modules
- **Créer un module from scratch** avec le panneau Custom Module Editor :
  - Blocs : Texte libre, Tableau (headers éditables), Checklist, 2 colonnes, KPI, Séparateur
  - Icônes (28 options), couleur personnalisée
  - Les modules custom s'affichent avec un éditeur Quill dans le formulaire CR
- Sections custom des templates : éditeurs Quill intégrés

### 📤 Export (corrigé pour tous les templates)
- **Email** : export HTML inline-styles (Outlook-safe), avec toutes les sections actives
- **PDF** : fenêtre impression A4, avec toutes les sections actives
- **Word (.docx)** : via docx.js, avec toutes les sections actives (décisions, risques, budget, prochaines étapes, sections custom)
- Les sections exportées dépendent du template appliqué au CR

### 👥 Collaboration
- Invitations par ID / email
- Rôles : Propriétaire / Éditeur / Lecteur
- Accepter / refuser les invitations
- Badge d'invitation en attente
- **Lien d'invitation rapide** : lien partageable, révocable
- **Co-édition temps réel** : polling D1 toutes les 3s, bannière de mise à jour non intrusive

### 🎨 Templates par projet *(nouveau)*
- Chaque projet peut avoir ses propres couleurs, police, logo et taille de police
- La modale Paramètres affiche un bandeau contextuel (projet actif ou global)
- Les settings sont stockés en D1 (champ `template_settings` JSON + `template_logo` base64)
- Reset possible : revient aux settings globaux pour le projet
- Navigation entre projets : les couleurs/logo s'appliquent automatiquement

### ⚙️ Paramètres — Contraste adaptatif *(amélioré)*
- Couleur primaire / accent personnalisables
- **Lisibilité automatique garantie** : algorithme WCAG 2.1 qui calcule la luminance de `--primary-dark` et choisit texte sombre ou clair en conséquence
- Variables CSS dynamiques pour toute la sidebar : `--sidebar-fg`, `--sidebar-fg-muted`, `--sidebar-hover-bg`, etc.
- Bouton "Nouveau CR" : contraste ajusté si l'accent ne se détache pas assez sur le fond
- Logo adapté automatiquement (inversion si fond clair, mode normal si fond sombre)
- Avatar utilisateur : couleur de texte calculée dynamiquement selon la couleur de l'avatar
- Badge invitations : utilise `var(--accent)` / `var(--accent-fg)` pour rester lisible

### 🌐 Internationalisation *(passe complète)*
- Basculement FR / EN temps réel
- **Toutes les chaînes dynamiques JS traduites** : collaboration.js, app.js, settings.js
- Clés ajoutées : collaboration, lien d'invitation, co-édition temps réel, profil utilisateur
- HTML statique : data-i18n, data-i18n-placeholder, data-i18n-title sur tous les éléments
- Modal "Rejoindre par lien" entièrement traduit

---

## Structure de fichiers

```
index.html              SPA principale
css/
  style.css             Styles complets + variables dynamiques sidebar
js/
  app.js                Logique principale, dashboard, projets, CRs, Quill
  auth.js               Authentification (login / register / session)
  mfa.js                Google Authenticator TOTP (setup obligatoire)
  i18n.js               Traductions FR / EN (clés enrichies)
  templates.js          Bibliothèque templates, éditeur modules custom
  export.js             Export Email / PDF / Word (tous modules)
  import.js             Import .txt / .eml / .docx
  project-dashboard.js  Vue dashboard projet
  agenda.js             Agenda / planning
  collaboration.js      Co-édition, invitations, membres, realtime sync
  settings.js           Paramètres visuels, contraste WCAG adaptatif
  dark-mode.js          Mode sombre
images/
  wavestone-logo.png    Logo par défaut
```

## Architecture API & Déploiement Cloudflare

### Pourquoi Cloudflare D1 ?

L'API Genspark (`/api/projects/{id}/tables`) est **privée** et requiert un cookie de session.
Même depuis un Cloudflare Worker serveur, Genspark retourne 403.
La solution pérenne et multi-appareils est **Cloudflare D1** (SQLite gratuit, intégré à Cloudflare Pages).

### Architecture finale

```
Navigateur (PC, téléphone, tablette)
    ↓ fetch('api/tables/projects')       ← URL relative, pas de CORS
Cloudflare Pages Function
    functions/api/tables/[[path]].js     ← backend REST complet (GET/POST/PUT/PATCH/DELETE)
    ↓ env.DB.prepare(...)                ← requête SQL
Cloudflare D1 (SQLite)
    Base "cr-master-db"                  ← données partagées entre tous les appareils
```

### Configuration requise (une seule fois)

**1. Créer la base D1** dans Cloudflare Dashboard :
- Workers & Pages → D1 SQL Database → Create database
- Nom : `cr-master-db`

**2. Lier D1 au projet Pages** :
- Workers & Pages → `cr-master` → Settings → Functions
- D1 database bindings → Add binding
- Variable name : `DB` | Database : `cr-master-db`
- Save → Redéployer

**3. Vérifier** : ouvrir `https://votre-domaine.pages.dev/migrate.html`

### Fichiers clés

| Fichier | Rôle |
|---------|------|
| `functions/api/tables/[[path]].js` | Backend D1 REST (GET/POST/PUT/PATCH/DELETE) |
| `functions/api/ping.js` | Test que les Functions sont actives |
| `migrate.html` | Migration des données Genspark → D1 + diagnostic |
| `_redirects` | Routing SPA (Functions ont priorité) |

### Multi-appareils

Les données sont dans Cloudflare D1 (partagé). Même compte sur PC, téléphone, tablette. ✅

---



| Route | Description |
|-------|-------------|
| `/`   | Écran login → 2FA setup ou code → App |
| `/index.html` | Identique |

---

## Modèles de données (tables API)

| Table | Champs clés |
|-------|------------|
| `projects` | `user_id`, `name`, `company`, `logo_url`, `color`, `description` |
| `meeting_reports` | `user_id`, `project_id`, `mission_name`, `participants`, `actions`, `key_points_html`, `decisions_html`, `risks_html`, `budget_html`, `next_steps_html`, `template_id`, `template_modules`, `status` |
| `cr_templates` | `user_id`, `name`, `modules` (JSON), `modules_config` (JSON) |
| `user_profiles` | `user_id`, `username`, `mfa_enabled`, `mfa_secret` |
| `participant_profiles` | `user_id`, `name`, `role`, `company`, `photo` |
| `project_members` | `project_id`, `member_user_id`, `role`, `status` |

---

## Non implémenté / Pistes suivantes

- [ ] Notifications email (EmailJS) pour les invitations
- [ ] Export Outlook (.ics) global depuis l'agenda
- [ ] Recherche full-text inter-projets
- [ ] Vue Gantt / timeline des actions
- [ ] Archivage automatique des projets inactifs
- [ ] Import / export JSON complet (backup)
- [ ] Choix du type de champ (tableau, graphique, planning) pour les modules prédéfinis (Participants, Actions…)

---

## Sécurité

- Mots de passe et réponses sécurité : SHA-256 (client-side)
- Sessions : sessionStorage (effacé à la fermeture du tab)
- 2FA TOTP obligatoire (Google Authenticator), clé Base32 générée côté client
- KNOWN_DOMAINS : table de correspondance locale pour les domaines de logos

---

*Dernière mise à jour : 2026-03-02*
