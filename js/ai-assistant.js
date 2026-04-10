/* =====================================================
   WAVESTONE CR MASTER – ai-assistant.js
   Assistant IA propulsé par NVIDIA NIM.
   Communication via le proxy Cloudflare /api/ai/nim
   (clé API jamais exposée au navigateur).

   Fonctions principales :
   - Menu contextuel "✨ IA" sur chaque éditeur Quill
     (reformuler, raccourcir, développer, corriger, traduire)
   - Extraction automatique d'actions depuis du texte brut
   - Génération d'un CR complet depuis des notes brutes
   - Résumé exécutif / points clés
   - Streaming SSE en direct dans un panneau dédié
   ===================================================== */

'use strict';

/* =====================================================
   STATE IA
   ===================================================== */
const AI = {
  endpoint:       'api/ai/nim',
  models:         [],               // catalogue chargé depuis GET /api/ai/nim
  defaultModel:   'meta/llama-3.3-70b-instruct',
  currentModel:   null,             // surchargé depuis localStorage
  configured:     false,            // true si clé API présente côté serveur
  _activeQuill:   null,             // éditeur ciblé par la dernière action
  _activeSelection: null,           // plage sélectionnée avant action
  _running:       false,            // true si un appel IA est en cours
};

/* =====================================================
   INIT — charge le catalogue au démarrage
   ===================================================== */
async function aiInit() {
  // Préférence utilisateur
  try {
    const saved = localStorage.getItem('wv_ai_model');
    if (saved) AI.currentModel = saved;
  } catch {}

  try {
    const r = await fetch(AI.endpoint, { headers: { 'Content-Type': 'application/json' } });
    if (r.ok) {
      const data = await r.json();
      AI.models     = Array.isArray(data.models) ? data.models : [];
      AI.configured = Boolean(data.configured);

      // Si le modèle mémorisé n'existe PLUS dans le catalogue (modèle
      // déprécié côté NVIDIA), on bascule sur le modèle par défaut pour
      // éviter les erreurs 404 lors des appels.
      if (AI.currentModel && AI.models.length) {
        const stillExists = AI.models.some(m => m.id === AI.currentModel);
        if (!stillExists) {
          console.warn('[AI] Modèle mémorisé obsolète :', AI.currentModel, '→ fallback');
          AI.currentModel = null;
          try { localStorage.removeItem('wv_ai_model'); } catch {}
        }
      }

      if (!AI.currentModel) {
        const def = AI.models.find(m => m.default) || AI.models[0];
        AI.currentModel = def ? def.id : AI.defaultModel;
      }
    }
  } catch (e) {
    console.warn('[AI] Catalogue indisponible :', e.message);
  }

  // Populer le sélecteur de modèles s'il est déjà dans le DOM
  renderAiModelSelect();

  // Attacher les boutons ✨ aux éditeurs Quill existants
  aiAttachQuillButtons();
}

/* =====================================================
   APPEL AU PROXY NIM
   ===================================================== */
/**
 * Appelle /api/ai/nim avec une liste de messages OpenAI-style.
 * Retourne la string de sortie (non-streaming).
 */
async function aiCall({ system, user, model, temperature = 0.4, max_tokens = 1024 }) {
  if (AI._running) {
    throw new Error('AI_BUSY');
  }
  AI._running = true;
  try {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });

    const r = await fetch(AI.endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:       model || AI.currentModel || AI.defaultModel,
        messages,
        temperature,
        max_tokens,
        stream:      false,
      }),
    });

    if (!r.ok) {
      let errBody = {};
      try { errBody = await r.json(); } catch {}
      const msg = errBody.message || errBody.error || `HTTP ${r.status}`;
      throw new Error(msg);
    }

    const data = await r.json();
    const out  = data?.choices?.[0]?.message?.content || '';
    return out.trim();
  } finally {
    AI._running = false;
  }
}

/**
 * Appel streaming SSE. Appelle onChunk(partialText) au fil de l'eau.
 * Retourne la string finale.
 */
