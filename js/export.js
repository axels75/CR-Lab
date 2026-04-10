/* =====================================================
   WAVESTONE CR MASTER – export.js
   Export : Email (rich-text clipboard), PDF (print), Word (.docx)
   ===================================================== */

'use strict';

/* =====================================================
   CHARGEMENT DU LOGO EN BASE64
   Convertit le PNG en data URI pour l'embarquer dans les exports
   ===================================================== */
async function getLogoBase64() {
  // 1. Logo du PROJET courant (priorité maximale)
  if (STATE.currentProjectId && STATE.projects) {
    const proj = STATE.projects.find(p => p.id === STATE.currentProjectId);
    if (proj && proj.template_logo && proj.template_logo.startsWith('data:')) {
      return proj.template_logo;
    }
  }

  // 2. Logo global custom uploadé (localStorage)
  const saved = localStorage.getItem('wv_logo');
  if (saved && saved.startsWith('data:')) return saved;

  // 3. Logo par défaut (PNG → base64)
  try {
    const response = await fetch('images/wavestone-logo.png');
    if (!response.ok) throw new Error('Logo non trouvé');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // Fallback : texte org name
  }
}

/* =====================================================
   COLLECTE DES DONNÉES DU CR
   Prend en compte les layouts actifs (texte, tableau, image, planning)
   ===================================================== */
