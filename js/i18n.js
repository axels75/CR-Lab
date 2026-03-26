/* =====================================================
   WAVESTONE CR MASTER – i18n.js
   Internationalisation FR / EN
   ─────────────────────────────────────────────────────
   Usage : window.t('key') → chaîne traduite selon la locale active
   Langue persistée dans localStorage 'wv_lang' (fr | en)
   ===================================================== */

'use strict';

/* ─────────────────────────────────────────────────────
   DICTIONNAIRES
───────────────────────────────────────────────────── */
const TRANSLATIONS = {

  /* ══════════════════════════════════════════════════
     FRANÇAIS (référence)
  ══════════════════════════════════════════════════ */
  fr: {
    // ── App générale ────────────────────────────────
    app_name:           'CR Master',
    app_subtitle:       'Comptes-rendus professionnels',

    // ── Auth ────────────────────────────────────────
    login_title:        'Se connecter',
    register_title:     'Créer un compte',
    username:           'Identifiant',
    password:           'Mot de passe',
    confirm_password:   'Confirmer le mot de passe',
    first_name:         'Prénom',
    last_name:          'Nom',
    login_btn:          'Se connecter',
    register_btn:       'Créer mon compte',
    forgot_password:    'Mot de passe oublié ?',
    no_account:         'Pas encore de compte ?',
    have_account:       'Déjà un compte ?',
    login_error_wrong:  'Identifiant ou mot de passe incorrect.',
    login_error_fields: 'Identifiant et mot de passe obligatoires.',
    register_error_min3:'L\'identifiant doit contenir au moins 3 caractères.',
    register_error_min6:'Le mot de passe doit contenir au moins 6 caractères.',
    register_error_match:'Les mots de passe ne correspondent pas.',
    register_error_question:'Veuillez choisir une question de sécurité.',
    register_error_answer:'Veuillez répondre à la question de sécurité.',
    security_question:  'Question de sécurité',
    security_answer:    'Votre réponse',
    connecting:         'Connexion…',
    creating:           'Création…',

    // ── MFA ─────────────────────────────────────────
    mfa_screen_title:   'Vérification en deux étapes',
    mfa_screen_subtitle:'Saisissez le code affiché dans votre application d\'authentification.',
    mfa_code_label:     'Code à 6 chiffres',
    mfa_code_placeholder:'000000',
    mfa_verify_btn:     'Vérifier',
    mfa_cancel:         'Utiliser un autre compte',
    mfa_code_invalid:   'Code à 6 chiffres requis.',
    mfa_code_wrong:     'Code incorrect. Vérifiez l\'heure de votre appareil.',
    mfa_enabled_toast:  '2FA activé ! Votre compte est maintenant sécurisé.',
    mfa_disabled_toast: '2FA désactivé.',
    mfa_disable_prompt: 'Saisissez votre code Google Authenticator pour désactiver la 2FA :',
    mfa_setup_title:    'Activer la double authentification',
    mfa_setup_step1:    '1. Installez Google Authenticator ou Authy',
    mfa_setup_step2:    '2. Scannez ce QR code',
    mfa_setup_step3:    '3. Saisissez le code affiché',
    mfa_manual_entry:   'Entrée manuelle',
    mfa_copy_secret:    'Copier le secret',
    mfa_section_title:  'Double authentification (2FA)',
    mfa_active_label:   'Authentification à deux facteurs activée',
    mfa_inactive_label: 'Authentification à deux facteurs désactivée',
    mfa_active_sub:     'Votre compte est protégé par Google Authenticator.',
    mfa_inactive_sub:   'Activez la 2FA pour renforcer la sécurité de votre compte.',
    mfa_enable_btn:     'Activer',
    mfa_disable_btn:    'Désactiver',
    mfa_mandatory_label:        'Obligatoire — ne peut pas être désactivée',
    mfa_mandatory_no_disable:   'La double authentification est obligatoire et ne peut pas être désactivée.',
    mfa_mandatory_login_ctx:    "Pour accéder à l'application, vous devez configurer Google Authenticator.",
    mfa_mandatory_register_ctx: "Votre compte a été créé. Configurez maintenant Google Authenticator pour accéder à l'application.",
    mfa_activate_access:        "Activer et accéder à l'application",
    mfa_mandatory_banner_title: 'Double authentification obligatoire',
    mfa_mandatory_footer:       'La 2FA protège votre compte et les données sensibles de vos projets. Une fois activée, elle vous sera demandée à chaque connexion.',
    mfa_cancel_and_logout:      'Annuler et se déconnecter',

    // ── Navigation / Sidebar ─────────────────────────
    new_cr:             'Nouveau CR',
    agenda:             'Agenda / Planning',
    my_space:           'Mon Espace',
    search_cr:          'Rechercher un CR…',
    my_projects:        'MES PROJETS',
    shared_with_me:     'PARTAGÉS AVEC ME',
    no_project:         'Aucun projet — créez-en un !',
    new_project:        'Nouveau projet',
    invitations:        'Invitations reçues',
    settings_template:  'Paramètres du template',
    dark_mode:          'Mode sombre',

    // ── Dashboard ────────────────────────────────────
    dashboard_title:    'Tableau de bord',
    projects:           'Projets',
    total_crs:          'CRs totaux',
    finalized:          'Finalisés',
    drafts:             'Brouillons',
    recent_activity:    'Activité récente',
    no_recent:          'Aucun CR récent.',
    quick_actions:      'Actions rapides',

    // ── Projet ───────────────────────────────────────
    project_name:       'Nom du projet',
    project_desc:       'Description',
    project_color:      'Couleur du projet',
    create_project:     'Créer le projet',
    delete_project:     'Supprimer le projet',
    confirm_delete_project: 'Supprimer ce projet supprimera aussi tous ses CRs. Cette action est irréversible.',
    project_crs:        'comptes-rendus',
    list_crs:           'Liste des CRs',
    collaborators:      'Collaborateurs',
    leave_project:      'Quitter',

    // ── CR Form ──────────────────────────────────────
    cr_context:         'Contexte de la réunion',
    mission_name:       'Nom de la mission',
    meeting_name:       'Nom de la réunion',
    date:               'Date',
    location:           'Lieu / Modalité',
    facilitator:        'Animateur',
    author:             'Rédacteur du CR',
    status:             'Statut',
    draft:              'Brouillon',
    final:              'Final',
    archived:           'Archivé',
    participants:       'Participants',
    add_participant:    'Ajouter un participant',
    participant_name:   'Nom',
    participant_role:   'Rôle',
    participant_company:'Société',
    action_tracking:    'Suivi des actions',
    action:             'Action',
    owner:              'Porteur',
    due_date:           'Échéance',
    todo:               'À faire',
    in_progress:        'En cours',
    done:               'Terminé',
    blocked:            'Bloqué',
    add_action:         'Ajouter une action',
    key_points:         'Points structurants',
    key_points_placeholder: 'Rédigez les points clés de la réunion…',
    keywords:           'Mots-clés',
    keywords_placeholder:'séparé par virgule…',
    save_draft:         'Enregistrer brouillon',
    save_final:         'Enregistrer final',
    export_email:       'Export email',
    export_pdf:         'Export PDF',
    export_word:        'Export Word',
    cr_saved:           'CR enregistré.',
    cr_deleted:         'CR supprimé.',
    duplicate:          'Dupliquer',
    no_cr:              'Aucun CR',
    no_mission_warning: 'Renseignez au moins la mission et le nom de la réunion.',
    choose_template:    'Choisir un template',
    template_library:   'Bibliothèque de templates',
    my_templates:       'Mes templates',
    default_templates:  'Templates par défaut',
    create_template:    'Créer un template',
    edit_template:      'Modifier le template',
    template_name:      'Nom du template',
    template_desc:      'Description',
    save_template:      'Enregistrer le template',
    use_template:       'Utiliser ce template',
    preview_template:   'Aperçu',
    delete_template:    'Supprimer',
    template_saved:     'Template enregistré.',
    template_deleted:   'Template supprimé.',
    template_modules:   'Modules disponibles',
    add_module:         'Ajouter ce module',
    remove_module:      'Retirer',
    module_context:     'Contexte',
    module_participants:'Participants',
    module_actions:     'Suivi des actions',
    module_key_points:  'Points structurants',
    module_decisions:   'Décisions',
    module_risks:       'Risques',
    module_budget:      'Budget',
    module_next_steps:  'Prochaines étapes',
    module_custom:      'Section personnalisée',

    // ── Tableau de bord projet ───────────────────────
    project_dashboard:  'Tableau de bord',
    kpi_total_crs:      'CRs totaux',
    kpi_finalized:      'Finalisés',
    kpi_drafts:         'Brouillons',
    kpi_total_actions:  'Actions totales',
    kpi_completion:     'Taux de complétion',
    kpi_overdue:        'Actions en retard',
    kpi_participants:   'Participants uniques',
    kpi_last_meeting:   'Dernière réunion',
    project_team:       'Équipe Projet',
    collab_section:     'Collaborateurs du projet',
    action_tracking_full:'Suivi des actions consolidées',
    deadlines:          'Suivi des échéances',
    overdue:            'En retard',
    this_week:          'Cette semaine',
    this_month:         'Ce mois',
    future:             'Futur',
    all_actions:        'Toutes',
    no_participants:    'Aucun participant dans les CRs de ce projet.',
    no_actions:         'Aucune action.',
    remove_participant: 'Retirer ce participant de tous les CRs du projet',

    // ── Agenda ───────────────────────────────────────
    agenda_title:       'Agenda / Planning',
    all_projects:       'Tous les projets',
    group_by:           'Grouper par',
    by_project:         'Par projet',
    by_date:            'Par date',
    by_status:          'Par statut',
    export_ics:         'Export Outlook',
    no_tasks:           'Aucune tâche.',

    // ── Mon Espace ───────────────────────────────────
    my_space_title:     'Mon Espace',
    personal_info:      'Informations personnelles',
    job_title:          'Poste / Titre',
    organization:       'Organisation',
    email:              'Email professionnel',
    phone:              'Téléphone',
    avatar_color:       'Couleur de l\'avatar',
    save_profile:       'Enregistrer le profil',
    profile_saved:      'Profil enregistré.',
    password_recovery:  'Récupération de mot de passe',
    pending_invitations:'Invitations reçues',
    no_invitations:     'Aucune invitation en attente.',
    accept:             'Accepter',
    decline:            'Décliner',
    logout:             'Déconnexion',
    user_id_label:      'ID :',

    // ── Collaboration ────────────────────────────────
    invite_member:      'Inviter un collaborateur',
    invite_hint:        'Saisissez l\'identifiant ou l\'email du collaborateur.',
    invite_placeholder: 'identifiant ou email…',
    invite_btn:         'Inviter',
    role_editor:        'Éditeur',
    role_viewer:        'Lecteur',
    role_owner:         'Propriétaire',
    status_pending:     'En attente',
    status_accepted:    'Accepté',
    status_declined:    'Refusé',
    remove_member:      'Retirer ce membre',
    leave_this_project: 'Quitter ce projet',
    members:            'Membres du projet',
    no_members:         'Aucun collaborateur pour l\'instant.',
    invitation_sent:    'Invitation envoyée à',
    shared_badge:       'Partagé',

    // ── Paramètres ───────────────────────────────────
    settings_title:     'Paramètres du template',
    primary_color:      'Couleur principale',
    accent_color:       'Couleur accent',
    font:               'Police',
    font_size:          'Taille de police',
    org_name:           'Nom de l\'organisation',
    logo:               'Logo',
    upload_logo:        'Uploader un logo',
    reset_logo:         'Réinitialiser',
    save_settings:      'Sauvegarder',
    settings_saved:     'Paramètres enregistrés.',

    // ── Import ───────────────────────────────────────
    import_title:       'Importez un document pour pré-remplir le CR',
    import_sub:         'Glissez un .txt, .eml ou .docx ici, ou collez du texte brut',
    choose_file:        'Choisir un fichier',
    paste_text:         'Coller du texte',

    // ── Génériques ───────────────────────────────────
    cancel:             'Annuler',
    confirm:            'Confirmer',
    save:               'Enregistrer',
    delete:             'Supprimer',
    close:              'Fermer',
    edit:               'Modifier',
    back:               'Retour',
    loading:            'Chargement…',
    error_retry:        'Erreur. Réessayez.',
    copied:             'Copié !',
    verifying:          'Vérification…',
    verify:             'Vérifier',
    success:            'Succès',
    warning:            'Attention',
    yes:                'Oui',
    no:                 'Non',

    // ── Clés supplémentaires ─────────────────────────
    login_info:         'Vos données sont protégées par votre mot de passe. Chaque compte accède uniquement à ses propres CRs.',
    dashboard_welcome:  'Bienvenue sur <span>Wavestone CR Master</span>',
    dashboard_sub:      'Rédigez, archivez et exportez vos comptes-rendus de réunion en quelques clics.',
    agenda_sub:         'Toutes vos to-do de tous les projets',
    tasks_list:         'Liste des tâches',
    today:              'Aujourd\'hui',
    save_cr:            'Enregistrer le CR',
    export_cr:          'Exporter ce CR :',
    reset:              'Réinitialiser',
    role_editor_desc:   'Peut créer, modifier et supprimer les CRs du projet',
    role_viewer_desc:   'Peut uniquement consulter les CRs du projet',
    meeting_name:       'Réunion',
    menu:               'Menu',

    // ── Écran de connexion (branding) ────────────────
    auth_brand_desc:    'La plateforme professionnelle de gestion de comptes-rendus pour les équipes Wavestone.',
    auth_feature_mfa:   'Double authentification obligatoire',
    auth_feature_collab:'Travail collaboratif en temps réel',
    auth_feature_export:'Comptes-rendus structurés et exportables',
    auth_feature_agenda:'Agenda et planning intégrés',
    auth_card_sub:      'Comptes-rendus professionnels',
    auth_footer:        '© 2026 Wavestone — Confidentiel',
    lang_switch_en:     'Switch to English',
    lang_switch_fr:     'Passer en français',

    // ── Toasts / messages dynamiques ────────────────
    profile_required:       'Veuillez renseigner au moins votre prénom ou nom.',
    profile_updated:        'Profil mis à jour !',
    profile_save_error:     'Erreur lors de la sauvegarde du profil.',
    cr_save_error:          'Erreur lors de l\'enregistrement.',
    cr_delete_error:        'Erreur lors de la suppression.',
    cr_duplicated:          'CR dupliqué :',
    cr_dup_error:           'Erreur lors de la duplication.',
    project_deleted:        'Projet supprimé.',
    project_delete_error:   'Erreur lors de la suppression du projet.',
    project_name_required:  'Veuillez saisir un nom de projet.',
    project_created:        'Projet créé !',
    mission_required:       'Veuillez renseigner la mission et le nom de la réunion.',
    logo_image_required:    'Veuillez sélectionner une image.',
    logo_project_pending:   'Logo projet prêt — cliquez Appliquer pour enregistrer.',
    logo_global_updated:    'Logo global mis à jour !',
    template_project_saved: 'Template du projet enregistré !',
    template_save_error:    'Erreur lors de la sauvegarde du template.',
    settings_global_applied:'Paramètres globaux appliqués !',
    settings_global_reset:  'Paramètres globaux réinitialisés.',
    template_project_reset: 'Template du projet réinitialisé.',
    template_reset_error:   'Erreur lors de la réinitialisation.',
    invite_owner_only:      'Seul le propriétaire ou un éditeur peut inviter des membres.',
    invitation_sent_to:     'Invitation envoyée à',
    role_updated:           'Rôle mis à jour.',
    role_update_error:      'Erreur lors de la mise à jour du rôle.',
    member_removed:         'a été retiré du projet.',
    member_remove_error:    'Erreur lors de la suppression.',
    membership_not_found:   'Membership introuvable.',
    project_left:           'Vous avez quitté',
    project_leave_error:    'Erreur lors de la sortie du projet.',
    invitation_accepted:    'Invitation acceptée ! Le projet est maintenant disponible.',
    invitation_accept_error:'Erreur lors de l\'acceptation. Réessayez.',
    invitation_declined:    'Invitation déclinée.',
    invitation_decline_error:'Erreur lors du refus. Réessayez.',
    participant_saved:      'Profil participant enregistré !',
    participant_save_error: 'Erreur lors de l\'enregistrement.',
    participant_added:      'ajouté(e) aux participants.',
    open_cr_first:          'Ouvrez d\'abord un CR pour ajouter',
    cr_not_found:           'CR introuvable.',
    action_not_found:       'Action introuvable.',
    status_updated:         'Statut mis à jour :',
    status_update_error:    'Erreur lors de la mise à jour du statut.',
    owner_only_remove_part: 'Seul le propriétaire ou un éditeur peut retirer des participants.',
    part_remove_error:      'Erreur lors de la suppression. Réessayez.',
    no_task_selected:       'Aucune tâche sélectionnée.',
    tasks_exported:         'tâche(s) exportée(s) en .ics !',
    import_paste_first:     'Veuillez coller du texte avant d\'analyser.',
    import_unsupported:     'Format non supporté. Utilisez .txt, .eml ou .docx',
    import_auto_fail:       'Import automatique impossible — utilisez "Coller du texte".',
    export_fill_mission:    'Renseignez au moins la mission et le nom de la réunion.',
    export_email_ok:        '✅ Contenu mis en forme copié ! Collez directement dans Outlook / Gmail.',
    export_email_ok2:       '✅ Contenu mis en forme copié ! Collez dans votre client mail.',
    export_html_copied:     '⚠️ Code HTML source copié. Collez dans Outlook > Insérer > HTML ou via un outil intermédiaire.',
    export_html_fallback:   '⚠️ HTML source copié (mode dégradé).',
    export_popup_blocked:   'Le navigateur a bloqué la fenêtre d\'impression. Autorisez les pop-ups pour ce site.',
    export_pdf_open:        'Fenêtre d\'impression ouverte. Choisissez « Enregistrer en PDF » dans le dialogue.',
    export_word_generating: 'Génération du document Word…',
    export_word_ok:         'Document Word exporté avec succès !',
    export_word_error:      'Erreur lors de la génération Word.',
    mfa_2fa_activated:      '2FA activé avec succès !',
    mfa_mandatory_nodisable:'La 2FA est obligatoire et ne peut pas être désactivée.',
    mfa_qr_regenerated:     'Nouveau QR code généré. Scannez-le.',
    mfa_secret_copied:      'Secret copié !',
    mfa_reset_done:         '2FA réinitialisé. Reconnectez-vous pour le reconfigurer.',
    module_moved:           'Module déplacé.',
    section_edited:         'Section modifiée ✓',
    title_edited:           'Titre modifié ✓',
    image_not_recognized:   'Fichier non reconnu comme image.',
    image_too_large:        'Image trop volumineuse (max 8 Mo).',
    table_pasted_excel:     'Tableau collé depuis Excel ✓',
    table_excel_pasted:     'Tableau Excel collé ✓',
    data_excel_pasted:      'Données Excel collées ✓',
    table_pasted_quill:     'Tableau collé en format texte.',
    project_name_required2: 'Le nom du projet est obligatoire.',
    project_updated_ok:     'Projet mis à jour ✓',
    template_applied:       'Template appliqué.',
    welcome_2fa:            'Votre compte est sécurisé avec la 2FA.',
    welcome:                'Bienvenue',
    no_logo_found:          'Aucun logo trouvé',
    confirm_lbl:            'Confirmer',

    // ── project-dashboard KPI labels ────────────────
    kpi_label_total:        'CRs totaux',
    kpi_label_final:        'Finalisés',
    kpi_label_draft:        'Brouillons',
    kpi_label_actions:      'Actions totales',
    kpi_label_completion:   'Taux de complétion',
    kpi_label_overdue:      'Actions en retard',
    kpi_label_participants2:'Participants uniques',
    kpi_label_last:         'Dernière réunion',
    kpi_progress:           'Progression des actions',
    kpi_todo:               'À faire',
    kpi_wip:                'En cours',
    kpi_done2:              'Terminées',
    kpi_blocked2:           'Bloquées',
    pd_no_actions:          'Aucune action',
    pd_with_status:         'avec ce statut',
    pd_overdue_badge:       '⚠️ Retard',
    pd_no_participants:     'Aucun participant dans les CRs de ce projet.',
    pd_no_deadlines:        'Aucune échéance à suivre.',
    pd_load_error:          'Erreur de chargement',
    no_project_sidebar:     'Aucun projet — créez-en un !',
    breadcrumb_dashboard:   'Tableau de bord',

    // ── Confirm dialogs ──────────────────────────────
    reset_project_template:     'Réinitialiser le template du projet ?',
    reset_project_template_msg: 'utilisera à nouveau les paramètres globaux.',
    reset_btn:                  'Réinitialiser',
    settings_project_hint:      'Ces réglages s\'appliquent uniquement à ce projet.',
    settings_global_label:      'Paramètres globaux',
    settings_global_hint:       'Valeurs par défaut pour tous les projets sans template personnalisé.',

    // ── Collaboration (chaînes dynamiques) ──────────
    collab_modal_title:         'Collaborateurs',
    collab_invite_empty:        'Saisissez un identifiant ou un email.',
    collab_invite_self:         'Vous ne pouvez pas vous inviter vous-même.',
    collab_invite_searching:    'Recherche…',
    collab_invite_btn_label:    'Inviter',
    collab_invite_not_found:    'Aucun utilisateur trouvé avec cet identifiant ou cet email.',
    collab_already_pending:     'une invitation en attente',
    collab_already_member:      'déjà membre',
    collab_already_on_project:  'Cet utilisateur a',
    collab_already_on_project2: 'sur ce projet.',
    collab_load_error:          'Erreur lors du chargement des membres.',
    role_updated_ok:            'Rôle mis à jour.',
    role_update_err:            'Erreur lors de la mise à jour du rôle.',
    leave_project_title:        'Quitter ce projet ?',
    leave_project_msg:          'Vous n\'aurez plus accès à ce projet ni à ses CRs. Le propriétaire pourra vous réinviter.',
    leave_btn:                  'Quitter',
    membership_not_found_err:   'Membership introuvable.',
    project_left_ok:            'Vous avez quitté',
    project_left_err:           'Erreur lors de la sortie du projet.',
    invitation_accepted_ok:     'Invitation acceptée ! Le projet est maintenant disponible.',
    invitation_accept_err:      'Erreur lors de l\'acceptation. Réessayez.',
    invitation_declined_ok:     'Invitation déclinée.',
    invitation_decline_err:     'Erreur lors du refus. Réessayez.',
    invitations_load_error:     'Erreur lors du chargement des invitations.',
    no_invitations_pending:     'Aucune invitation en attente.',
    invited_by:                 'Invité par',
    role_label:                 'Rôle',
    invite_accept_btn:          'Accepter',
    invite_decline_btn:         'Décliner',
    unknown_project:            'Projet inconnu',
    a_collaborator:             'Un collaborateur',

    // ── Lien d'invitation ────────────────────────────
    invite_link_copy_btn:    'Copier',
    invite_link_revoke_btn:  'Nouveau lien',
    invite_link_placeholder: 'Génération du lien…',
    copy_for_email:          'Copier pour Email',
    invite_link_error:          'Erreur de génération',
    invite_link_valid:          'Lien valide — toute personne avec ce lien peut rejoindre en tant qu\'Éditeur.',
    invite_link_copied:         'Lien copié dans le presse-papier !',
    invite_link_copied_short:   'Lien copié !',
    invite_link_new:            'Nouveau lien d\'invitation généré.',
    invite_link_revoke_error:   'Erreur lors de la révocation.',
    invite_link_invalid:        'Lien d\'invitation invalide ou expiré.',
    already_member_project:     'Vous êtes déjà membre de ce projet.',
    join_link_error:            'Erreur lors de la vérification du lien.',
    join_loading:               'Rejoindre…',
    join_btn:                   'Rejoindre le projet',
    join_as_editor:             'Vous avez été invité à rejoindre ce projet en tant que',
    join_success:               'Vous avez rejoint le projet avec succès !',
    join_error:                 'Erreur lors de la jonction au projet.',
    join_project_title:         'Projet partagé',

    // ── Co-édition temps réel ────────────────────────
    sync_update_title:          'Mise à jour disponible',
    sync_update_sub:            'Un collaborateur a modifié ce CR.',
    sync_apply_btn:             'Appliquer',
    sync_cr_deleted:            'Ce CR a été supprimé par un collaborateur.',
    sync_modified_by:           'vient de modifier ce CR.',

    // ── Mon Espace (hardcodées) ──────────────────────
    configure_profile:          'Configurer votre profil →',
    user_id_prefix:             'ID :',
  },

  /* ══════════════════════════════════════════════════
     ENGLISH
  ══════════════════════════════════════════════════ */
  en: {
    // ── App ─────────────────────────────────────────
    app_name:           'CR Master',
    app_subtitle:       'Professional Meeting Notes',

    // ── Auth ────────────────────────────────────────
    login_title:        'Sign in',
    register_title:     'Create an account',
    username:           'Username',
    password:           'Password',
    confirm_password:   'Confirm password',
    first_name:         'First name',
    last_name:          'Last name',
    login_btn:          'Sign in',
    register_btn:       'Create my account',
    forgot_password:    'Forgot password?',
    no_account:         'No account yet?',
    have_account:       'Already have an account?',
    login_error_wrong:  'Incorrect username or password.',
    login_error_fields: 'Username and password are required.',
    register_error_min3:'Username must be at least 3 characters.',
    register_error_min6:'Password must be at least 6 characters.',
    register_error_match:'Passwords do not match.',
    register_error_question:'Please choose a security question.',
    register_error_answer:'Please answer the security question.',
    security_question:  'Security question',
    security_answer:    'Your answer',
    connecting:         'Signing in…',
    creating:           'Creating…',

    // ── MFA ─────────────────────────────────────────
    mfa_screen_title:   'Two-step verification',
    mfa_screen_subtitle:'Enter the code shown in your authenticator app.',
    mfa_code_label:     '6-digit code',
    mfa_code_placeholder:'000000',
    mfa_verify_btn:     'Verify',
    mfa_cancel:         'Use a different account',
    mfa_code_invalid:   '6-digit code required.',
    mfa_code_wrong:     'Incorrect code. Check your device clock.',
    mfa_enabled_toast:  '2FA enabled! Your account is now secured.',
    mfa_disabled_toast: '2FA disabled.',
    mfa_disable_prompt: 'Enter your Google Authenticator code to disable 2FA:',
    mfa_setup_title:    'Enable two-factor authentication',
    mfa_setup_step1:    '1. Install Google Authenticator or Authy',
    mfa_setup_step2:    '2. Scan this QR code',
    mfa_setup_step3:    '3. Enter the code shown',
    mfa_manual_entry:   'Manual entry',
    mfa_copy_secret:    'Copy secret',
    mfa_section_title:  'Two-factor authentication (2FA)',
    mfa_active_label:   'Two-factor authentication enabled',
    mfa_inactive_label: 'Two-factor authentication disabled',
    mfa_active_sub:     'Your account is protected by Google Authenticator.',
    mfa_inactive_sub:   'Enable 2FA to strengthen your account security.',
    mfa_enable_btn:     'Enable',
    mfa_disable_btn:    'Disable',
    mfa_mandatory_label:        'Mandatory — cannot be disabled',
    mfa_mandatory_no_disable:   'Two-factor authentication is mandatory and cannot be disabled.',
    mfa_mandatory_login_ctx:    "To access the application, you must configure Google Authenticator.",
    mfa_mandatory_register_ctx: "Your account has been created. Now configure Google Authenticator to access the application.",
    mfa_activate_access:        "Activate and access the application",
    mfa_mandatory_banner_title: 'Mandatory two-factor authentication',
    mfa_mandatory_footer:       '2FA protects your account and the sensitive data of your projects. Once enabled, you will be asked for it at every login.',
    mfa_cancel_and_logout:      'Cancel and sign out',

    // ── Navigation ───────────────────────────────────
    new_cr:             'New meeting note',
    agenda:             'Agenda / Planning',
    my_space:           'My Profile',
    search_cr:          'Search a note…',
    my_projects:        'MY PROJECTS',
    shared_with_me:     'SHARED WITH ME',
    no_project:         'No project — create one!',
    new_project:        'New project',
    invitations:        'Received invitations',
    settings_template:  'Template settings',
    dark_mode:          'Dark mode',

    // ── Dashboard ────────────────────────────────────
    dashboard_title:    'Dashboard',
    projects:           'Projects',
    total_crs:          'Total notes',
    finalized:          'Finalized',
    drafts:             'Drafts',
    recent_activity:    'Recent activity',
    no_recent:          'No recent notes.',
    quick_actions:      'Quick actions',

    // ── Projet ───────────────────────────────────────
    project_name:       'Project name',
    project_desc:       'Description',
    project_color:      'Project color',
    create_project:     'Create project',
    delete_project:     'Delete project',
    confirm_delete_project:'Deleting this project will also delete all its notes. This action is irreversible.',
    project_crs:        'meeting notes',
    list_crs:           'List notes',
    collaborators:      'Collaborators',
    leave_project:      'Leave',

    // ── CR Form ──────────────────────────────────────
    cr_context:         'Meeting context',
    mission_name:       'Mission name',
    meeting_name:       'Meeting name',
    date:               'Date',
    location:           'Location / Mode',
    facilitator:        'Facilitator',
    author:             'Note author',
    status:             'Status',
    draft:              'Draft',
    final:              'Final',
    archived:           'Archived',
    participants:       'Participants',
    add_participant:    'Add a participant',
    participant_name:   'Name',
    participant_role:   'Role',
    participant_company:'Company',
    action_tracking:    'Action tracking',
    action:             'Action',
    owner:              'Owner',
    due_date:           'Due date',
    todo:               'To do',
    in_progress:        'In progress',
    done:               'Done',
    blocked:            'Blocked',
    add_action:         'Add an action',
    key_points:         'Key points',
    key_points_placeholder: 'Write the key points of the meeting…',
    keywords:           'Keywords',
    keywords_placeholder:'comma-separated…',
    save_draft:         'Save as draft',
    save_final:         'Save as final',
    export_email:       'Email export',
    export_pdf:         'PDF export',
    export_word:        'Word export',
    cr_saved:           'Note saved.',
    cr_deleted:         'Note deleted.',
    duplicate:          'Duplicate',
    no_cr:              'No notes',
    no_mission_warning: 'Please fill in at least the mission and meeting name.',
    choose_template:    'Choose a template',
    template_library:   'Template library',
    my_templates:       'My templates',
    default_templates:  'Default templates',
    create_template:    'Create template',
    edit_template:      'Edit template',
    template_name:      'Template name',
    template_desc:      'Description',
    save_template:      'Save template',
    use_template:       'Use this template',
    preview_template:   'Preview',
    delete_template:    'Delete',
    template_saved:     'Template saved.',
    template_deleted:   'Template deleted.',
    template_modules:   'Available modules',
    add_module:         'Add this module',
    remove_module:      'Remove',
    module_context:     'Context',
    module_participants:'Participants',
    module_actions:     'Action tracking',
    module_key_points:  'Key points',
    module_decisions:   'Decisions',
    module_risks:       'Risks',
    module_budget:      'Budget',
    module_next_steps:  'Next steps',
    module_custom:      'Custom section',

    // ── Project dashboard ────────────────────────────
    project_dashboard:  'Dashboard',
    kpi_total_crs:      'Total notes',
    kpi_finalized:      'Finalized',
    kpi_drafts:         'Drafts',
    kpi_total_actions:  'Total actions',
    kpi_completion:     'Completion rate',
    kpi_overdue:        'Overdue actions',
    kpi_participants:   'Unique participants',
    kpi_last_meeting:   'Last meeting',
    project_team:       'Project team',
    collab_section:     'Project collaborators',
    action_tracking_full:'Consolidated action tracking',
    deadlines:          'Deadline tracking',
    overdue:            'Overdue',
    this_week:          'This week',
    this_month:         'This month',
    future:             'Future',
    all_actions:        'All',
    no_participants:    'No participants in this project\'s notes.',
    no_actions:         'No actions.',
    remove_participant: 'Remove this participant from all project notes',

    // ── Agenda ───────────────────────────────────────
    agenda_title:       'Agenda / Planning',
    all_projects:       'All projects',
    group_by:           'Group by',
    by_project:         'By project',
    by_date:            'By date',
    by_status:          'By status',
    export_ics:         'Outlook export',
    no_tasks:           'No tasks.',

    // ── My Profile ───────────────────────────────────
    my_space_title:     'My Profile',
    personal_info:      'Personal information',
    job_title:          'Job title',
    organization:       'Organization',
    email:              'Professional email',
    phone:              'Phone',
    avatar_color:       'Avatar color',
    save_profile:       'Save profile',
    profile_saved:      'Profile saved.',
    password_recovery:  'Password recovery',
    pending_invitations:'Received invitations',
    no_invitations:     'No pending invitations.',
    accept:             'Accept',
    decline:            'Decline',
    logout:             'Sign out',
    user_id_label:      'ID:',

    // ── Collaboration ────────────────────────────────
    invite_member:      'Invite a collaborator',
    invite_hint:        'Enter the collaborator\'s username or email.',
    invite_placeholder: 'username or email…',
    invite_btn:         'Invite',
    role_editor:        'Editor',
    role_viewer:        'Viewer',
    role_owner:         'Owner',
    status_pending:     'Pending',
    status_accepted:    'Accepted',
    status_declined:    'Declined',
    remove_member:      'Remove member',
    leave_this_project: 'Leave this project',
    members:            'Project members',
    no_members:         'No collaborators yet.',
    invitation_sent:    'Invitation sent to',
    shared_badge:       'Shared',

    // ── Settings ─────────────────────────────────────
    settings_title:     'Template settings',
    primary_color:      'Primary color',
    accent_color:       'Accent color',
    font:               'Font',
    font_size:          'Font size',
    org_name:           'Organization name',
    logo:               'Logo',
    upload_logo:        'Upload logo',
    reset_logo:         'Reset',
    save_settings:      'Save',
    settings_saved:     'Settings saved.',

    // ── Import ───────────────────────────────────────
    import_title:       'Import a document to pre-fill the note',
    import_sub:         'Drag a .txt, .eml or .docx here, or paste plain text',
    choose_file:        'Choose a file',
    paste_text:         'Paste text',

    // ── Generic ──────────────────────────────────────
    cancel:             'Cancel',
    confirm:            'Confirm',
    save:               'Save',
    delete:             'Delete',
    close:              'Close',
    edit:               'Edit',
    back:               'Back',
    loading:            'Loading…',
    error_retry:        'Error. Please retry.',
    copied:             'Copied!',
    verifying:          'Verifying…',
    verify:             'Verify',
    success:            'Success',
    warning:            'Warning',
    yes:                'Yes',
    no:                 'No',

    // ── Extra keys ───────────────────────────────────
    login_info:         'Your data is protected by your password. Each account only accesses its own notes.',
    dashboard_welcome:  'Welcome to <span>Wavestone CR Master</span>',
    dashboard_sub:      'Write, archive and export your meeting notes in just a few clicks.',
    agenda_sub:         'All your to-dos from all projects',
    tasks_list:         'Task list',
    today:              'Today',
    save_cr:            'Save note',
    export_cr:          'Export this note:',
    reset:              'Reset',
    role_editor_desc:   'Can create, edit and delete notes in this project',
    role_viewer_desc:   'Can only view notes in this project',
    meeting_name:       'Meeting',
    menu:               'Menu',

    // ── Login screen (branding) ───────────────────────
    auth_brand_desc:    'The professional platform for managing meeting notes for Wavestone teams.',
    auth_feature_mfa:   'Mandatory two-factor authentication',
    auth_feature_collab:'Real-time collaborative work',
    auth_feature_export:'Structured and exportable meeting notes',
    auth_feature_agenda:'Integrated agenda and planning',
    auth_card_sub:      'Professional meeting notes',
    auth_footer:        '© 2026 Wavestone — Confidential',
    lang_switch_en:     'Switch to English',
    lang_switch_fr:     'Switch to French',

    // ── Toasts / dynamic messages ────────────────────
    profile_required:       'Please enter at least your first or last name.',
    profile_updated:        'Profile updated!',
    profile_save_error:     'Error saving profile.',
    cr_save_error:          'Error saving note.',
    cr_delete_error:        'Error deleting note.',
    cr_duplicated:          'Note duplicated:',
    cr_dup_error:           'Error duplicating note.',
    project_deleted:        'Project deleted.',
    project_delete_error:   'Error deleting project.',
    project_name_required:  'Please enter a project name.',
    project_created:        'Project created!',
    mission_required:       'Please fill in at least the mission and meeting name.',
    logo_image_required:    'Please select an image.',
    logo_project_pending:   'Project logo ready — click Apply to save.',
    logo_global_updated:    'Global logo updated!',
    template_project_saved: 'Project template saved!',
    template_save_error:    'Error saving template.',
    settings_global_applied:'Global settings applied!',
    settings_global_reset:  'Global settings reset.',
    template_project_reset: 'Project template reset.',
    template_reset_error:   'Error resetting template.',
    invite_owner_only:      'Only the owner or an editor can invite members.',
    invitation_sent_to:     'Invitation sent to',
    role_updated:           'Role updated.',
    role_update_error:      'Error updating role.',
    member_removed:         'has been removed from the project.',
    member_remove_error:    'Error removing member.',
    membership_not_found:   'Membership not found.',
    project_left:           'You have left',
    project_leave_error:    'Error leaving project.',
    invitation_accepted:    'Invitation accepted! The project is now available.',
    invitation_accept_error:'Error accepting invitation. Please retry.',
    invitation_declined:    'Invitation declined.',
    invitation_decline_error:'Error declining invitation. Please retry.',
    participant_saved:      'Participant profile saved!',
    participant_save_error: 'Error saving participant.',
    participant_added:      'added to participants.',
    open_cr_first:          'Open a note first to add',
    cr_not_found:           'Note not found.',
    action_not_found:       'Action not found.',
    status_updated:         'Status updated:',
    status_update_error:    'Error updating status.',
    owner_only_remove_part: 'Only the owner or an editor can remove participants.',
    part_remove_error:      'Error removing. Please retry.',
    no_task_selected:       'No task selected.',
    tasks_exported:         'task(s) exported as .ics!',
    import_paste_first:     'Please paste text before analysing.',
    import_unsupported:     'Unsupported format. Use .txt, .eml or .docx',
    import_auto_fail:       'Automatic import failed — use "Paste text".',
    export_fill_mission:    'Please fill in at least the mission and meeting name.',
    export_email_ok:        '✅ Formatted content copied! Paste directly into Outlook / Gmail.',
    export_email_ok2:       '✅ Formatted content copied! Paste into your mail client.',
    export_html_copied:     '⚠️ HTML source copied. Paste into Outlook > Insert > HTML or via an intermediate tool.',
    export_html_fallback:   '⚠️ HTML source copied (fallback mode).',
    export_popup_blocked:   'The browser blocked the print window. Allow pop-ups for this site.',
    export_pdf_open:        'Print window opened. Choose "Save as PDF" in the dialog.',
    export_word_generating: 'Generating Word document…',
    export_word_ok:         'Word document exported successfully!',
    export_word_error:      'Error generating Word document.',
    mfa_2fa_activated:      '2FA activated successfully!',
    mfa_mandatory_nodisable:'2FA is mandatory and cannot be disabled.',
    mfa_qr_regenerated:     'New QR code generated. Scan it.',
    mfa_secret_copied:      'Secret copied!',
    mfa_reset_done:         '2FA reset. Sign in again to reconfigure.',
    module_moved:           'Module moved.',
    section_edited:         'Section updated ✓',
    title_edited:           'Title updated ✓',
    image_not_recognized:   'File not recognised as an image.',
    image_too_large:        'Image too large (max 8 MB).',
    table_pasted_excel:     'Table pasted from Excel ✓',
    table_excel_pasted:     'Excel table pasted ✓',
    data_excel_pasted:      'Excel data pasted ✓',
    table_pasted_quill:     'Table pasted as plain text.',
    project_name_required2: 'Project name is required.',
    project_updated_ok:     'Project updated ✓',
    template_applied:       'Template applied.',
    welcome_2fa:            'Your account is secured with 2FA.',
    welcome:                'Welcome',
    no_logo_found:          'No logo found',
    confirm_lbl:            'Confirm',

    // ── project-dashboard KPI labels ────────────────
    kpi_label_total:        'Total notes',
    kpi_label_final:        'Finalized',
    kpi_label_draft:        'Drafts',
    kpi_label_actions:      'Total actions',
    kpi_label_completion:   'Completion rate',
    kpi_label_overdue:      'Overdue actions',
    kpi_label_participants2:'Unique participants',
    kpi_label_last:         'Last meeting',
    kpi_progress:           'Action progress',
    kpi_todo:               'To do',
    kpi_wip:                'In progress',
    kpi_done2:              'Done',
    kpi_blocked2:           'Blocked',
    pd_no_actions:          'No actions',
    pd_with_status:         'with this status',
    pd_overdue_badge:       '⚠️ Overdue',
    pd_no_participants:     'No participants in this project\'s notes.',
    pd_no_deadlines:        'No deadlines to track.',
    pd_load_error:          'Loading error',
    no_project_sidebar:     'No project — create one!',
    breadcrumb_dashboard:   'Dashboard',

    // ── Confirm dialogs ──────────────────────────────
    reset_project_template:     'Reset project template?',
    reset_project_template_msg: 'will use global settings again.',
    reset_btn:                  'Reset',
    settings_project_hint:      'These settings apply only to this project.',
    settings_global_label:      'Global settings',
    settings_global_hint:       'Default values for all projects without a custom template.',

    // ── Collaboration (dynamic strings) ─────────────
    collab_modal_title:         'Collaborators',
    collab_invite_empty:        'Please enter a username or email.',
    collab_invite_self:         'You cannot invite yourself.',
    collab_invite_searching:    'Searching…',
    collab_invite_btn_label:    'Invite',
    collab_invite_not_found:    'No user found with that username or email.',
    collab_already_pending:     'a pending invitation',
    collab_already_member:      'already a member',
    collab_already_on_project:  'This user has',
    collab_already_on_project2: 'on this project.',
    collab_load_error:          'Error loading members.',
    role_updated_ok:            'Role updated.',
    role_update_err:            'Error updating role.',
    leave_project_title:        'Leave this project?',
    leave_project_msg:          'You will no longer have access to this project or its notes. The owner can re-invite you.',
    leave_btn:                  'Leave',
    membership_not_found_err:   'Membership not found.',
    project_left_ok:            'You have left',
    project_left_err:           'Error leaving project.',
    invitation_accepted_ok:     'Invitation accepted! The project is now available.',
    invitation_accept_err:      'Error accepting invitation. Please retry.',
    invitation_declined_ok:     'Invitation declined.',
    invitation_decline_err:     'Error declining invitation. Please retry.',
    invitations_load_error:     'Error loading invitations.',
    no_invitations_pending:     'No pending invitations.',
    invited_by:                 'Invited by',
    role_label:                 'Role',
    invite_accept_btn:          'Accept',
    invite_decline_btn:         'Decline',
    unknown_project:            'Unknown project',
    a_collaborator:             'A collaborator',

    // ── Invitation link ───────────────────────────────
    invite_link_copy_btn:    'Copy',
    invite_link_revoke_btn:  'New link',
    invite_link_placeholder: 'Generating link…',
    copy_for_email:          'Copy for Email',
    invite_link_error:          'Generation error',
    invite_link_valid:          'Valid link — anyone with this link can join as Editor.',
    invite_link_copied:         'Link copied to clipboard!',
    invite_link_copied_short:   'Link copied!',
    invite_link_new:            'New invitation link generated.',
    invite_link_revoke_error:   'Error revoking link.',
    invite_link_invalid:        'Invalid or expired invitation link.',
    already_member_project:     'You are already a member of this project.',
    join_link_error:            'Error checking invitation link.',
    join_loading:               'Joining…',
    join_btn:                   'Join project',
    join_as_editor:             'You have been invited to join this project as',
    join_success:               'You have successfully joined the project!',
    join_error:                 'Error joining the project.',
    join_project_title:         'Shared project',

    // ── Real-time co-editing ──────────────────────────
    sync_update_title:          'Update available',
    sync_update_sub:            'A collaborator has modified this note.',
    sync_apply_btn:             'Apply',
    sync_cr_deleted:            'This note was deleted by a collaborator.',
    sync_modified_by:           'just modified this note.',

    // ── My Profile (hardcoded) ────────────────────────
    configure_profile:          'Configure your profile →',
    user_id_prefix:             'ID:',
  },
};