async function aiCallStream({ system, user, model, temperature = 0.4, max_tokens = 1024, onChunk }) {
  if (AI._running) throw new Error('AI_BUSY');
  AI._running = true;
  try {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });

    const r = await fetch(AI.endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body:    JSON.stringify({
        model:       model || AI.currentModel || AI.defaultModel,
        messages,
        temperature,
        max_tokens,
        stream:      true,
      }),
    });

    if (!r.ok) {
      let errBody = {};
      try { errBody = await r.json(); } catch {}
      throw new Error(errBody.message || `HTTP ${r.status}`);
    }

    const reader  = r.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full   = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const obj   = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            if (typeof onChunk === 'function') onChunk(full);
          }
        } catch {}
      }
    }
    return full.trim();
  } finally {
    AI._running = false;
  }
}

/* =====================================================
   PROMPTS PRÉ-CONFIGURÉS
   ===================================================== */
const AI_PROMPTS = {
  rephrase: {
    label:       'Reformuler',
    icon:        'fa-wand-magic-sparkles',
    system:      'Tu es un rédacteur professionnel de comptes-rendus de réunion chez Wavestone. Tu réécris des textes en conservant le sens exact mais en améliorant le style, la clarté et la concision. Tu utilises un français professionnel et soutenu. Tu réponds UNIQUEMENT avec le texte reformulé, sans préambule, sans guillemets, sans commentaire.',
    user:        (txt) => `Reformule ce passage en français professionnel et clair :\n\n${txt}`,
    temperature: 0.4,
  },
  shorten: {
    label:       'Raccourcir',
    icon:        'fa-compress',
    system:      'Tu es un expert en synthèse. Tu réponds UNIQUEMENT avec le texte raccourci, sans préambule ni commentaire.',
    user:        (txt) => `Raccourcis ce passage en conservant toutes les informations essentielles (diviser la longueur par 2 environ) :\n\n${txt}`,
    temperature: 0.3,
  },
  expand: {
    label:       'Développer',
    icon:        'fa-expand',
    system:      'Tu es un rédacteur professionnel. Tu développes des idées en apportant du contexte et des détails pertinents, tout en restant factuel. Tu réponds UNIQUEMENT avec le texte développé.',
    user:        (txt) => `Développe ce passage en ajoutant du contexte et en enrichissant la rédaction (style professionnel, compte-rendu de réunion) :\n\n${txt}`,
    temperature: 0.5,
  },
  proofread: {
    label:       'Corriger',
    icon:        'fa-spell-check',
    system:      'Tu es un correcteur orthographique et grammatical expert en français. Tu corriges les fautes d\'orthographe, de grammaire, de syntaxe et de ponctuation SANS modifier le sens ni le style. Tu réponds UNIQUEMENT avec le texte corrigé.',
    user:        (txt) => `Corrige les fautes d'orthographe, de grammaire et de ponctuation dans ce texte :\n\n${txt}`,
    temperature: 0.1,
  },
  translate_en: {
    label:       'Traduire en anglais',
    icon:        'fa-language',
    system:      'Tu es un traducteur professionnel français → anglais. Tu réponds UNIQUEMENT avec la traduction, dans un anglais business clair et naturel.',
    user:        (txt) => `Traduis en anglais professionnel :\n\n${txt}`,
    temperature: 0.2,
  },
  translate_fr: {
    label:       'Traduire en français',
    icon:        'fa-language',
    system:      'Tu es un traducteur professionnel anglais → français. Tu réponds UNIQUEMENT avec la traduction, dans un français business naturel.',
    user:        (txt) => `Traduis en français professionnel :\n\n${txt}`,
    temperature: 0.2,
  },
  summarize: {
    label:       'Résumer',
    icon:        'fa-list-ul',
    system:      'Tu es un expert en synthèse de compte-rendus. Tu produis des résumés structurés sous forme de puces courtes et factuelles. Tu réponds en HTML Quill-compatible : <ul><li>…</li></ul>.',
    user:        (txt) => `Résume ces informations sous forme de 4 à 7 puces concises (format HTML <ul><li>…</li></ul>) :\n\n${txt}`,
    temperature: 0.3,
  },
  bullets: {
    label:       'Convertir en puces',
    icon:        'fa-list',
    system:      'Tu transformes un texte en liste à puces claire et structurée. Tu réponds UNIQUEMENT avec du HTML Quill : <ul><li>…</li></ul>.',
    user:        (txt) => `Transforme ce texte en liste à puces structurée (HTML <ul><li>…</li></ul>) :\n\n${txt}`,
    temperature: 0.2,
  },
  extract_actions: {
    label:       'Extraire les actions',
    icon:        'fa-list-check',
    system:      'Tu extrais les actions à mener depuis un texte de compte-rendu. Tu réponds UNIQUEMENT avec un tableau JSON valide de la forme : [{"action":"…","owner":"…","due":"YYYY-MM-DD","status":"todo"}]. Le champ "due" peut être vide si aucune date n\'est mentionnée. Le "status" est toujours "todo". N\'inclus rien d\'autre, pas de texte avant ou après le JSON.',
    user:        (txt) => `Extrais toutes les actions concrètes depuis ce texte :\n\n${txt}`,
    temperature: 0.1,
    max_tokens:  1500,
  },
};