function buildCRData() {
  // Utiliser les settings actifs (projet courant s'il a un template, sinon global)
  const settings    = (typeof getActiveSettings === 'function') ? getActiveSettings() : STATE.settings;
  const primaryColor = settings.primaryColor || '#002D72';
  const accentColor  = settings.accentColor  || '#E8007D';
  const orgName      = settings.orgName       || 'Wavestone';
  // Police : extraire le premier nom de famille (compatible email/Word)
  const fontRaw     = settings.font || 'Arial, sans-serif';
  const fontFamily  = fontRaw.split(',')[0].replace(/['"/]/g, '').trim() || 'Arial';
  const fontSize    = settings.fontSize || 14;
  const logoSrc = null; // injecté async par exportEmail/PDF/Word

  const mission     = document.getElementById('fieldMission')?.value.trim()     || '';
  const meeting     = document.getElementById('fieldMeetingName')?.value.trim() || '';
  const date        = document.getElementById('fieldDate')?.value               || '';
  const location    = document.getElementById('fieldLocation')?.value.trim()    || '';
  const facilitator = document.getElementById('fieldFacilitator')?.value.trim() || '';
  const author      = document.getElementById('fieldAuthor')?.value.trim()      || '';
  const status      = document.getElementById('fieldStatus')?.value             || 'draft';

  const participants  = collectParticipants();
  const actions       = collectActions();
  // keyPointsHTML sera résolu après la définition de _getSectionContent

  // ── Modules actifs selon le template ──
  const activeModules = STATE._activeTemplate?.modules ||
    ['context','participants','actions','key_points'];

  // ── Fonction helper : collecter contenu d'une section selon son layout actif ──
  const _getSectionContent = (sectionId) => {
    // Utiliser getModuleLayoutContent si disponible (prend en compte tableau, image, planning)
    if (typeof getModuleLayoutContent === 'function') {
      const result = getModuleLayoutContent(sectionId);
      // planningRows : données structurées lues du DOM vivant (valeurs réelles)
      return { layout: result.layout, html: result.html, planningRows: result.planningRows || [] };
    }
    // Fallback : chercher l'éditeur Quill
    const mappings = {
      sectionDecisions: 'decisions_quill_editor',
      sectionRisks:     'risks_quill_editor',
      sectionBudget:    'budget_quill_editor',
      sectionNextSteps: 'next_steps_quill_editor',
    };
    const qId = mappings[sectionId];
    const q   = qId && STATE._quillEditors?.[qId];
    if (q) return { layout: 'text', html: q.root.innerHTML, planningRows: [] };
    return { layout: 'text', html: '', planningRows: [] };
  };

  // Résoudre key points via le layout actif (peut être texte, tableau, image)
  const keyPointsData = _getSectionContent('sectionKeyPoints');
  // Fallback : éditeur principal Quill si layout = texte et aucun éditeur dédié trouvé
  const keyPointsHTML = keyPointsData.html || (STATE.quillEditor ? STATE.quillEditor.root.innerHTML : '');

  const decisionsData  = _getSectionContent('sectionDecisions');
  const risksData      = _getSectionContent('sectionRisks');
  const budgetData     = _getSectionContent('sectionBudget');
  const nextStepsData  = _getSectionContent('sectionNextSteps');

  // Compatibilité avec le reste du code (certaines fonctions attendent *HTML)
  const decisionsHTML  = decisionsData.html;
  const risksHTML      = risksData.html;
  const budgetHTML     = budgetData.html;
  const nextStepsHTML  = nextStepsData.html;

  // ── Collecter TOUTES les sections visibles dans l'ordre DOM ──
  const allVisibleSections = [];

  // Sections standards optionnelles
  const STD_SECTIONS = [
    { id: 'sectionDecisions',  key: 'decisions',  labelFr: 'Décisions',          labelEn: 'Decisions',   bgColor: '#F8FAFC', borderColor: '#E2E8F0' },
    { id: 'sectionRisks',      key: 'risks',       labelFr: 'Risques',            labelEn: 'Risks',       bgColor: '#FFF5F5', borderColor: '#FCA5A5' },
    { id: 'sectionBudget',     key: 'budget',      labelFr: 'Budget',             labelEn: 'Budget',      bgColor: '#F0FDF4', borderColor: '#86EFAC' },
    { id: 'sectionNextSteps',  key: 'next_steps',  labelFr: 'Prochaines étapes',  labelEn: 'Next steps',  bgColor: '#FFFBEB', borderColor: '#FCD34D' },
  ];

  STD_SECTIONS.forEach(({ id, key, labelFr, labelEn, bgColor, borderColor }) => {
    if (!activeModules.includes(key)) return;
    const sect = document.getElementById(id);
    if (!sect || sect.style.display === 'none') return;
    const data = _getSectionContent(id);
    // Pour le planning : on a toujours des données même si html est vide
    const hasContent = data.layout === 'planning'
      ? (data.planningRows && data.planningRows.length > 0)
      : (data.html && data.html.trim() && data.html.trim() !== '<p><br></p>');
    if (!hasContent) return;
    // Titre personnalisé éventuel
    const customTitle = sect.querySelector('.section-title-text, h3')?.textContent?.trim();
    allVisibleSections.push({
      id,
      label:        customTitle || labelFr,
      html:         data.html,
      layout:       data.layout,
      planningRows: data.planningRows || [],
      bgColor,
      borderColor,
      isStd: true,
    });
  });

  // Sections custom (template personnalisé ou section-custom)
  const customSections = [];
  document.querySelectorAll('.section-custom').forEach((sect) => {
    if (sect.style.display === 'none') return;
    const title  = sect.querySelector('h3')?.textContent?.trim() || 'Section personnalisée';
    const sectId = sect.id;
    let content  = '';
    let layout   = 'text';

    let planningRows = [];
    if (sectId && typeof getModuleLayoutContent === 'function') {
      const res = getModuleLayoutContent(sectId);
      content = res.html;
      layout  = res.layout;
      planningRows = res.planningRows || [];
    } else {
      // Fallback Quill
      const quillId = sect.querySelector('[id^="customQuill_"]')?.id;
      if (quillId && STATE._quillEditors?.[quillId]) {
        content = STATE._quillEditors[quillId].root.innerHTML;
      } else {
        const qlEditor = sect.querySelector('.ql-editor');
        content = qlEditor?.innerHTML || sect.querySelector('textarea')?.value || '';
      }
    }
    const hasContent2 = layout === 'planning'
      ? (planningRows && planningRows.length > 0)
      : (content && content.trim() && content.trim() !== '<p><br></p>');
    if (!hasContent2) return;
    customSections.push({ title, content, layout, planningRows, id: sectId });
    allVisibleSections.push({
      id:           sectId,
      label:        title,
      html:         content,
      layout,
      planningRows: planningRows,
      bgColor:      '#F8FAFC',
      borderColor:  '#E2E8F0',
      isCustom: true,
    });
  });

  return {
    primaryColor, accentColor, orgName, fontFamily, fontSize, logoSrc,
    mission, meeting, date, location, facilitator, author, status,
    participants, actions, keyPointsHTML,
    // Layout actif pour key points
    keyPointsLayout: keyPointsData.layout || 'text',
    activeModules,
    // Données par section (rétro-compatibilité)
    decisionsHTML, risksHTML, budgetHTML, nextStepsHTML,
    decisionsLayout:       decisionsData.layout,
    risksLayout:           risksData.layout,
    budgetLayout:          budgetData.layout,
    nextStepsLayout:       nextStepsData.layout,
    // Données planning structurées (DOM vivant)
    decisionsPlanningRows: decisionsData.planningRows || [],
    risksPlanningRows:     risksData.planningRows     || [],
    budgetPlanningRows:    budgetData.planningRows    || [],
    nextStepsPlanningRows: nextStepsData.planningRows || [],
    // Toutes les sections visibles dans l'ordre
    allVisibleSections,
    customSections,
  };
}

/* =====================================================
   GÉNÉRATEUR HTML EMAIL (full inline styles — Outlook-safe)
   ===================================================== */
function generateEmailHTML(d) {
  // Logo : data: URI directement (custom ou base64 pré-chargé), sinon texte fallback
  const logoEl = (d.logoSrc && d.logoSrc.startsWith('data:'))
    ? `<img src="${d.logoSrc}" alt="${escAttr(d.orgName)}" style="height:34px;width:auto;display:inline-block;" />`
    : `<span class="force-white" style="font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:1px;font-family:Arial,sans-serif;display:inline-block;">${escHtml(d.orgName)}</span>`;

  const dateStr = d.date ? formatDate(d.date) : '–';

  const statusMap    = { draft: t('draft'), final: t('final'), archived: t('archived') };
  /* Couleurs Outlook-safe : pas de rgba, que du hex plein */
  const statusColors = { draft:'#7C4700', final:'#065F46', archived:'#374151' };
  const statusBg     = { draft:'#FEF3C7', final:'#D1FAE5', archived:'#F3F4F6' };
  const statusBorder = { draft:'#F59E0B', final:'#10B981', archived:'#9CA3AF' };

  const actionStatusColors = { todo:'#7C4700', wip:'#1E3A5F', done:'#065F46', blocked:'#7F1D1D' };
  const actionStatusBg     = { todo:'#FEF3C7', wip:'#DBEAFE', done:'#D1FAE5', blocked:'#FEE2E2' };
  const actionStatusBorder = { todo:'#F59E0B', wip:'#3B82F6', done:'#10B981', blocked:'#EF4444' };
  const actionStatusLabels = { todo: t('todo'), wip: t('in_progress'), done: t('done'), blocked: t('blocked') };

  /* Helper : badge "capsule" Outlook-safe via table imbriquée */
  const badge = (text, bg, textColor, border) =>
    `<table border="0" cellpadding="0" cellspacing="0" style="display:inline-table;">
      <tr>
        <td style="background-color:${bg};border:1px solid ${border};border-radius:20px;padding:3px 10px;white-space:nowrap;">
          <span style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${textColor};line-height:1.4;display:inline;">${text}</span>
        </td>
      </tr>
    </table>`;

  /* Helper : en-tête de tableau Outlook-safe — bgcolor sur th + td imbriqué pour forcer couleur */
  const th = (text, width, pc) =>
    `<th width="${width}" bgcolor="${pc}" style="background-color:${pc} !important;padding:0;text-align:left;border:1px solid ${pc};">
      <!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:100%;height:36pt;"><v:fill type="solid" color="${pc}"/><v:textbox inset="6pt,6pt,6pt,6pt"><![endif]-->
      <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td bgcolor="${pc}" style="background-color:${pc} !important;padding:10px 14px;">
          <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#FFFFFF !important;text-transform:uppercase;letter-spacing:.8px;display:block;">${text}</span></font>
        </td>
      </tr></table>
      <!--[if mso]></v:textbox></v:rect><![endif]-->
    </th>`;

  /* ---- Participants rows ---- */
  const _pInitials = (name) => {
    const parts = (name||'').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
    return (parts[0]||'?').substring(0,2).toUpperCase();
  };
  const _pColor = (name) => {
    const cols = ['#002D72','#E8007D','#0050B3','#6366F1','#8B5CF6','#059669','#D97706','#DC2626'];
    let h = 0; for (let i=0;i<(name||'').length;i++) h=(name.charCodeAt(i)+((h<<5)-h))|0;
    return cols[Math.abs(h)%cols.length];
  };
  const _pAvatar = (p) => {
    if (p.photo && p.photo.startsWith('data:')) {
      return `<img src="${p.photo}" width="32" height="32" style="width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;" alt="${escAttr(p.name)}" />`;
    }
    const color = _pColor(p.name);
    const ini   = _pInitials(p.name);
    return `<!--[if mso]><v:oval xmlns:v="urn:schemas-microsoft-com:vml" style="width:32px;height:32px;" fillcolor="${escAttr(color)}"><v:fill type="solid" color="${escAttr(color)}"/><v:textbox style="mso-next-textbox:#none;"><center style="font-family:Arial;font-size:11px;font-weight:bold;color:#fff;line-height:32px;">${escHtml(ini)}</center></v:textbox></v:oval><![endif]-->
      <!--[if !mso]><!--><table cellpadding="0" cellspacing="0" border="0" style="width:32px;height:32px;"><tr><td width="32" height="32" bgcolor="${color}" style="background-color:${color};border-radius:50%;width:32px;height:32px;text-align:center;vertical-align:middle;"><font color="#ffffff"><span style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#ffffff;line-height:32px;">${escHtml(ini)}</span></font></td></tr></table><!--<![endif]-->`;
  };
  const partRows = d.participants.length > 0
    ? d.participants.map((p, i) => {
        const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        return `<tr>
          <td width="44" style="padding:7px 10px;border-bottom:1px solid #E2E8F0;background-color:${bg};vertical-align:middle;text-align:center;">${_pAvatar(p)}</td>
          <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:#1E293B;border-bottom:1px solid #E2E8F0;background-color:${bg};">${escHtml(p.name)}</td>
          <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:#475569;border-bottom:1px solid #E2E8F0;background-color:${bg};">${escHtml(p.company||'')}</td>
          <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:#475569;border-bottom:1px solid #E2E8F0;background-color:${bg};">${escHtml(p.role||'')}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="padding:12px 14px;font-family:Arial,sans-serif;font-size:13px;color:#94A3B8;font-style:italic;">Aucun participant renseigné</td></tr>`;

  /* ---- Actions rows ---- */
  const actionRows = d.actions.length > 0
    ? d.actions.map((a, i) => {
        const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        const st  = a.status || 'todo';
        return `<tr>
          <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:#1E293B;border-bottom:1px solid #E2E8F0;background-color:${bg};">${escHtml(a.action)}</td>
          <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:#475569;border-bottom:1px solid #E2E8F0;background-color:${bg};">${escHtml(a.owner||'')}</td>
          <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:#475569;border-bottom:1px solid #E2E8F0;background-color:${bg};white-space:nowrap;">${a.due ? formatDate(a.due) : '–'}</td>
          <td style="padding:9px 10px;text-align:center;border-bottom:1px solid #E2E8F0;background-color:${bg};">
            ${badge(actionStatusLabels[st]||'À faire', actionStatusBg[st]||'#FEF3C7', actionStatusColors[st]||'#7C4700', actionStatusBorder[st]||'#F59E0B')}
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="padding:12px 14px;font-family:Arial,sans-serif;font-size:13px;color:#94A3B8;font-style:italic;">Aucune action renseignée</td></tr>`;

  /* ---- Key points ---- */
  const cleanKeyPoints = sanitizeQuillForEmail(d.keyPointsHTML);
  /* Rendu key points selon le layout actif */
  const keyPointsRendered = (() => {
    const kpLayout = d.keyPointsLayout || 'text';
    if (kpLayout === 'table' && d.keyPointsHTML) {
      // Tableau éditable inline
      const kpSect = { layout: 'table', html: d.keyPointsHTML, bgColor: '#F8FAFC', borderColor: '#E2E8F0' };
      return _renderSectionForEmail(kpSect, d.primaryColor);
    }
    if (kpLayout === 'image' && d.keyPointsHTML) {
      return d.keyPointsHTML;
    }
    // Texte par défaut
    return cleanKeyPoints
      ? `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
           <td bgcolor="#F8FAFC" style="background-color:#F8FAFC;padding:16px 18px;border:1px solid #E2E8F0;font-family:Arial,sans-serif;font-size:13px;color:#334155;line-height:1.75;">
             ${cleanKeyPoints}
           </td>
         </tr></table>`
      : `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
           <td bgcolor="#F8FAFC" style="background-color:#F8FAFC;padding:16px 18px;border:1px solid #E2E8F0;">
             <em style="color:#94A3B8;font-style:italic;font-family:Arial,sans-serif;font-size:13px;">Aucun contenu renseigné.</em>
           </td>
         </tr></table>`;
  })();

  /* ---- Titre de section Outlook-safe ---- */
  const sectionTitle = (label) =>
    `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:10px;">
      <tr>
        <td width="6" bgcolor="${d.primaryColor}" style="background-color:${d.primaryColor};border-radius:3px;">&nbsp;</td>
        <td width="10">&nbsp;</td>
        <td>
          <span style="font-family:${d.fontFamily},Arial,sans-serif;font-size:15px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:.5px;">${label}</span>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Force le mode clair : Outlook Desktop et Outlook.com en dark mode
       essaient sinon d'inverser les couleurs du texte (blanc → noir).
       Ces meta + CSS désactivent l'inversion sur les principaux clients. -->
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    body  { margin:0; padding:0; }
    ul    { margin-left:0; padding-left:24px; }
    ol    { margin-left:0; padding-left:24px; }
    li    { mso-special-format:bullet; }
  </style>
  <![endif]-->
  <style type="text/css">
    :root { color-scheme: light only; supported-color-schemes: light only; }
    /* Outlook.com / Office 365 dark mode override (OGSC) */
    [data-ogsc] .force-white,
    [data-ogsb] .force-white,
    .force-white { color: #FFFFFF !important; }
    [data-ogsc] .force-white-pink,
    .force-white-pink { color: #FFD6EE !important; }
    [data-ogsc] .force-white-bg,
    [data-ogsb] .force-white-bg { background-color: #FFFFFF !important; }
    /* Empêche l'inversion auto des fonds colorés sombres */
    u + .body .gmail-dark { background: transparent !important; }
    /* Liste : force puces visibles dans tous les clients */
    ul li { display: list-item !important; list-style-type: disc !important; }
    ol li { display: list-item !important; list-style-type: decimal !important; }
  </style>
  <title>CR – ${escHtml(d.meeting)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:${d.fontFamily},Arial,sans-serif;">

<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F1F5F9;padding:20px 0;">
<tr><td align="center" valign="top">

  <!-- Wrapper -->
  <table border="0" cellpadding="0" cellspacing="0" width="680" style="background-color:#FFFFFF;">

    <!-- ═══ EN-TÊTE ═══ -->
    <tr>
      <td bgcolor="${d.primaryColor}" style="background-color:${d.primaryColor} !important;padding:20px 32px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td bgcolor="${d.primaryColor}" style="background-color:${d.primaryColor} !important;vertical-align:middle;">${logoEl}</td>
            <td align="right" bgcolor="${d.primaryColor}" style="background-color:${d.primaryColor} !important;vertical-align:middle;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="${d.primaryColor}" style="background-color:${d.primaryColor} !important;border:1px solid rgba(255,255,255,0.4);border-radius:20px;padding:4px 12px;">
                    <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#FFFFFF !important;letter-spacing:1px;text-transform:uppercase;">Compte-rendu</span></font>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ═══ TITRE ═══ -->
    <tr>
      <td bgcolor="${d.accentColor}" style="background-color:${d.accentColor} !important;padding:16px 32px 18px;">
        <font color="#FFFFFF"><div class="force-white" style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;color:#FFFFFF !important;line-height:1.3;margin:0 0 4px 0;">${escHtml(d.meeting || 'Réunion sans titre')}</div></font>
        <font color="#FFD6EE"><div class="force-white-pink" style="font-family:Arial,sans-serif;font-size:13px;color:#FFD6EE !important;margin:0;">${escHtml(d.mission || '')}</div></font>
      </td>
    </tr>

    <!-- ═══ MÉTA-DONNÉES ═══ -->
    <tr>
      <td bgcolor="#F8FAFC" style="background-color:#F8FAFC;padding:16px 32px;border-bottom:2px solid #E2E8F0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="25%" style="vertical-align:top;padding-right:12px;">
              <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Date</div>
              <div style="font-family:Arial,sans-serif;font-size:13px;color:#1E293B;font-weight:600;">${dateStr}</div>
            </td>
            <td width="25%" style="vertical-align:top;padding-right:12px;">
              <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Lieu / Modalité</div>
              <div style="font-family:Arial,sans-serif;font-size:13px;color:#1E293B;font-weight:600;">${escHtml(d.location||'–')}</div>
            </td>
            <td width="25%" style="vertical-align:top;padding-right:12px;">
              <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Animateur</div>
              <div style="font-family:Arial,sans-serif;font-size:13px;color:#1E293B;font-weight:600;">${escHtml(d.facilitator||'–')}</div>
            </td>
            <td width="25%" style="vertical-align:top;">
              <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Statut</div>
              ${badge(statusMap[d.status]||'Brouillon', statusBg[d.status]||'#FEF3C7', statusColors[d.status]||'#7C4700', statusBorder[d.status]||'#F59E0B')}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ═══ RÉDACTEUR ═══ -->
    ${d.author ? `<tr>
      <td style="padding:10px 32px;background-color:#FFFFFF;border-bottom:1px solid #E2E8F0;">
        <span style="font-family:Arial,sans-serif;font-size:12px;color:#64748B;">Rédigé par : <strong style="color:#334155;font-weight:700;">${escHtml(d.author)}</strong></span>
      </td>
    </tr>` : ''}

    <!-- ═══ PARTICIPANTS ═══ -->
    ${d.activeModules.includes('participants') ? `<tr>
      <td style="padding:24px 32px 0;background-color:#FFFFFF;">
        ${sectionTitle(_getSectionTitle('sectionParticipants', 'Participants'))}
        <table border="1" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #CBD5E1;">
          <tr bgcolor="${d.primaryColor}" style="background-color:${d.primaryColor};">
            ${th('','5%',d.primaryColor)}
            ${th('Nom','31%',d.primaryColor)}
            ${th('Société / Entité','33%',d.primaryColor)}
            ${th('Rôle','31%',d.primaryColor)}
          </tr>
          ${partRows}
        </table>
      </td>
    </tr>` : ''}

    <!-- ═══ SUIVI DES ACTIONS ═══ -->
    ${d.activeModules.includes('actions') ? `<tr>
      <td style="padding:24px 32px 0;background-color:#FFFFFF;">
        ${sectionTitle(_getSectionTitle('sectionActions', 'Suivi des actions'))}
        <table border="1" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #CBD5E1;">
          <tr bgcolor="${d.primaryColor}" style="background-color:${d.primaryColor};">
            ${th('Action','42%',d.primaryColor)}
            ${th('Porteur','22%',d.primaryColor)}
            ${th('Échéance','18%',d.primaryColor)}
            ${th('Statut','18%',d.primaryColor)}
          </tr>
          ${actionRows}
        </table>
      </td>
    </tr>` : ''}

    <!-- ═══ POINTS STRUCTURANTS ═══ -->
    ${d.activeModules.includes('key_points') ? `<tr>
      <td style="padding:24px 32px 0;background-color:#FFFFFF;">
        ${sectionTitle(_getSectionTitle('sectionKeyPoints', 'Points structurants'))}
        ${keyPointsRendered}
      </td>
    </tr>` : ''}

    <!-- ═══ SECTIONS OPTIONNELLES ET CUSTOM (dans l'ordre DOM, layout-aware) ═══ -->
    ${(d.allVisibleSections||[]).map(s => {
      const renderedContent = _renderSectionForEmail(s, d.primaryColor);
      if (!renderedContent) return '';
      return `<tr>
        <td style="padding:24px 32px 0;background-color:#FFFFFF;">
          ${sectionTitle(s.label)}
          ${renderedContent}
        </td>
      </tr>`;
    }).join('')}

    <!-- ═══ PIED DE PAGE ═══ -->
    <tr>
      <td style="padding:20px 32px 24px;background-color:#FFFFFF;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top:2px solid ${d.primaryColor};padding-top:12px;">
          <tr>
            <td style="padding-top:12px;">
              <span style="font-family:Arial,sans-serif;font-size:11px;color:#94A3B8;">
                Rédigé par <strong style="color:#64748B;">${escHtml(d.author||'–')}</strong>
                &nbsp;·&nbsp; Généré par <strong style="color:#64748B;">${escHtml(d.orgName)} CR Master</strong>
              </span>
            </td>
            <td align="right" style="padding-top:12px;white-space:nowrap;">
              <span style="font-family:Arial,sans-serif;font-size:11px;color:#94A3B8;">${new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td></tr>
</table>

</body>
</html>`;
}

/* =====================================================
   HELPER : Titre personnalisé d'une section
   ===================================================== */
function _getSectionTitle(sectionId, defaultTitle) {
  const sect = document.getElementById(sectionId);
  if (!sect) return defaultTitle;
  const h3 = sect.querySelector('h3');
  return h3?.textContent?.trim() || defaultTitle;
}

/* =====================================================
   HELPER : Rendu graphique premium du module Planning pour l'email/PDF
   Utilise planningRows (données DOM vivant) en priorité, fallback HTML
   Outlook-safe : tout en inline styles, tables imbriquées
   ===================================================== */
function _renderPlanningForEmail(html, primaryColor, planningRows) {
  /* ── Couleurs des statuts ── */
  const STATUS_CFG = {
    todo:    { bg: '#FEF3C7', border: '#F59E0B', text: '#7C4700', label: 'À faire',  dot: '#F59E0B' },
    wip:     { bg: '#DBEAFE', border: '#3B82F6', text: '#1E3A5F', label: 'En cours', dot: '#3B82F6' },
    done:    { bg: '#D1FAE5', border: '#10B981', text: '#065F46', label: 'Terminé',  dot: '#10B981' },
    blocked: { bg: '#FEE2E2', border: '#EF4444', text: '#7F1D1D', label: 'Bloqué',   dot: '#EF4444' },
  };

  /* ── Badge statut Outlook-safe ── */
  const statusBadge = (statusVal, statusText) => {
    const key = (statusVal || '').toLowerCase().trim();
    const cfg  = STATUS_CFG[key] || STATUS_CFG['todo'];
    const lbl  = statusText || cfg.label;
    return `<table border="0" cellpadding="0" cellspacing="0" style="display:inline-table;">
      <tr>
        <td bgcolor="${cfg.bg}" style="background-color:${cfg.bg};border:1px solid ${cfg.border};border-radius:20px;padding:3px 10px 3px 8px;white-space:nowrap;">
          <table border="0" cellpadding="0" cellspacing="0" style="display:inline-table;">
            <tr>
              <td width="8" height="8" bgcolor="${cfg.dot}" style="background-color:${cfg.dot};border-radius:50%;width:8px;height:8px;line-height:8px;font-size:8px;">&nbsp;</td>
              <td style="padding-left:5px;">
                <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:${cfg.text};white-space:nowrap;">${escHtml(lbl)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  };

  /* ── Barre de progression Outlook-safe ── */
  const progressBar = (pct) => {
    const p   = Math.min(100, Math.max(0, parseInt(pct) || 0));
    const w   = Math.round(p * 1.20);
    const rem = 120 - w;
    const barColor = p >= 80 ? '#10B981' : p >= 40 ? '#3B82F6' : '#F59E0B';
    return `<table border="0" cellpadding="0" cellspacing="0" width="140" style="width:140px;">
      <tr>
        <td style="padding-bottom:3px;">
          <table border="0" cellpadding="0" cellspacing="0" width="120" height="8"
                 style="width:120px;height:8px;background-color:#E2E8F0;border-radius:6px;overflow:hidden;">
            <tr>
              <td width="${w}" height="8" bgcolor="${barColor}"
                  style="background-color:${barColor};width:${w}px;height:8px;border-radius:6px;font-size:0;line-height:0;">&nbsp;</td>
              ${rem > 0 ? `<td width="${rem}" height="8" bgcolor="#E2E8F0" style="background-color:#E2E8F0;width:${rem}px;height:8px;font-size:0;line-height:0;">&nbsp;</td>` : ''}
            </tr>
          </table>
        </td>
        <td style="padding-left:6px;white-space:nowrap;">
          <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#334155;">${p}%</span>
        </td>
      </tr>
    </table>`;
  };

  /* ── Résoudre les lignes ──
     Priorité 1 : planningRows (données DOM vivant, valeurs réelles)
     Priorité 2 : extraire depuis le HTML sérialisé (fallback)
  */
  let rows = [];

  if (planningRows && planningRows.length > 0) {
    // Données propres issues du DOM vivant
    rows = planningRows;
  } else if (html && html.trim()) {
    // Fallback : parser le HTML sérialisé
    const div = document.createElement('div');
    div.innerHTML = html;
    const tbl = div.querySelector('.mlt-planning-table, table');
    if (!tbl) return '';
    tbl.querySelectorAll('tbody tr.mlt-plan-row, tbody tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) return;
      rows.push({
        task:        cells[0]?.querySelector('input[type="text"]')?.getAttribute('value') || cells[0]?.textContent?.trim() || '',
        owner:       cells[1]?.querySelector('input[type="text"]')?.getAttribute('value') || cells[1]?.textContent?.trim() || '',
        start:       cells[2]?.querySelector('input[type="date"]')?.getAttribute('value') || '',
        end:         cells[3]?.querySelector('input[type="date"]')?.getAttribute('value') || '',
        pct:         parseInt(cells[4]?.querySelector('input[type="range"]')?.getAttribute('value') || cells[4]?.querySelector('.mlt-plan-pct-label')?.textContent?.replace('%','') || '0') || 0,
        status:      cells[5]?.querySelector('select')?.value || 'todo',
        statusLabel: cells[5]?.querySelector('option[selected]')?.textContent || cells[5]?.textContent?.trim() || 'À faire',
      });
    });
  }

  if (rows.length === 0) return '';

  const pc = primaryColor;
  const BD = '#E2E8F0'; // border color

  let out = `
  <table border="0" cellpadding="0" cellspacing="0" width="100%"
         style="border-collapse:collapse;border:1px solid ${BD};">
    <tr bgcolor="${pc}" style="background-color:${pc};">
      <td width="28%" bgcolor="${pc}" style="background-color:${pc};padding:10px 14px;">
        <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#FFFFFF !important;text-transform:uppercase;letter-spacing:0.8px;">Tâche / Étape</span></font>
      </td>
      <td width="17%" bgcolor="${pc}" style="background-color:${pc};padding:10px 14px;border-left:1px solid rgba(255,255,255,0.2);">
        <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#FFFFFF !important;text-transform:uppercase;letter-spacing:0.8px;">Responsable</span></font>
      </td>
      <td width="11%" bgcolor="${pc}" style="background-color:${pc};padding:10px 14px;border-left:1px solid rgba(255,255,255,0.2);">
        <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#FFFFFF !important;text-transform:uppercase;letter-spacing:0.8px;">Début</span></font>
      </td>
      <td width="11%" bgcolor="${pc}" style="background-color:${pc};padding:10px 14px;border-left:1px solid rgba(255,255,255,0.2);">
        <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#FFFFFF !important;text-transform:uppercase;letter-spacing:0.8px;">Fin</span></font>
      </td>
      <td width="18%" bgcolor="${pc}" style="background-color:${pc};padding:10px 14px;border-left:1px solid rgba(255,255,255,0.2);">
        <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#FFFFFF !important;text-transform:uppercase;letter-spacing:0.8px;">Avancement</span></font>
      </td>
      <td width="15%" bgcolor="${pc}" style="background-color:${pc};padding:10px 14px;border-left:1px solid rgba(255,255,255,0.2);">
        <font color="#FFFFFF"><span class="force-white" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#FFFFFF !important;text-transform:uppercase;letter-spacing:0.8px;">Statut</span></font>
      </td>
    </tr>`;

  rows.forEach((r, i) => {
    const rowBg    = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    const startFmt = r.start ? _formatDateExport(r.start) : '–';
    const endFmt   = r.end   ? _formatDateExport(r.end)   : '–';
    const task     = r.task  || '–';
    const owner    = r.owner || '–';

    out += `
    <tr bgcolor="${rowBg}" style="background-color:${rowBg};">
      <td bgcolor="${rowBg}" style="background-color:${rowBg};padding:10px 14px;border-top:1px solid ${BD};">
        <span style="font-family:Arial,sans-serif;font-size:12px;font-weight:600;color:#0F172A;">${escHtml(task)}</span>
      </td>
      <td bgcolor="${rowBg}" style="background-color:${rowBg};padding:10px 14px;border-top:1px solid ${BD};border-left:1px solid ${BD};">
        <span style="font-family:Arial,sans-serif;font-size:11px;color:#475569;">${escHtml(owner)}</span>
      </td>
      <td bgcolor="${rowBg}" style="background-color:${rowBg};padding:10px 14px;border-top:1px solid ${BD};border-left:1px solid ${BD};white-space:nowrap;">
        <span style="font-family:Arial,sans-serif;font-size:11px;color:#475569;">${escHtml(startFmt)}</span>
      </td>
      <td bgcolor="${rowBg}" style="background-color:${rowBg};padding:10px 14px;border-top:1px solid ${BD};border-left:1px solid ${BD};white-space:nowrap;">
        <span style="font-family:Arial,sans-serif;font-size:11px;color:#475569;">${escHtml(endFmt)}</span>
      </td>
      <td bgcolor="${rowBg}" style="background-color:${rowBg};padding:10px 14px;border-top:1px solid ${BD};border-left:1px solid ${BD};">
        ${progressBar(r.pct)}
      </td>
      <td bgcolor="${rowBg}" style="background-color:${rowBg};padding:10px 14px;border-top:1px solid ${BD};border-left:1px solid ${BD};">
        ${statusBadge(r.status, r.statusLabel)}
      </td>
    </tr>`;
  });

  out += `</table>`;
  return out;
}

/* Helper : formater une date ISO (YYYY-MM-DD) en DD/MM/YYYY */
function _formatDateExport(isoDate) {
  if (!isoDate) return '–';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

/* =====================================================
   HELPER : Rendu d'une section selon son layout pour l'email
   ===================================================== */
function _renderSectionForEmail(s, primaryColor) {
  // Pour le planning : vérifier planningRows, pas html
  if (s.layout === 'planning') {
    if (!s.planningRows || s.planningRows.length === 0) return '';
    return _renderPlanningForEmail(s.html, primaryColor, s.planningRows);
  }
  if (!s.html || s.html.trim() === '' || s.html.trim() === '<p><br></p>') return '';

  const bgColor     = s.bgColor     || '#F8FAFC';
  const borderColor = s.borderColor || '#E2E8F0';

  switch (s.layout) {
    case 'table': {
      // Tableau éditable → inliner les styles pour email
      const div = document.createElement('div');
      div.innerHTML = s.html;
      const tbl = div.querySelector('table');
      if (!tbl) return '';
      // Inliner les styles du tableau
      tbl.setAttribute('border', '1');
      tbl.setAttribute('cellpadding', '0');
      tbl.setAttribute('cellspacing', '0');
      tbl.setAttribute('width', '100%');
      tbl.style.borderCollapse = 'collapse';
      tbl.style.width = '100%';
      tbl.style.fontFamily = 'Arial, sans-serif';
      tbl.style.fontSize = '12px';
      tbl.querySelectorAll('th').forEach(th => {
        th.style.backgroundColor = primaryColor;
        th.style.color = '#FFFFFF';
        th.style.padding = '8px 10px';
        th.style.textAlign = 'left';
        th.style.fontWeight = '700';
        th.style.border = `1px solid ${primaryColor}`;
      });
      tbl.querySelectorAll('td').forEach((td, i) => {
        td.style.padding = '7px 10px';
        td.style.border = '1px solid #E2E8F0';
        td.style.color = '#334155';
        td.style.backgroundColor = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      });
      return `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="overflow-x:auto;">${div.innerHTML}</td>
      </tr></table>`;
    }

    case 'planning': {
      // déjà géré en haut de la fonction
      return _renderPlanningForEmail(s.html, primaryColor, s.planningRows);
    }

    case 'image': {
      // Image avec légende
      return s.html; // Déjà en HTML figure/img
    }

    case 'text':
    default: {
      const sanitized = sanitizeQuillForEmail(s.html);
      if (!sanitized || sanitized.trim() === '') return '';
      return `<table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td bgcolor="${bgColor}" style="background-color:${bgColor};padding:16px 18px;border:1px solid ${borderColor};font-family:Arial,sans-serif;font-size:13px;color:#334155;line-height:1.75;">
            ${sanitized}
          </td>
        </tr>
      </table>`;
    }
  }
}

/* =====================================================
   NETTOYER LE HTML QUILL POUR L'EMAIL
   Inline les styles de base (gras, italique, couleurs…)
   ===================================================== */
function sanitizeQuillForEmail(html) {
  if (!html || html.trim() === '<p><br></p>') return '';

  // Créer un DOM temporaire
  const div = document.createElement('div');
  div.innerHTML = html;

  // ──────────────────────────────────────────────────────────────
  // Quill 2.0 utilise <ol> + <li data-list="bullet|ordered"> au lieu
  // des vraies <ul>/<li> HTML. Outlook ignore ces data-attributes et
  // affiche une liste numérotée (ou rien). On convertit en vraies
  // <ul>/<ol> avec <li> standard AVANT d'appliquer les styles inline.
  // ──────────────────────────────────────────────────────────────
  div.querySelectorAll('ol').forEach(ol => {
    const items = Array.from(ol.children).filter(c => c.tagName === 'LI');
    if (items.length === 0) return;
    // Détecter si TOUS les <li> sont data-list="bullet" → convertir en <ul>
    const allBullet = items.every(li => li.getAttribute('data-list') === 'bullet');
    const hasMixed  = items.some(li => li.getAttribute('data-list') === 'bullet') && !allBullet;

    if (allBullet) {
      // Remplacer le <ol> par un <ul>
      const ul = document.createElement('ul');
      items.forEach(li => {
        const newLi = document.createElement('li');
        newLi.innerHTML = li.innerHTML;
        ul.appendChild(newLi);
      });
      ol.replaceWith(ul);
    } else if (hasMixed) {
      // Cas rare : mélange bullet + ordered dans le même <ol>.
      // On éclate en plusieurs listes successives.
      const fragment = document.createDocumentFragment();
      let currentList = null;
      let currentType = null;
      items.forEach(li => {
        const type = li.getAttribute('data-list') === 'bullet' ? 'ul' : 'ol';
        if (type !== currentType) {
          currentList = document.createElement(type);
          fragment.appendChild(currentList);
          currentType = type;
        }
        const newLi = document.createElement('li');
        newLi.innerHTML = li.innerHTML;
        currentList.appendChild(newLi);
      });
      ol.replaceWith(fragment);
    } else {
      // Tous ordered → nettoyer les data-list inutiles
      items.forEach(li => li.removeAttribute('data-list'));
    }
  });

  // Les <ul> natifs (rare avec Quill mais possible) : nettoyer data-list
  div.querySelectorAll('ul li[data-list]').forEach(li => {
    li.removeAttribute('data-list');
  });

  // Supprimer les <span class="ql-ui"> qui contiennent les pseudo-puces Quill
  div.querySelectorAll('.ql-ui, span.ql-ui').forEach(el => el.remove());

  // Appliquer styles inline sur les éléments courants
  div.querySelectorAll('p').forEach(el => {
    el.style.margin = '0 0 8px 0';
    el.style.fontFamily = 'Arial, sans-serif';
    el.style.fontSize   = '13px';
    el.style.color      = '#334155';
    el.style.lineHeight = '1.75';
  });

  div.querySelectorAll('strong, b').forEach(el => {
    el.style.fontWeight = '700';
    el.style.color      = '#0F172A';
  });

  div.querySelectorAll('em, i').forEach(el => {
    el.style.fontStyle = 'italic';
  });

  div.querySelectorAll('ul').forEach(el => {
    el.style.margin        = '8px 0 8px 0';
    el.style.paddingLeft   = '24px';
    el.style.fontFamily    = 'Arial, sans-serif';
    el.style.fontSize      = '13px';
    el.style.color         = '#334155';
    el.style.listStyleType = 'disc';
    // Outlook-specific : force mso list format
    el.setAttribute('type', 'disc');
  });

  div.querySelectorAll('ol').forEach(el => {
    el.style.margin        = '8px 0 8px 0';
    el.style.paddingLeft   = '24px';
    el.style.fontFamily    = 'Arial, sans-serif';
    el.style.fontSize      = '13px';
    el.style.color         = '#334155';
    el.style.listStyleType = 'decimal';
    el.setAttribute('type', '1');
  });

  div.querySelectorAll('li').forEach(el => {
    el.style.marginBottom = '4px';
    el.style.fontFamily   = 'Arial, sans-serif';
    el.style.fontSize     = '13px';
    el.style.color        = '#334155';
    el.style.lineHeight   = '1.6';
    // Crucial pour Outlook : sans display:list-item, les puces disparaissent parfois
    el.style.display      = 'list-item';
  });

  div.querySelectorAll('h1').forEach(el => {
    el.style.fontSize   = '18px';
    el.style.fontWeight = '800';
    el.style.color      = '#0F172A';
    el.style.margin     = '16px 0 8px';
    el.style.fontFamily = 'Arial, sans-serif';
  });

  div.querySelectorAll('h2').forEach(el => {
    el.style.fontSize   = '15px';
    el.style.fontWeight = '700';
    el.style.color      = '#1E293B';
    el.style.margin     = '14px 0 6px';
    el.style.fontFamily = 'Arial, sans-serif';
  });

  div.querySelectorAll('h3').forEach(el => {
    el.style.fontSize   = '13px';
    el.style.fontWeight = '700';
    el.style.color      = '#334155';
    el.style.margin     = '10px 0 4px';
    el.style.fontFamily = 'Arial, sans-serif';
  });

  div.querySelectorAll('a').forEach(el => {
    el.style.color          = '#2563EB';
    el.style.textDecoration = 'underline';
  });

  div.querySelectorAll('blockquote').forEach(el => {
    el.style.borderLeft  = '4px solid #CBD5E1';
    el.style.paddingLeft = '12px';
    el.style.color       = '#64748B';
    el.style.margin      = '8px 0';
    el.style.fontStyle   = 'italic';
    el.style.fontFamily  = 'Arial, sans-serif';
    el.style.fontSize    = '13px';
  });

  return div.innerHTML;
}

/* =====================================================
   EXPORT EMAIL
   Stratégie : copier en tant que rich-text HTML dans le
   presse-papier via ClipboardItem (text/html).
   Outlook et la plupart des clients email collent
   alors le contenu mis en forme, pas le code source.
   ===================================================== */
async function exportEmail() {
  const d = buildCRData();
  if (!d.mission && !d.meeting) {
    showToast(t('export_fill_mission'), 'warning');
    return;
  }

  // Charger le logo en base64 avant de générer le HTML
  d.logoSrc = await getLogoBase64();

  const html = generateEmailHTML(d);

  // ---- Aperçu dans iframe ----
  document.getElementById('emailPreviewWrap').innerHTML = `
    <div style="font-size:.8rem;color:var(--gray-500);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
      <i class="fa-solid fa-eye"></i> Aperçu du rendu :
    </div>
    <iframe id="emailPreviewFrame"
      style="width:100%;height:360px;border:1px solid #E2E8F0;border-radius:6px;background:#fff;"
      sandbox="allow-same-origin"></iframe>`;

  openModal('modalEmailCopy');

  setTimeout(() => {
    const frame = document.getElementById('emailPreviewFrame');
    if (frame) {
      frame.contentDocument.open();
      frame.contentDocument.write(html);
      frame.contentDocument.close();
    }
  }, 80);

  // ---- Bouton Copier ----
  document.getElementById('btnCopyHTML').onclick = async () => {
    try {
      /* Méthode 1 : ClipboardItem avec text/html
         → Le client email (Outlook, Gmail…) colle le RENDU, pas le code */
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        const blob = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': blob })
        ]);
        showToast(t('export_email_ok'), 'success');
        return;
      }
    } catch (e) {
      console.warn('ClipboardItem non supporté, fallback activé:', e);
    }

    /* Méthode 2 : Copie via un iframe "contenteditable" dans le DOM
       → Alternative quand ClipboardItem échoue (Firefox, anciens navigateurs) */
    try {
      const iframe = document.getElementById('emailPreviewFrame');
      if (iframe) {
        iframe.contentDocument.body.contentEditable = true;
        const iframeWin = iframe.contentWindow;
        iframeWin.focus();
        iframeWin.document.execCommand('selectAll');
        const ok = iframeWin.document.execCommand('copy');
        iframe.contentDocument.body.contentEditable = false;
        if (ok) {
          showToast(t('export_email_ok2'), 'success');
          return;
        }
      }
    } catch (e2) {
      console.warn('Fallback iframe copie échoué:', e2);
    }

    /* Méthode 3 : Copie du code HTML source (dernier recours) */
    try {
      await navigator.clipboard.writeText(html);
      showToast(t('export_html_copied'), 'warning');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = html;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(t('export_html_fallback'), 'warning');
    }
  };
}

/* =====================================================
   EXPORT PDF — via une fenêtre d'impression dédiée
   (print window + CSS @media print intégré)
   Plus fiable que html2pdf.js sur tous les navigateurs.
   ===================================================== */
async function exportPDF() {
  const d = buildCRData();
  if (!d.mission && !d.meeting) {
    showToast(t('export_fill_mission'), 'warning');
    return;
  }

  // Charger le logo en base64
  d.logoSrc = await getLogoBase64();

  const emailHTML = generateEmailHTML(d);

  // Injecter un CSS @media print optimisé pour A4
  const printCSS = `
    <style>
      @media print {
        @page { size: A4 portrait; margin: 10mm 12mm; }
        body { margin:0; padding:0; background:#fff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        table { page-break-inside: auto; }
        tr    { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
      }
    </style>`;

  // Injecter le CSS dans le <head> du HTML généré
  const printableHTML = emailHTML.replace('</head>', printCSS + '</head>');

  // Ouvrir une nouvelle fenêtre
  const printWin = window.open('', '_blank', 'width=820,height=1000,scrollbars=yes');
  if (!printWin) {
    showToast(t('export_popup_blocked'), 'error');
    return;
  }

  printWin.document.open();
  printWin.document.write(printableHTML);
  printWin.document.close();

  // Attendre que les ressources soient chargées
  printWin.onload = () => {
    setTimeout(() => {
      printWin.focus();
      printWin.print();
      // Ne pas fermer automatiquement — l'utilisateur choisit "Enregistrer en PDF"
    }, 400);
  };

  showToast(t('export_pdf_open'), 'info');
}

/* =====================================================
   EXPORT WORD (.docx via docx.js) — version améliorée
   ===================================================== */
async function exportWord() {
  const d = buildCRData();
  if (!d.mission && !d.meeting) {
    showToast(t('export_fill_mission'), 'warning');
    return;
  }

  // Charger le logo en base64
  d.logoSrc = await getLogoBase64();

  try {
  showToast(t('export_word_generating'), 'info');

    const {
      Document, Packer, Paragraph, Table, TableRow, TableCell,
      TextRun, AlignmentType, WidthType, BorderStyle,
      ShadingType, HeightRule, TableBorders, Header,
      ImageRun, convertInchesToTwip, UnderlineType
    } = docx;

    const primaryHex  = d.primaryColor.replace('#', '');
    const accentHex   = d.accentColor.replace('#', '');
    const grayLight   = 'F1F5F9';
    const grayMid     = 'CBD5E1';
    const grayDark    = '64748B';
    const textDark    = '0F172A';
    const textMid     = '334155';
    const textLight   = '94A3B8';

    // Police Word : utiliser celle du template projet si disponible
    const wordSafeFonts = ['Arial', 'Helvetica Neue', 'Calibri', 'Roboto', 'Open Sans', 'Lato',
      'Montserrat', 'Raleway', 'Poppins', 'Georgia', 'Merriweather', 'Source Sans 3'];
    const wordFont = (d.fontFamily && wordSafeFonts.includes(d.fontFamily)) ? d.fontFamily : 'Arial';

    /* ---- Helpers ---- */
    const twip = n => convertInchesToTwip ? convertInchesToTwip(n) : n * 1440;
    const pt   = n => n * 2; // half-points

    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' };
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder };

    const thickBorderBottom = (color) => ({
      top:     noBorder,
      left:    noBorder,
      right:   noBorder,
      bottom:  { style: BorderStyle.SINGLE, size: 6, color },
      insideH: noBorder,
      insideV: noBorder,
    });

    /* ---- En-tête colorée (bandeau) ---- */
    const buildHeaderBand = () => new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          height: { value: 400, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: primaryHex, color: primaryHex },
              borders: noBorders,
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [new Paragraph({
                children: [new TextRun({ text: d.orgName, bold: true, size: pt(18), color: 'FFFFFF', font: wordFont })],
                spacing: { before: 60, after: 60 },
                indent: { left: 200 },
              })],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: primaryHex, color: primaryHex },
              borders: noBorders,
              width: { size: 30, type: WidthType.PERCENTAGE },
              children: [new Paragraph({
                children: [new TextRun({ text: 'COMPTE-RENDU DE RÉUNION', bold: true, size: pt(9), color: 'FFFFFF', font: wordFont })],
                alignment: AlignmentType.RIGHT,
                spacing: { before: 60, after: 60 },
                indent: { right: 200 },
              })],
            }),
          ],
        }),
        new TableRow({
          height: { value: 480, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: accentHex, color: accentHex },
              borders: noBorders,
              columnSpan: 2,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: d.meeting || 'Réunion sans titre', bold: true, size: pt(16), color: 'FFFFFF', font: wordFont })],
                  spacing: { before: 80, after: 40 },
                  indent: { left: 200 },
                }),
                new Paragraph({
                  children: [new TextRun({ text: d.mission || '', size: pt(11), color: 'FFE8F4', font: wordFont })],
                  spacing: { before: 0, after: 80 },
                  indent: { left: 200 },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    /* ---- Tableau méta-données ---- */
    const metaCell = (label, value) => new TableCell({
      borders: { top: noBorder, left: noBorder, right: noBorder, bottom: { style: BorderStyle.SINGLE, size: 1, color: grayMid }, insideH: noBorder, insideV: noBorder },
      shading: { type: ShadingType.SOLID, fill: grayLight },
      children: [
        new Paragraph({ children: [new TextRun({ text: label.toUpperCase(), size: pt(8), color: textLight, font: wordFont })], spacing: { before: 80, after: 30 } }),
        new Paragraph({ children: [new TextRun({ text: value || '–', bold: true, size: pt(11), color: textMid, font: wordFont })], spacing: { before: 0, after: 80 } }),
      ],
    });

    const metaTable = () => new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [new TableRow({
        children: [
          metaCell(t('date'),       d.date ? formatDate(d.date) : '–'),
          metaCell(t('location'),   d.location || '–'),
          metaCell(t('facilitator'),d.facilitator || '–'),
          metaCell(t('status'),     { draft: t('draft'), final: t('final'), archived: t('archived') }[d.status] || t('draft')),
          metaCell(t('author'),     d.author || '–'),
        ],
      })],
    });

    /* ---- En-tête de section ---- */
    const sectionTitle = (text) => {
      const titlePara = new Paragraph({
        children: [
          new TextRun({ text: '', size: pt(2) }),
        ],
        spacing: { before: 400, after: 0 },
      });
      const titleBar = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [new TableRow({
          height: { value: 340, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: primaryHex, color: primaryHex },
              borders: noBorders,
              width: { size: 4, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [] })],
            }),
            new TableCell({
              borders: noBorders,
              shading: { type: ShadingType.SOLID, fill: grayLight, color: grayLight },
              children: [new Paragraph({
                children: [new TextRun({ text: text.toUpperCase(), bold: true, size: pt(12), color: textDark, font: wordFont })],
                spacing: { before: 80, after: 80 },
                indent: { left: 120 },
              })],
            }),
          ],
        })],
      });
      return [titlePara, titleBar];
    };

    /* ---- Tableau participants ---- */
    const _wInitials = (name) => {
      const parts = (name||'').trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
      return (parts[0]||'?').substring(0,2).toUpperCase();
    };
    const _wAvatarColor = (name) => {
      const cols = ['002D72','E8007D','0050B3','6366F1','8B5CF6','059669','D97706','DC2626'];
      let h = 0; for (let i=0;i<(name||'').length;i++) h=(name.charCodeAt(i)+((h<<5)-h))|0;
      return cols[Math.abs(h)%cols.length];
    };
    const buildParticipantsTable = () => {
      const headerCols = ['', 'Nom', 'Société / Entité', 'Rôle'];
      const headerWidths = [8, 30, 32, 30]; // %
      const headerRow = new TableRow({
        tableHeader: true,
        height: { value: 320, rule: HeightRule.EXACT },
        children: headerCols.map((h, ci) => new TableCell({
          shading: { type: ShadingType.SOLID, fill: primaryHex, color: primaryHex },
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' }, insideH: noBorder, insideV: noBorder },
          width: { size: headerWidths[ci], type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: pt(9), color: 'FFFFFF', font: wordFont })],
            spacing: { before: 60, after: 60 },
            indent: { left: 100 },
          })],
        })),
      });

      const dataRows = d.participants.length > 0
        ? d.participants.map((p, i) => {
            const bgFill = i%2===0 ? 'FFFFFF' : grayLight;
            const avatarColor = _wAvatarColor(p.name);
            const initials    = _wInitials(p.name);
            const borderBot = { style: BorderStyle.SINGLE, size: 1, color: grayMid };
            const cellBorders = { top: noBorder, bottom: borderBot, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder };
            return new TableRow({
              height: { value: 360, rule: HeightRule.AT_LEAST },
              children: [
                // Colonne avatar (initiales colorées)
                new TableCell({
                  shading: { type: ShadingType.SOLID, fill: avatarColor, color: avatarColor },
                  borders: cellBorders,
                  width: { size: 8, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({
                    children: [new TextRun({ text: initials, bold: true, size: pt(9), color: 'FFFFFF', font: wordFont })],
                    alignment: 'center',
                    spacing: { before: 80, after: 80 },
                  })],
                }),
                // Nom, Société, Rôle
                ...[p.name, p.company||'', p.role||''].map(val => new TableCell({
                  shading: { type: ShadingType.SOLID, fill: bgFill },
                  borders: cellBorders,
                  children: [new Paragraph({
                    children: [new TextRun({ text: val, size: pt(10), color: textMid, font: wordFont })],
                    spacing: { before: 60, after: 60 },
                    indent: { left: 100 },
                  })],
                })),
              ],
            });
          })
        : [new TableRow({
            children: [new TableCell({
              columnSpan: 4,
              borders: noBorders,
              children: [new Paragraph({ children: [new TextRun({ text: 'Aucun participant renseigné', italics: true, size: pt(10), color: textLight, font: wordFont })] })],
            })],
          })];

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [headerRow, ...dataRows],
      });
    };

    /* ---- Tableau actions ---- */
    const actionStatusLabels = { todo: t('todo'), wip: t('in_progress'), done: t('done'), blocked: t('blocked') };
    const actionStatusColors = { todo:'D97706', wip: primaryHex.replace('#',''), done:'059669', blocked:'DC2626' };

    const buildActionsTable = () => {
      const headerRow = new TableRow({
        tableHeader: true,
        height: { value: 320, rule: HeightRule.EXACT },
        children: ['Action', 'Porteur', 'Échéance', 'Statut'].map(h => new TableCell({
          shading: { type: ShadingType.SOLID, fill: primaryHex, color: primaryHex },
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' }, insideH: noBorder, insideV: noBorder },
          children: [new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: pt(9), color: 'FFFFFF', font: wordFont })],
            spacing: { before: 60, after: 60 },
            indent: { left: 100 },
          })],
        })),
      });

      const dataRows = d.actions.length > 0
        ? d.actions.map((a, i) => new TableRow({
            height: { value: 300, rule: HeightRule.AT_LEAST },
            children: [
              // Action
              new TableCell({
                shading: { type: ShadingType.SOLID, fill: i%2===0 ? 'FFFFFF' : grayLight },
                borders: { top: noBorder, bottom: { style: BorderStyle.SINGLE, size: 1, color: grayMid }, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
                children: [new Paragraph({ children: [new TextRun({ text: a.action, size: pt(10), color: textMid, font: wordFont })], spacing: { before: 60, after: 60 }, indent: { left: 100 } })],
              }),
              // Porteur
              new TableCell({
                shading: { type: ShadingType.SOLID, fill: i%2===0 ? 'FFFFFF' : grayLight },
                borders: { top: noBorder, bottom: { style: BorderStyle.SINGLE, size: 1, color: grayMid }, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
                children: [new Paragraph({ children: [new TextRun({ text: a.owner||'', size: pt(10), color: textMid, font: wordFont })], spacing: { before: 60, after: 60 }, indent: { left: 100 } })],
              }),
              // Échéance
              new TableCell({
                shading: { type: ShadingType.SOLID, fill: i%2===0 ? 'FFFFFF' : grayLight },
                borders: { top: noBorder, bottom: { style: BorderStyle.SINGLE, size: 1, color: grayMid }, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
                children: [new Paragraph({ children: [new TextRun({ text: a.due ? formatDate(a.due) : '–', size: pt(10), color: textMid, font: wordFont })], spacing: { before: 60, after: 60 }, indent: { left: 100 } })],
              }),
              // Statut avec couleur de fond
              new TableCell({
                shading: { type: ShadingType.SOLID, fill: i%2===0 ? 'FFFFFF' : grayLight },
                borders: { top: noBorder, bottom: { style: BorderStyle.SINGLE, size: 1, color: grayMid }, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
                children: [new Paragraph({
                  children: [new TextRun({ text: actionStatusLabels[a.status]||'À faire', bold: true, size: pt(9), color: actionStatusColors[a.status]||'D97706', font: wordFont })],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 60, after: 60 },
                })],
              }),
            ],
          }))
        : [new TableRow({
            children: [new TableCell({
              columnSpan: 4,
              borders: noBorders,
              children: [new Paragraph({ children: [new TextRun({ text: 'Aucune action renseignée', italics: true, size: pt(10), color: textLight, font: wordFont })] })],
            })],
          })];

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [headerRow, ...dataRows],
      });
    };

    /* ---- Key points : conversion HTML → paragraphes Word ---- */
    const htmlToWordParagraphs = (html) => {
      if (!html || html.trim() === '<p><br></p>') {
        return [new Paragraph({ children: [new TextRun({ text: 'Aucun contenu renseigné.', italics: true, color: textLight, size: pt(10), font: wordFont })] })];
      }

      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const paras = [];

      const processNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        return node.innerText || node.textContent || '';
      };

      tmp.childNodes.forEach(node => {
        const tag = node.nodeName.toLowerCase();
        const text = processNode(node).trim();

        if (!text && tag !== 'br') return;

        if (tag === 'h1') {
          paras.push(new Paragraph({ children: [new TextRun({ text, bold: true, size: pt(16), color: textDark, font: wordFont })], spacing: { before: 240, after: 120 } }));
        } else if (tag === 'h2') {
          paras.push(new Paragraph({ children: [new TextRun({ text, bold: true, size: pt(13), color: primaryHex, font: wordFont })], spacing: { before: 200, after: 80 } }));
        } else if (tag === 'h3') {
          paras.push(new Paragraph({ children: [new TextRun({ text, bold: true, size: pt(11), color: textMid, font: wordFont })], spacing: { before: 160, after: 60 } }));
        } else if (tag === 'ul') {
          node.querySelectorAll('li').forEach(li => {
            paras.push(new Paragraph({
              children: [new TextRun({ text: li.innerText||li.textContent||'', size: pt(10), color: textMid, font: wordFont })],
              bullet: { level: 0 },
              spacing: { before: 40, after: 40 },
            }));
          });
        } else if (tag === 'ol') {
          node.querySelectorAll('li').forEach((li, idx) => {
            paras.push(new Paragraph({
              children: [new TextRun({ text: li.innerText||li.textContent||'', size: pt(10), color: textMid, font: wordFont })],
              numbering: { reference: 'default-numbering', level: 0 },
              spacing: { before: 40, after: 40 },
            }));
          });
        } else if (tag === 'blockquote') {
          paras.push(new Paragraph({
            children: [new TextRun({ text, italics: true, size: pt(10), color: grayDark, font: wordFont })],
            indent: { left: 400 },
            border: { left: { style: BorderStyle.SINGLE, size: 8, color: grayMid } },
            spacing: { before: 80, after: 80 },
          }));
        } else {
          // p, div, span, etc.
          const runs = [];
          node.childNodes.forEach(child => {
            const childTag = child.nodeName.toLowerCase();
            const childText = child.innerText || child.textContent || '';
            if (!childText) return;
            if (childTag === 'strong' || childTag === 'b') {
              runs.push(new TextRun({ text: childText, bold: true, size: pt(10), color: textDark, font: wordFont }));
            } else if (childTag === 'em' || childTag === 'i') {
              runs.push(new TextRun({ text: childText, italics: true, size: pt(10), color: textMid, font: wordFont }));
            } else if (childTag === 'u') {
              runs.push(new TextRun({ text: childText, underline: { type: UnderlineType.SINGLE }, size: pt(10), color: textMid, font: wordFont }));
            } else {
              runs.push(new TextRun({ text: childText, size: pt(10), color: textMid, font: wordFont }));
            }
          });
          if (runs.length === 0 && text) runs.push(new TextRun({ text, size: pt(10), color: textMid, font: wordFont }));
          if (runs.length > 0) {
            paras.push(new Paragraph({ children: runs, spacing: { before: 40, after: 80 } }));
          }
        }
      });

      return paras.length > 0 ? paras : [
        new Paragraph({ children: [new TextRun({ text: 'Aucun contenu renseigné.', italics: true, color: textLight, size: pt(10), font: wordFont })] })
      ];
    };

    const keyPointParas = htmlToWordParagraphs(d.keyPointsHTML);

    /* ---- Helper : construire un tableau Planning Word stylisé ---- */
    const buildPlanningWordTable = (planningRows, htmlFallback) => {
      // Utiliser planningRows (données DOM vivant) en priorité
      let rows = planningRows && planningRows.length > 0 ? planningRows : null;

      // Fallback : extraire depuis le HTML sérialisé
      if (!rows && htmlFallback) {
        const tmpDiv = document.createElement('div');
        tmpDiv.innerHTML = htmlFallback;
        const planTbl = tmpDiv.querySelector('.mlt-planning-table, table');
        if (planTbl) {
          rows = [];
          planTbl.querySelectorAll('tbody tr.mlt-plan-row, tbody tr').forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 2) return;
            rows.push({
              task:        cells[0]?.querySelector('input')?.getAttribute('value') || cells[0]?.textContent?.trim() || '',
              owner:       cells[1]?.querySelector('input')?.getAttribute('value') || cells[1]?.textContent?.trim() || '',
              start:       cells[2]?.querySelector('input')?.getAttribute('value') || '',
              end:         cells[3]?.querySelector('input')?.getAttribute('value') || '',
              pct:         parseInt(cells[4]?.querySelector('input[type="range"]')?.getAttribute('value') || '0') || 0,
              status:      'todo',
              statusLabel: cells[5]?.querySelector('option[selected]')?.textContent || 'À faire',
            });
          });
        }
      }

      if (!rows || rows.length === 0) return null;

      const STATUS_COLORS = {
        todo:    { fill: 'FEF3C7', text: '7C4700' },
        wip:     { fill: 'DBEAFE', text: '1E3A5F' },
        done:    { fill: 'D1FAE5', text: '065F46' },
        blocked: { fill: 'FEE2E2', text: '7F1D1D' },
      };

      const mkCell = (children, fillHex, width, center=false) => new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, fill: fillHex, color: fillHex },
        borders: {
          top:     { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          bottom:  { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          left:    { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          right:   { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          insideH: noBorder,
          insideV: noBorder,
        },
        children: [new Paragraph({
          children,
          alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { before: 60, after: 60 },
          indent: { left: 80, right: 40 },
        })],
      });

      // Ligne d'en-tête
      const headers = ['Tâche / Étape', 'Responsable', 'Début', 'Fin', 'Avancement', 'Statut'];
      const widths  = [28, 18, 11, 11, 18, 14];
      const headerRow = new TableRow({
        height: { value: 400, rule: HeightRule.AT_LEAST },
        tableHeader: true,
        children: headers.map((h, idx) => mkCell(
          [new TextRun({ text: h, bold: true, size: pt(9), color: 'FFFFFF', font: wordFont, allCaps: true })],
          primaryHex, widths[idx]
        )),
      });

      // Lignes de données
      const dataRows = rows.map((r, i) => {
        const task  = r.task  || '–';
        const owner = r.owner || '–';
        const start = r.start ? _formatDateExport(r.start) : '–';
        const end   = r.end   ? _formatDateExport(r.end)   : '–';
        const p     = Math.min(100, Math.max(0, parseInt(r.pct) || 0));
        const statusLbl = r.statusLabel || r.status || 'À faire';
        const rowBg = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        const sCfg  = STATUS_COLORS[r.status] || STATUS_COLORS['todo'];
        const pctColor = p >= 80 ? '065F46' : p >= 40 ? '1E3A5F' : '7C4700';

        return new TableRow({
          height: { value: 340, rule: HeightRule.AT_LEAST },
          children: [
            mkCell([new TextRun({ text: task,     bold: true, size: pt(10), color: textDark, font: wordFont })], rowBg, 28),
            mkCell([new TextRun({ text: owner,    size: pt(9), color: textMid,  font: wordFont })], rowBg, 18),
            mkCell([new TextRun({ text: start,    size: pt(9), color: grayDark, font: wordFont })], rowBg, 11),
            mkCell([new TextRun({ text: end,      size: pt(9), color: grayDark, font: wordFont })], rowBg, 11),
            mkCell([new TextRun({ text: `${p}%`,  bold: true,  size: pt(9), color: pctColor,  font: wordFont })], rowBg, 18),
            mkCell([new TextRun({ text: statusLbl, bold: true, size: pt(9), color: sCfg.text,  font: wordFont })], sCfg.fill, 14, true),
          ],
        });
      });

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:     { style: BorderStyle.SINGLE, size: 2, color: primaryHex },
          bottom:  { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
          left:    { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
          right:   { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
          insideH: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          insideV: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
        },
        rows: [headerRow, ...dataRows],
      });
    };

    /* ---- Résoudre chaque section optionnelle selon son layout ---- */
    const _resolveWordSection = (htmlContent, layout, planningRows) => {
      if (layout === 'planning') {
        const planTable = buildPlanningWordTable(planningRows, htmlContent);
        return planTable ? [planTable] : null;
      }
      return htmlContent ? htmlToWordParagraphs(htmlContent) : null;
    };

    /* ---- Sections optionnelles ---- */
    const decisionsParas  = d.activeModules.includes('decisions')  && (d.decisionsHTML  || d.decisionsPlanningRows?.length)  ? _resolveWordSection(d.decisionsHTML,  d.decisionsLayout,  d.decisionsPlanningRows)  : null;
    const risksParas      = d.activeModules.includes('risks')      && (d.risksHTML      || d.risksPlanningRows?.length)      ? _resolveWordSection(d.risksHTML,      d.risksLayout,      d.risksPlanningRows)      : null;
    const budgetParas     = d.activeModules.includes('budget')     && (d.budgetHTML     || d.budgetPlanningRows?.length)     ? _resolveWordSection(d.budgetHTML,     d.budgetLayout,     d.budgetPlanningRows)     : null;
    const nextStepsParas  = d.activeModules.includes('next_steps') && (d.nextStepsHTML  || d.nextStepsPlanningRows?.length)  ? _resolveWordSection(d.nextStepsHTML,  d.nextStepsLayout,  d.nextStepsPlanningRows)  : null;
    const customParasArr  = (d.customSections||[])
      .map(s => {
        const items = _resolveWordSection(s.content, s.layout, s.planningRows);
        return items ? { title: s.title, paras: items } : null;
      }).filter(Boolean);

    const spacer = () => new Paragraph({ children: [], spacing: { before: 80, after: 80 } });

    /* ---- Footer ---- */
    const footerPara = new Paragraph({
      children: [
        new TextRun({ text: `Rédigé par ${d.author||'–'}  ·  ${new Date().toLocaleDateString('fr-FR')}  ·  ${d.orgName} CR Master`, size: pt(8), color: textLight, italics: true, font: wordFont }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: primaryHex } },
    });

    /* ---- Assemblage du document ---- */
    const doc = new Document({
      creator:  d.orgName,
      title:    `CR – ${d.meeting}`,
      description: `Compte-rendu de réunion généré par ${d.orgName} CR Master`,
      numbering: {
        config: [{
          reference: 'default-numbering',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }],
        }],
      },
      sections: [{
        properties: {
          page: {
            margin: { top: twip(0.6), bottom: twip(0.7), left: twip(0.8), right: twip(0.8) },
          },
        },
        children: [
          buildHeaderBand(),
          new Paragraph({ children: [new TextRun({ text: '', size: 4 })], spacing: { before: 0, after: 160 } }),
          metaTable(),
          ...(d.activeModules.includes('participants') ? [
            ...sectionTitle('Participants'),
            spacer(),
            buildParticipantsTable(),
          ] : []),
          ...(d.activeModules.includes('actions') ? [
            ...sectionTitle('Suivi des actions'),
            spacer(),
            buildActionsTable(),
          ] : []),
          ...(d.activeModules.includes('key_points') ? [
            ...sectionTitle('Points structurants'),
            spacer(),
            ...keyPointParas,
          ] : []),
          ...(decisionsParas ? [
            ...sectionTitle('Décisions'),
            spacer(),
            ...decisionsParas,
          ] : []),
          ...(risksParas ? [
            ...sectionTitle('Risques'),
            spacer(),
            ...risksParas,
          ] : []),
          ...(budgetParas ? [
            ...sectionTitle('Budget'),
            spacer(),
            ...budgetParas,
          ] : []),
          ...(nextStepsParas ? [
            ...sectionTitle('Prochaines étapes'),
            spacer(),
            ...nextStepsParas,
          ] : []),
          ...customParasArr.flatMap(cs => [
            ...sectionTitle(cs.title),
            spacer(),
            ...cs.paras,
          ]),
          footerPara,
        ],
      }],
    });

    Packer.toBlob(doc).then(blob => {
      const filename = `CR_${sanitizeFilename(d.meeting||'reunion')}_${d.date||today()}.docx`;
      // Utiliser FileSaver.saveAs si disponible, sinon fallback natif
      if (typeof saveAs === 'function') {
        saveAs(blob, filename);
      } else {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      }
      showToast(t('export_word_ok'), 'success');
    }).catch(err => {
      console.error('Packer error:', err);
      showToast(t('export_word_error'), 'error');
    });

  } catch(err) {
    console.error('Export Word error:', err);
    showToast(t('export_word_error') + ': ' + err.message, 'error');
  }
}

/* =====================================================
   UTILITAIRES
   ===================================================== */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9\u00C0-\u024F\-_]/g,'_').substring(0,60);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

window.exportEmail = exportEmail;
window.exportWord  = exportWord;
window.exportPDF   = exportPDF;