/* ─────────────────────────────────────────────────────
   ÉTAT DE LA LOCALE
───────────────────────────────────────────────────── */
let _currentLang = localStorage.getItem('wv_lang') || 'fr';

function getCurrentLang() { return _currentLang; }

function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  _currentLang = lang;
  localStorage.setItem('wv_lang', lang);
  applyTranslations();
  updateLangToggle();
}

/**
 * Fonction de traduction principale.
 * window.t('key') → string dans la langue courante
 */
function t(key) {
  return (TRANSLATIONS[_currentLang] && TRANSLATIONS[_currentLang][key])
    || (TRANSLATIONS['fr'] && TRANSLATIONS['fr'][key])
    || key;
}

/* ─────────────────────────────────────────────────────
   APPLICATION DES TRADUCTIONS AU DOM
   Utilise data-i18n="key" sur les éléments statiques
   et data-i18n-placeholder="key" pour les placeholders
───────────────────────────────────────────────────── */
function applyTranslations() {
  // Textes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.textContent = val;
  });
  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val) el.placeholder = val;
  });
  // Titres (title attribute)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = t(key);
    if (val) el.title = val;
  });
  // HTML (pour les éléments avec <strong> etc.)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const val = t(key);
    if (val) el.innerHTML = val;
  });
  // Attribut value pour les <option>
  document.querySelectorAll('[data-i18n-value]').forEach(el => {
    const key = el.getAttribute('data-i18n-value');
    const val = t(key);
    if (val) el.textContent = val;
  });

  // Mettre à jour l'attribut lang sur <html>
  document.documentElement.lang = _currentLang;
}