/* =====================================================
   EXÉCUTION D'UNE ACTION IA
   ===================================================== */
/**
 * Exécute une action IA sur la sélection courante d'un éditeur Quill.
 * Si aucune sélection : traite tout le contenu.
 */
async function aiRunOnEditor(actionKey, quillInstance) {
  if (!AI.configured) {
    showToast('⚠️ Clé NVIDIA NIM non configurée sur le serveur. Voir README.', 'error');
    return;
  }
  const prompt = AI_PROMPTS[actionKey];
  if (!prompt) return;

  const q = quillInstance || AI._activeQuill || STATE.quillEditor;
  if (!q) return;

  // Récupérer la sélection ou tout le contenu
  let range = q.getSelection(true);
  let text  = '';
  let replaceAll = false;

  if (range && range.length > 0) {
    text = q.getText(range.index, range.length).trim();
  } else {
    text = q.getText().trim();
    replaceAll = true;
    range = { index: 0, length: q.getLength() - 1 };
  }

  if (!text) {
    showToast('Sélectionnez ou rédigez du texte avant d\'utiliser l\'IA.', 'warning');
    return;
  }

  const toast = showAiRunningToast(prompt.label);

  try {
    const result = await aiCall({
      system:      prompt.system,
      user:        prompt.user(text),
      temperature: prompt.temperature,
      max_tokens:  prompt.max_tokens || 1024,
    });

    if (!result) {
      showToast('Réponse IA vide.', 'warning');
      return;
    }

    // Cas spécial : extraction d'actions → injecter dans le tableau d'actions
    if (actionKey === 'extract_actions') {
      aiInjectExtractedActions(result);
      hideAiRunningToast(toast);
      return;
    }

    // Remplacer la sélection (ou tout le contenu)
    // Si la réponse est du HTML (résumé/bullets), on insère en HTML
    const isHtml = /<(ul|ol|li|p|h[1-6]|strong|em|br)[\s>]/i.test(result);

    q.deleteText(range.index, range.length || 0);
    if (isHtml) {
      q.clipboard.dangerouslyPasteHTML(range.index, result);
    } else {
      q.insertText(range.index, result);
    }
    q.setSelection(range.index + result.length);

    // Déclencher un save manuel pour que les autres voient les modifs IA
    if (typeof scheduleAutoSave === 'function') scheduleAutoSave(0);
  } catch (e) {
    if (e.message === 'AI_BUSY') {
      showToast('Une requête IA est déjà en cours, patientez…', 'warning');
    } else {
      showToast('Erreur IA : ' + e.message, 'error');
    }
    console.error('[AI] run error:', e);
  } finally {
    hideAiRunningToast(toast);
  }
}

/* =====================================================
   INJECTION DES ACTIONS EXTRAITES
   ===================================================== */
function aiInjectExtractedActions(jsonStr) {
  let actions = null;

  // L'IA peut parfois entourer le JSON de ```json ... ```
  const cleaned = jsonStr.replace(/```json\s*|\s*```/g, '').trim();
  try {
    actions = JSON.parse(cleaned);
  } catch {
    // Essayer de récupérer le premier tableau JSON
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) {
      try { actions = JSON.parse(m[0]); } catch {}
    }
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    showToast('Aucune action détectée par l\'IA.', 'warning');
    return;
  }

  const tbody = document.getElementById('actionsTableBody');
  if (!tbody) return;

  let added = 0;
  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    const act   = String(a.action || a.task || '').trim();
    if (!act) continue;
    const owner = String(a.owner || a.assignee || '').trim();
    const due   = String(a.due || a.deadline || '').trim();
    const status = ['todo','wip','done','blocked'].includes(a.status) ? a.status : 'todo';

    if (typeof addActionRow === 'function') {
      addActionRow(tbody, { action: act, owner, due, status });
      added++;
    }
  }

  if (added > 0) {
    showToast(`✨ ${added} action${added>1?'s':''} ajoutée${added>1?'s':''} par l'IA.`, 'success');
    if (typeof scheduleAutoSave === 'function') scheduleAutoSave(0);
  } else {
    showToast('Aucune action valide extraite.', 'warning');
  }
}

/* =====================================================
   GÉNÉRATION D'UN CR COMPLET DEPUIS NOTES BRUTES
   ===================================================== */
async function aiGenerateCRFromNotes(notes) {
  if (!AI.configured) {
    showToast('Clé NVIDIA NIM non configurée.', 'error');
    return null;
  }
  if (!notes || !notes.trim()) {
    showToast('Collez ou écrivez des notes brutes pour lancer la génération.', 'warning');
    return null;
  }

  const system = [
    'Tu es un assistant de rédaction de comptes-rendus de réunion professionnels (Wavestone).',
    'À partir de notes brutes, tu dois produire un CR structuré au format JSON strict.',
    'Tu réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans préambule.',
    'Schéma attendu :',
    '{',
    '  "meeting_name": "string",',
    '  "meeting_date": "YYYY-MM-DD" (ou vide si non déterminable),',
    '  "meeting_location": "string" (optionnel),',
    '  "participants": [{"name":"…","company":"…","role":"…"}],',
    '  "key_points_html": "HTML Quill : <p>…</p><ul><li>…</li></ul>",',
    '  "decisions_html": "HTML Quill",',
    '  "risks_html": "HTML Quill",',
    '  "next_steps_html": "HTML Quill",',
    '  "actions": [{"action":"…","owner":"…","due":"YYYY-MM-DD","status":"todo"}]',
    '}',
    'Utilise un français professionnel. Si une section est vide dans les notes, laisse la chaîne vide "".',
  ].join('\n');

  const user = `Voici mes notes brutes de réunion. Génère le CR structuré :\n\n${notes}`;

  const raw = await aiCall({ system, user, temperature: 0.3, max_tokens: 3000 });

  // Nettoyer d'éventuels backticks markdown
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[AI] JSON parse error:', e, cleaned);
    throw new Error('Format de réponse IA invalide.');
  }
}

/* =====================================================
   PANNEAU "ASSISTANT IA" (MODALE GLOBALE)
   ===================================================== */