/* ─────────────────────────────────────────────────────
   TOGGLE BOUTON DE LANGUE
───────────────────────────────────────────────────── */
function updateLangToggle() {
  const isFr = _currentLang === 'fr';
  const nextLabel = isFr ? 'EN' : 'FR';
  const nextFlag  = isFr ? '🇬🇧' : '🇫🇷';
  const nextTitle = isFr ? 'Switch to English' : 'Passer en français';

  // Bouton topbar principal
  const btn = document.getElementById('langToggleBtn');
  if (btn) {
    btn.innerHTML = `<span class="lang-flag">${nextFlag}</span> ${nextLabel}`;
    btn.title = nextTitle;
  }

  // Bouton sidebar
  const sidebarBtn = document.getElementById('sidebarLangBtn');
  if (sidebarBtn) {
    const flag  = sidebarBtn.querySelector('.lang-flag');
    const label = sidebarBtn.querySelector('.sidebar-lang-label');
    if (flag)  flag.textContent  = nextFlag;
    if (label) label.textContent = nextLabel;
    sidebarBtn.title = nextTitle;
  }

  // Bouton sur l'écran de connexion
  const authBtn = document.getElementById('authLangBtn');
  if (authBtn) {
    const flag  = authBtn.querySelector('.lang-flag');
    const label = authBtn.querySelector('#authLangLabel');
    if (flag)  flag.textContent  = nextFlag;
    if (label) label.textContent = nextLabel;
    authBtn.title = nextTitle;
  }
}

function toggleLang() {
  setLang(_currentLang === 'fr' ? 'en' : 'fr');
}

/* ─────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  updateLangToggle();
});

/* ─────────────────────────────────────────────────────
   EXPOSE GLOBALS
───────────────────────────────────────────────────── */
window.t              = t;
window.setLang        = setLang;
window.toggleLang     = toggleLang;
window.getCurrentLang = getCurrentLang;
window.applyTranslations = applyTranslations;