function openAiAssistant() {
  const modal = document.getElementById('modalAiAssistant');
  if (!modal) return;
  renderAiModelSelect();
  // Mettre à jour le label du modèle courant
  const lbl = document.getElementById('aiAssistantCurrentModel');
  if (lbl) lbl.textContent = _modelLabel(AI.currentModel);
  // Reset state
  const notes = document.getElementById('aiAssistantNotes');
  if (notes) notes.value = '';
  const out = document.getElementById('aiAssistantOutput');
  if (out) {
    out.innerHTML = `<div class="ai-output-empty"><i class="fa-solid fa-sparkles"></i><p>La prévisualisation du CR généré apparaîtra ici.</p></div>`;
  }
  const applyBtn = document.getElementById('aiAssistantApplyBtn');
  if (applyBtn) applyBtn.style.display = 'none';
  STATE._aiLastResult = null;
  if (!AI.configured) {
    if (out) {
      out.innerHTML = `
        <div class="ai-output-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>Clé NVIDIA NIM non configurée</strong><br>
            Ajoutez <code>NVIDIA_API_KEY</code> dans Cloudflare Pages → Settings → Environment Variables, puis redéployez.
          </div>
        </div>`;
    }
  }
  if (typeof openModal === 'function') openModal('modalAiAssistant');
}

function closeAiAssistant() {
  if (typeof closeModal === 'function') closeModal('modalAiAssistant');
}

async function aiAssistantGenerate() {
  const notesEl = document.getElementById('aiAssistantNotes');
  const outEl   = document.getElementById('aiAssistantOutput');
  const btn     = document.getElementById('aiAssistantGenerateBtn');
  const applyBtn= document.getElementById('aiAssistantApplyBtn');

  if (!notesEl || !outEl) return;
  const notes = notesEl.value.trim();
  if (!notes) {
    showToast('Écrivez vos notes brutes avant de générer.', 'warning');
    return;
  }

  outEl.innerHTML = '<div class="ai-output-loading"><i class="fa-solid fa-spinner fa-spin"></i> Génération en cours…</div>';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Génération…'; }
  if (applyBtn) applyBtn.style.display = 'none';

  try {
    const cr = await aiGenerateCRFromNotes(notes);
    STATE._aiLastResult = cr;

    // Prévisualisation
    const partHtml = (cr.participants || []).map(p =>
      `<li><strong>${esc(p.name||'')}</strong>${p.role?' — '+esc(p.role):''}${p.company?' ('+esc(p.company)+')':''}</li>`
    ).join('') || '<li><em>Aucun participant</em></li>';

    const actHtml = (cr.actions || []).map(a =>
      `<li><strong>${esc(a.action||'')}</strong>${a.owner?' — '+esc(a.owner):''}${a.due?' <em>('+esc(a.due)+')</em>':''}</li>`
    ).join('') || '<li><em>Aucune action</em></li>';

    outEl.innerHTML = `
      <div class="ai-preview">
        <div class="ai-preview-section">
          <div class="ai-preview-label">Réunion</div>
          <div class="ai-preview-value">${esc(cr.meeting_name||'(sans titre)')}${cr.meeting_date?' · '+esc(cr.meeting_date):''}${cr.meeting_location?' · '+esc(cr.meeting_location):''}</div>
        </div>
        <div class="ai-preview-section">
          <div class="ai-preview-label">Participants</div>
          <ul class="ai-preview-list">${partHtml}</ul>
        </div>
        <div class="ai-preview-section">
          <div class="ai-preview-label">Points clés</div>
          <div class="ai-preview-rich">${cr.key_points_html||'<em>(vide)</em>'}</div>
        </div>
        ${cr.decisions_html ? `<div class="ai-preview-section"><div class="ai-preview-label">Décisions</div><div class="ai-preview-rich">${cr.decisions_html}</div></div>` : ''}
        ${cr.risks_html ? `<div class="ai-preview-section"><div class="ai-preview-label">Risques</div><div class="ai-preview-rich">${cr.risks_html}</div></div>` : ''}
        ${cr.next_steps_html ? `<div class="ai-preview-section"><div class="ai-preview-label">Prochaines étapes</div><div class="ai-preview-rich">${cr.next_steps_html}</div></div>` : ''}
        <div class="ai-preview-section">
          <div class="ai-preview-label">Actions</div>
          <ul class="ai-preview-list">${actHtml}</ul>
        </div>
      </div>`;

    if (applyBtn) applyBtn.style.display = 'inline-flex';
  } catch (e) {
    outEl.innerHTML = `<div class="ai-output-error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div>`;
    console.error('[AI] generate error:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Générer le CR'; }
  }
}

function aiAssistantApply() {
  const cr = STATE._aiLastResult;
  if (!cr) return;

  const isEmpty = (html) => (typeof window._isQuillContentEmpty === 'function')
    ? window._isQuillContentEmpty(html)
    : !String(html || '').replace(/<p><br\s*\/?><\/p>/gi, '').replace(/<[^>]+>/g, '').trim();

  // Injection robuste Quill 2 : remplace si vide, ajoute en fin sinon
  const _quillSet = (q, html, { appendIfNotEmpty = true } = {}) => {
    if (!q || !html) return;
    try {
      const currentEmpty = isEmpty(q.root.innerHTML);
      if (currentEmpty || !appendIfNotEmpty) {
        // Reset puis injection complète via delta → delta synchronisé
        q.setContents([], 'silent');
        q.clipboard.dangerouslyPasteHTML(0, html, 'user');
      } else {
        q.clipboard.dangerouslyPasteHTML(q.getLength(), html, 'user');
      }
    } catch (e) {
      console.warn('[AI] _quillSet fallback:', e);
      try { q.root.innerHTML = html; } catch {}
    }
  };

  // En-tête réunion : ne réécrit pas ce que l'utilisateur a déjà saisi
  const nameEl = document.getElementById('fieldMeetingName');
  const dateEl = document.getElementById('fieldDate');
  const locEl  = document.getElementById('fieldLocation');
  if (cr.meeting_name && nameEl && !nameEl.value.trim()) {
    nameEl.value = cr.meeting_name;
    nameEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (cr.meeting_date && dateEl && !dateEl.value.trim()) {
    dateEl.value = cr.meeting_date;
    dateEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (cr.meeting_location && locEl && !locEl.value.trim()) {
    locEl.value = cr.meeting_location;
    locEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Participants : ajouter aux existants
  if (Array.isArray(cr.participants) && cr.participants.length) {
    const container = document.getElementById('participantsList');
    if (container && typeof addParticipantRow === 'function') {
      const emptyRows = Array.from(container.querySelectorAll('.participant-row'))
        .filter(row => !row.querySelector('[data-field="name"]').value.trim());
      emptyRows.forEach(r => r.remove());

      for (const p of cr.participants) {
        if (p && p.name) addParticipantRow(container, p);
      }
    }
  }

  // Points clés (éditeur Quill principal) — vraie détection d'empty + delta
  if (cr.key_points_html && STATE.quillEditor) {
    _quillSet(STATE.quillEditor, cr.key_points_html, { appendIfNotEmpty: true });
  }

  // Sections optionnelles (décisions, risques, next steps) : on injecte si l'éditeur est vide
  // sinon on concatène. On utilise _quillSet directement pour chaque éditeur.
  const optMap = {
    decisions_quill_editor:  cr.decisions_html,
    risks_quill_editor:      cr.risks_html,
    next_steps_quill_editor: cr.next_steps_html,
  };
  for (const [qId, html] of Object.entries(optMap)) {
    if (!html) continue;
    const q = STATE?._quillEditors?.[qId];
    if (q) {
      _quillSet(q, html, { appendIfNotEmpty: true });
    } else {
      // Éditeur optionnel pas encore monté → stocker via setOptionalSectionsData
      if (typeof getOptionalSectionsData === 'function' && typeof setOptionalSectionsData === 'function') {
        const cur = getOptionalSectionsData();
        const key = qId.replace('_quill_editor', '');
        if (isEmpty(cur[key])) {
          setOptionalSectionsData({ ...cur, [key]: html });
        }
      }
    }
  }

  // Actions
  if (Array.isArray(cr.actions) && cr.actions.length) {
    const tbody = document.getElementById('actionsTableBody');
    if (tbody && typeof addActionRow === 'function') {
      const emptyRows = Array.from(tbody.querySelectorAll('tr'))
        .filter(tr => !tr.querySelector('input').value.trim());
      emptyRows.forEach(r => r.remove());

      for (const a of cr.actions) {
        if (a && a.action) addActionRow(tbody, a);
      }
    }
  }

  closeAiAssistant();
  showToast('✨ CR pré-rempli depuis vos notes.', 'success');
  if (typeof scheduleAutoSave === 'function') scheduleAutoSave(0);
}

/* =====================================================
   BOUTON ✨ IA DANS LA BARRE D'ACTIONS DES ÉDITEURS QUILL
   ===================================================== */
function aiAttachQuillButtons() {
  // Sections Quill principales
  const targets = [
    { quillId: 'quillEditor',              getter: () => STATE.quillEditor },
    { quillId: 'decisions_quill_editor',   getter: () => STATE?._quillEditors?.decisions_quill_editor },
    { quillId: 'risks_quill_editor',       getter: () => STATE?._quillEditors?.risks_quill_editor },
    { quillId: 'budget_quill_editor',      getter: () => STATE?._quillEditors?.budget_quill_editor },
    { quillId: 'next_steps_quill_editor',  getter: () => STATE?._quillEditors?.next_steps_quill_editor },
  ];

  for (const { quillId, getter } of targets) {
    const containerEl = document.getElementById(quillId);
    if (!containerEl) continue;
    // Placer le bouton juste au-dessus de la toolbar Quill (qui est un sibling avant)
    const toolbar = containerEl.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('ql-toolbar')) continue;
    if (toolbar.querySelector('.ai-quill-btn')) continue; // déjà attaché

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ai-quill-btn';
    btn.title = 'Assistant IA';
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>IA</span>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const q = getter();
      if (q) openAiMenu(btn, q);
    });
    toolbar.appendChild(btn);
  }
}
window._aiAttachQuillButtons = aiAttachQuillButtons;

/* =====================================================
   MENU CONTEXTUEL DES ACTIONS IA
   ===================================================== */
let _aiMenuEl = null;

function openAiMenu(anchorBtn, quill) {
  closeAiMenu();
  AI._activeQuill = quill;

  const menu = document.createElement('div');
  menu.className = 'ai-menu';
  menu.innerHTML = `
    <div class="ai-menu-header">
      <i class="fa-solid fa-wand-magic-sparkles"></i> Assistant IA
      <span class="ai-menu-model" id="aiMenuModelBadge">${esc(_modelLabel(AI.currentModel))}</span>
    </div>
    <div class="ai-menu-items">
      ${Object.entries(AI_PROMPTS).map(([key, p]) => `
        <button type="button" class="ai-menu-item" data-ai-action="${key}">
          <i class="fa-solid ${p.icon}"></i>
          <span>${esc(p.label)}</span>
        </button>`).join('')}
    </div>
    <div class="ai-menu-footer">
      <button type="button" class="ai-menu-settings" id="aiMenuSettingsBtn">
        <i class="fa-solid fa-sliders"></i> Changer de modèle
      </button>
    </div>`;

  document.body.appendChild(menu);
  _aiMenuEl = menu;

  // Positionner sous le bouton
  const rect = anchorBtn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top      = (rect.bottom + 6) + 'px';
  menu.style.left     = Math.max(8, Math.min(rect.left, window.innerWidth - 280)) + 'px';
  menu.style.zIndex   = 100000;

  // Bind actions
  menu.querySelectorAll('[data-ai-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-ai-action');
      closeAiMenu();
      aiRunOnEditor(key, quill);
    });
  });

  menu.querySelector('#aiMenuSettingsBtn')?.addEventListener('click', () => {
    closeAiMenu();
    openAiModelPicker();
  });

  // Fermer au clic extérieur
  setTimeout(() => {
    document.addEventListener('click', _aiMenuDocClick, { once: false });
  }, 0);
}

function _aiMenuDocClick(e) {
  if (_aiMenuEl && !_aiMenuEl.contains(e.target)) closeAiMenu();
}

function closeAiMenu() {
  if (_aiMenuEl) {
    _aiMenuEl.remove();
    _aiMenuEl = null;
  }
  document.removeEventListener('click', _aiMenuDocClick);
}

/* =====================================================
   SÉLECTEUR DE MODÈLE
   ===================================================== */
function openAiModelPicker() {
  const modal = document.getElementById('modalAiModel');
  if (!modal) {
    // Fallback : toggle via modale assistant
    openAiAssistant();
    return;
  }
  renderAiModelSelect();
  if (typeof openModal === 'function') openModal('modalAiModel');
}

function renderAiModelSelect() {
  const grid = document.getElementById('aiModelGrid');
  if (!grid) return;

  if (!AI.models || AI.models.length === 0) {
    grid.innerHTML = '<div class="ai-empty">Catalogue non chargé. Vérifiez la connexion.</div>';
    return;
  }

  grid.innerHTML = AI.models.map(m => {
    const active = m.id === AI.currentModel ? 'active' : '';
    const tags = (m.tags||[]).map(t => `<span class="ai-model-tag">${esc(t)}</span>`).join('');
    return `
      <div class="ai-model-card ${active}" data-model-id="${esc(m.id)}">
        <div class="ai-model-head">
          <div class="ai-model-name">${esc(m.label)}</div>
          <div class="ai-model-family">${esc(m.family)} · ${esc(m.size)}</div>
        </div>
        <div class="ai-model-tags">${tags}</div>
        <div class="ai-model-use">${esc(m.use_case)}</div>
        <div class="ai-model-check"><i class="fa-solid fa-check"></i> Modèle actif</div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.ai-model-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-model-id');
      AI.currentModel = id;
      try { localStorage.setItem('wv_ai_model', id); } catch {}
      grid.querySelectorAll('.ai-model-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      showToast(`Modèle actif : ${_modelLabel(id)}`, 'success');
    });
  });

  // Badge présent dans le header du menu ✨
  const badge = document.getElementById('aiMenuModelBadge');
  if (badge) badge.textContent = _modelLabel(AI.currentModel);
}

function _modelLabel(id) {
  const m = AI.models.find(x => x.id === id);
  return m ? m.label : (id || '—');
}

/* =====================================================
   TOAST "IA EN COURS"
   ===================================================== */
function showAiRunningToast(label) {
  const el = document.createElement('div');
  el.className = 'ai-running-toast';
  el.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles fa-beat"></i> ${esc(label)}…`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  return el;
}
function hideAiRunningToast(el) {
  if (!el) return;
  el.classList.remove('visible');
  setTimeout(() => el.remove(), 300);
}

/* =====================================================
   HELPER esc (si pas global)
   ===================================================== */
function _aiEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Utilise le esc() global s'il existe, sinon fallback
if (typeof window.esc !== 'function') window.esc = _aiEsc;

/* =====================================================
   EXPOSE GLOBALS
   ===================================================== */
window.AI                   = AI;
window.aiInit               = aiInit;
window.aiCall               = aiCall;
window.aiCallStream         = aiCallStream;
window.aiRunOnEditor        = aiRunOnEditor;
window.aiAttachQuillButtons = aiAttachQuillButtons;
window.openAiMenu           = openAiMenu;
window.closeAiMenu          = closeAiMenu;
window.openAiAssistant      = openAiAssistant;
window.closeAiAssistant     = closeAiAssistant;
window.aiAssistantGenerate  = aiAssistantGenerate;
window.aiAssistantApply     = aiAssistantApply;
window.openAiModelPicker    = openAiModelPicker;
window.renderAiModelSelect  = renderAiModelSelect;
window.aiGenerateCRFromNotes= aiGenerateCRFromNotes;
window._modelLabel          = _modelLabel;

/* =====================================================
   INIT AU CHARGEMENT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Délai pour laisser Quill s'initialiser avant d'attacher les boutons
  setTimeout(() => aiInit(), 800);
  // Ré-attacher les boutons quand les sections optionnelles sont re-créées
  setTimeout(() => aiAttachQuillButtons(), 1600);
  setTimeout(() => aiAttachQuillButtons(), 3000);
});
