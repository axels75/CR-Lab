/* =====================================================
   WAVESTONE CR MASTER – project-chatbot.js
   Chatbot projet propulsé par NVIDIA NIM.
   Répond à des questions et génère des synthèses
   multi-CR à partir de TOUS les comptes-rendus d'un projet.

   Dépend de :
   - window.AI / window.aiCallStream (ai-assistant.js)
   - STATE.projects / STATE.reports (app.js)
   - openModal / closeModal / showToast / esc (app.js)
   ===================================================== */

'use strict';

/* =====================================================
   STATE CHATBOT
   ===================================================== */
const PROJECT_CHAT = {
  projectId: null,
  history:   [],   // [{role:'user'|'assistant', content:'...'}]
  running:   false,
};

/* =====================================================
   OUVERTURE / FERMETURE
   ===================================================== */
function openProjectChatbot(pid) {
  pid = pid || (window.STATE && STATE.currentProjectId);
  if (!pid) {
    if (typeof showToast === 'function') showToast('Aucun projet sélectionné.', 'warning');
    return;
  }
  if (!window.AI || !window.AI.configured) {
    if (typeof showToast === 'function') {
      showToast('Clé NVIDIA NIM non configurée sur le serveur.', 'error');
    }
    return;
  }

  const project = (STATE.projects || []).find(p => p.id === pid);
  if (!project) return;

  PROJECT_CHAT.projectId = pid;
  PROJECT_CHAT.history   = [];

  const titleEl = document.getElementById('projectChatTitle');
  if (titleEl) titleEl.textContent = project.name || 'Projet';

  const modelEl = document.getElementById('projectChatCurrentModel');
  if (modelEl) {
    const lbl = (typeof window._modelLabel === 'function')
      ? window._modelLabel(AI.currentModel)
      : (AI.currentModel || '—');
    modelEl.textContent = lbl;
  }

  const reports = (STATE.reports || []).filter(r => r.project_id === pid);
  const countEl = document.getElementById('projectChatCrCount');
  if (countEl) {
    countEl.textContent = reports.length === 0
      ? 'Aucun CR dans ce projet'
      : (reports.length === 1 ? '1 CR chargé' : `${reports.length} CRs chargés`);
  }

  const msgs = document.getElementById('projectChatMessages');
  if (msgs) {
    msgs.innerHTML = `
      <div class="project-chat-welcome">
        <i class="fa-solid fa-robot"></i>
        <h4>Assistant projet</h4>
        <p>Posez des questions sur l'ensemble des CRs de ce projet. Exemples :</p>
        <div class="project-chat-suggestions">
          <button type="button" class="project-chat-suggestion" data-suggest="Fais-moi une synthèse complète de tous les CRs de ce projet : objectifs, avancement, décisions clés, risques et actions en cours.">
            <i class="fa-solid fa-file-lines"></i> Synthèse complète du projet
          </button>
          <button type="button" class="project-chat-suggestion" data-suggest="Liste toutes les décisions prises sur ce projet, classées par date, avec le contexte.">
            <i class="fa-solid fa-gavel"></i> Liste des décisions
          </button>
          <button type="button" class="project-chat-suggestion" data-suggest="Liste toutes les actions en cours ou en retard, avec leur porteur et leur échéance.">
            <i class="fa-solid fa-list-check"></i> Actions en cours
          </button>
          <button type="button" class="project-chat-suggestion" data-suggest="Quels sont les principaux risques identifiés sur ce projet et comment évoluent-ils ?">
            <i class="fa-solid fa-triangle-exclamation"></i> Risques identifiés
          </button>
          <button type="button" class="project-chat-suggestion" data-suggest="Quelles sont les dernières évolutions marquantes depuis le dernier CR ?">
            <i class="fa-solid fa-arrow-trend-up"></i> Évolutions récentes
          </button>
        </div>
      </div>`;

    msgs.querySelectorAll('.project-chat-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-suggest') || '';
        const input = document.getElementById('projectChatInput');
        if (input) input.value = q;
        projectChatSend();
      });
    });
  }

  const input = document.getElementById('projectChatInput');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 200);
  }

  if (typeof openModal === 'function') openModal('modalProjectChat');
}

function closeProjectChatbot() {
  if (typeof closeModal === 'function') closeModal('modalProjectChat');
  PROJECT_CHAT.running = false;
}

/* =====================================================
   SÉRIALISATION DES CRs EN CONTEXTE TEXTE
   ===================================================== */
function _stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = String(html);
  // Remplacer <br> / <li> par retours à la ligne
  div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  div.querySelectorAll('li').forEach(li => {
    li.insertAdjacentText('afterbegin', '• ');
    li.insertAdjacentText('beforeend', '\n');
  });
  div.querySelectorAll('p, div').forEach(p => {
    p.insertAdjacentText('beforeend', '\n');
  });
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function _formatDateFR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

function buildProjectContextText(pid) {
  const project = (STATE.projects || []).find(p => p.id === pid);
  const reports = (STATE.reports || [])
    .filter(r => r.project_id === pid)
    .sort((a, b) => {
      const da = a.meeting_date || '';
      const db = b.meeting_date || '';
      return da.localeCompare(db);
    });

  if (reports.length === 0) {
    return `PROJET : ${project?.name || '—'}\nAucun compte-rendu enregistré pour ce projet.`;
  }

  const MAX_CHARS = 40000; // limite de contexte approximative
  const parts = [];
  parts.push(`PROJET : ${project?.name || '—'}`);
  if (project?.description) parts.push(`Description : ${project.description}`);
  parts.push(`Nombre de CRs : ${reports.length}`);
  parts.push('');

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const header = `=== CR ${i + 1}/${reports.length} : ${r.meeting_name || 'Sans titre'} ===`;
    const lines  = [header];
    if (r.meeting_date)     lines.push(`Date : ${_formatDateFR(r.meeting_date)}`);
    if (r.meeting_location) lines.push(`Lieu : ${r.meeting_location}`);
    if (r.facilitator)      lines.push(`Animateur : ${r.facilitator}`);
    if (r.author)           lines.push(`Rédacteur : ${r.author}`);
    if (r.status)           lines.push(`Statut : ${r.status}`);

    // Participants
    let participants = [];
    try { participants = JSON.parse(r.participants || '[]'); } catch {}
    if (Array.isArray(participants) && participants.length) {
      const list = participants
        .map(p => `${p.name || ''}${p.role ? ' (' + p.role + ')' : ''}${p.company ? ' — ' + p.company : ''}`)
        .filter(Boolean)
        .join('; ');
      if (list) lines.push(`Participants : ${list}`);
    }

    // Contenu riche
    const kp = _stripHtml(r.key_points_html);
    if (kp) lines.push(`\nPoints clés :\n${kp}`);

    const dec = _stripHtml(r.decisions_html);
    if (dec) lines.push(`\nDécisions :\n${dec}`);

    const risks = _stripHtml(r.risks_html);
    if (risks) lines.push(`\nRisques :\n${risks}`);

    const budget = _stripHtml(r.budget_html);
    if (budget) lines.push(`\nBudget :\n${budget}`);

    const next = _stripHtml(r.next_steps_html);
    if (next) lines.push(`\nProchaines étapes :\n${next}`);

    // Actions
    let actions = [];
    try { actions = JSON.parse(r.actions || '[]'); } catch {}
    if (Array.isArray(actions) && actions.length) {
      const rows = actions
        .map(a => `- ${a.action || ''}${a.owner ? ' [' + a.owner + ']' : ''}${a.due ? ' (échéance ' + _formatDateFR(a.due) + ')' : ''}${a.status ? ' — ' + a.status : ''}`)
        .join('\n');
      lines.push(`\nActions :\n${rows}`);
    }

    parts.push(lines.join('\n'));
    parts.push('');

    // Troncature souple si on dépasse la limite
    if (parts.join('\n').length > MAX_CHARS) {
      parts.push(`[... ${reports.length - i - 1} CR(s) suivants tronqués pour tenir dans le contexte ...]`);
      break;
    }
  }

  return parts.join('\n');
}

/* =====================================================
   ENVOI D'UN MESSAGE
   ===================================================== */
async function projectChatSend() {
  if (PROJECT_CHAT.running) return;

  const input = document.getElementById('projectChatInput');
  const msgs  = document.getElementById('projectChatMessages');
  const btn   = document.getElementById('projectChatSendBtn');
  if (!input || !msgs) return;

  const question = input.value.trim();
  if (!question) return;

  // Nettoyer l'écran d'accueil au premier message
  const welcome = msgs.querySelector('.project-chat-welcome');
  if (welcome) welcome.remove();

  // Ajouter message user au DOM
  const userBubble = document.createElement('div');
  userBubble.className = 'project-chat-msg project-chat-msg-user';
  userBubble.innerHTML = `<div class="project-chat-bubble">${esc(question)}</div>`;
  msgs.appendChild(userBubble);

  // Bulle assistant (streaming)
  const asstBubble = document.createElement('div');
  asstBubble.className = 'project-chat-msg project-chat-msg-assistant';
  asstBubble.innerHTML = `
    <div class="project-chat-avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="project-chat-bubble">
      <div class="project-chat-loading"><i class="fa-solid fa-spinner fa-spin"></i> Lecture des CRs…</div>
    </div>`;
  msgs.appendChild(asstBubble);
  msgs.scrollTop = msgs.scrollHeight;

  input.value = '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
  PROJECT_CHAT.running = true;

  PROJECT_CHAT.history.push({ role: 'user', content: question });

  try {
    const context = buildProjectContextText(PROJECT_CHAT.projectId);
    const system  = [
      "Tu es l'assistant d'un chef de projet Wavestone.",
      "Tu t'appuies EXCLUSIVEMENT sur les comptes-rendus (CRs) fournis en contexte.",
      "Tu réponds en français professionnel, clair et structuré.",
      "Quand c'est pertinent, structure ta réponse avec des sous-titres Markdown (##), des listes à puces et des emphases **en gras**.",
      "Si une information n'est pas dans les CRs, dis-le explicitement : « Cette information n'apparaît pas dans les CRs fournis. »",
      "Pour les synthèses, sois factuel et exhaustif : reprends toutes les informations clés.",
      "Cite toujours le titre du CR concerné quand tu fais référence à un élément précis.",
    ].join(' ');

    // Construction du prompt : contexte + historique + question actuelle
    const historyText = PROJECT_CHAT.history.slice(0, -1).map(m =>
      (m.role === 'user' ? 'UTILISATEUR : ' : 'ASSISTANT : ') + m.content
    ).join('\n\n');

    const userPrompt = [
      '=== CONTEXTE : COMPTES-RENDUS DU PROJET ===',
      context,
      '',
      historyText ? '=== CONVERSATION PRÉCÉDENTE ===' : '',
      historyText,
      historyText ? '' : '',
      '=== QUESTION DE L\'UTILISATEUR ===',
      question,
    ].filter(Boolean).join('\n');

    const bubble = asstBubble.querySelector('.project-chat-bubble');

    const full = await aiCallStream({
      system,
      user:        userPrompt,
      temperature: 0.35,
      max_tokens:  2048,
      onChunk: (partial) => {
        bubble.innerHTML = _renderMarkdownLite(partial);
        msgs.scrollTop = msgs.scrollHeight;
      },
    });

    bubble.innerHTML = _renderMarkdownLite(full);
    PROJECT_CHAT.history.push({ role: 'assistant', content: full });

    // Bouton "copier" sur la réponse
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'project-chat-copy';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copier';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(full).then(() => {
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copié';
        setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copier'; }, 1500);
      });
    });
    asstBubble.appendChild(copyBtn);

  } catch (e) {
    console.error('[ProjectChat] error:', e);
    const bubble = asstBubble.querySelector('.project-chat-bubble');
    if (bubble) {
      bubble.innerHTML = `<div class="project-chat-error"><i class="fa-solid fa-triangle-exclamation"></i> Erreur : ${esc(e.message || 'inconnue')}</div>`;
    }
    PROJECT_CHAT.history.pop(); // retirer la question ratée
  } finally {
    PROJECT_CHAT.running = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; }
    msgs.scrollTop = msgs.scrollHeight;
  }
}

/* =====================================================
   MINI-RENDU MARKDOWN (sécurisé)
   Supporte : ## titres, **gras**, *italique*, `code`, listes -, 1.
   ===================================================== */
function _renderMarkdownLite(md) {
  if (!md) return '';
  // Escape HTML d'abord
  let s = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code inline
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Gras **xxx**
  s = s.replace(/\*\*([^\*\n]+)\*\*/g, '<strong>$1</strong>');
  // Italique *xxx*
  s = s.replace(/(^|[\s(])\*([^\*\n]+)\*/g, '$1<em>$2</em>');

  // Titres ##, ###
  s = s.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^##\s+(.+)$/gm,  '<h3>$1</h3>');
  s = s.replace(/^#\s+(.+)$/gm,   '<h3>$1</h3>');

  // Listes à puces : lignes consécutives "- …" ou "• …"
  s = s.replace(/(^|\n)((?:[ \t]*[-•]\s.+\n?)+)/g, (_m, pre, block) => {
    const items = block.trim().split(/\n/).map(l => l.replace(/^[ \t]*[-•]\s+/, ''));
    return pre + '<ul>' + items.map(it => `<li>${it}</li>`).join('') + '</ul>';
  });

  // Listes numérotées
  s = s.replace(/(^|\n)((?:[ \t]*\d+\.\s.+\n?)+)/g, (_m, pre, block) => {
    const items = block.trim().split(/\n/).map(l => l.replace(/^[ \t]*\d+\.\s+/, ''));
    return pre + '<ol>' + items.map(it => `<li>${it}</li>`).join('') + '</ol>';
  });

  // Retours à la ligne restants → <br>
  s = s.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  s = '<p>' + s + '</p>';
  // Nettoie les <p> vides et les <p> autour de <ul>/<ol>/<h*>
  s = s.replace(/<p>\s*<\/p>/g, '');
  s = s.replace(/<p>(\s*<(?:ul|ol|h[1-6])[\s\S]*?<\/(?:ul|ol|h[1-6])>\s*)<\/p>/g, '$1');

  return s;
}

/* =====================================================
   BIND INPUT (Entrée = envoyer)
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('projectChatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        projectChatSend();
      }
    });
  }
  const btn = document.getElementById('projectChatSendBtn');
  if (btn) btn.addEventListener('click', projectChatSend);
});

/* =====================================================
   EXPOSE GLOBALS
   ===================================================== */
window.openProjectChatbot  = openProjectChatbot;
window.closeProjectChatbot = closeProjectChatbot;
window.projectChatSend     = projectChatSend;

/* =====================================================
   FLOATING CHATBOT — STYLE NOTION
   ===================================================== */
const FLOATING_CHAT = {
  open:       false,
  running:    false,
  history:    [],
  avatar:     localStorage.getItem('wv_chatbot_avatar') || '🤖',
  name:       localStorage.getItem('wv_chatbot_name')   || 'Assistant CR Master',
};

function toggleFloatingChat() {
  const panel = document.getElementById('floatingChatPanel');
  FLOATING_CHAT.open = !FLOATING_CHAT.open;
  panel.style.display = FLOATING_CHAT.open ? 'flex' : 'none';
  if (FLOATING_CHAT.open) {
    _updateFloatingChatModel();
    document.getElementById('floatingChatInput')?.focus();
  }
}

window.toggleFloatingChat = toggleFloatingChat;

/* Personnaliser l'avatar */
function customizeChatbotAvatar() {
  const emojis = ['🤖','🦊','🐱','🐶','🦉','🐼','🦄','👾','🧙','🦸','🧑‍💼','🕵️'];
  const defaultAvatar = FLOATING_CHAT.avatar;
  
  // Créer un petit panneau de sélection d'emoji
  let panel = document.getElementById('floatingEmojiPicker');
  if (panel) { panel.remove(); return; }
  
  panel = document.createElement('div');
  panel.id = 'floatingEmojiPicker';
  panel.style.cssText = 'position:fixed;bottom:160px;right:24px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);padding:10px;display:flex;flex-wrap:wrap;gap:6px;z-index:10000;width:240px;';
  panel.innerHTML = `
    <div style="width:100%;font-size:.75rem;font-weight:600;color:#64748B;margin-bottom:4px;padding:0 4px;">
      Choisis un avatar
      <input type="text" id="floatingChatNameInput" placeholder="Nom personnalisé" style="width:100%;margin-top:6px;padding:4px 8px;border:1px solid #E2E8F0;border-radius:6px;font-size:.75rem;font-family:inherit" value="${esc(FLOATING_CHAT.name)}" />
    </div>
    ${emojis.map(e => `<button class="floating-emoji-opt${FLOATING_CHAT.avatar===e?' selected':''}" style="font-size:24px;width:40px;height:40px;border-radius:8px;border:${FLOATING_CHAT.avatar===e?'2px solid #6366F1':'1px solid #E2E8F0'};background:${FLOATING_CHAT.avatar===e?'#EEF2FF':'#fff'};cursor:pointer;display:flex;align-items:center;justify-content:center">${e}</button>`).join('')}
  `;

  panel.querySelectorAll('.floating-emoji-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.textContent.trim();
      FLOATING_CHAT.avatar = emoji;
      localStorage.setItem('wv_chatbot_avatar', emoji);
      _applyFloatingChatAppearance();
      panel.remove();
    });
  });

  const nameInput = panel.querySelector('#floatingChatNameInput');
  nameInput?.addEventListener('change', () => {
    const name = nameInput.value.trim() || 'Assistant CR Master';
    FLOATING_CHAT.name = name;
    localStorage.setItem('wv_chatbot_name', name);
    _applyFloatingChatAppearance();
  });

  document.body.appendChild(panel);
  
  // Fermer au clic extérieur
  setTimeout(() => {
    const close = (e) => {
      if (!panel.contains(e.target) && e.target.closest('#floatingChatbot') === null) {
        panel.remove();
        document.removeEventListener('click', close);
      }
    };
    document.addEventListener('click', close);
  }, 100);
}

window.customizeChatbotAvatar = customizeChatbotAvatar;

function _applyFloatingChatAppearance() {
  const avatarEl = document.getElementById('floatingChatAvatar');
  const nameEl   = document.getElementById('floatingChatName');
  if (avatarEl) avatarEl.textContent = FLOATING_CHAT.avatar;
  if (nameEl) nameEl.textContent = FLOATING_CHAT.name;
}

function _updateFloatingChatModel() {
  const el = document.getElementById('floatingChatModel');
  if (!el) return;
  const modelId = (window.AI?.currentModel) || (window.AI?.defaultModel) || '—';
  const shortName = modelId.split('/').pop() || modelId;
  el.textContent = shortName;
}

/* Envoyer un message dans le chatbot flottant */
async function floatingChatSend() {
  if (FLOATING_CHAT.running) return;
  const input = document.getElementById('floatingChatInput');
  const question = input?.value?.trim();
  if (!question) return;

  if (!window.AI || !window.AI.configured) {
    _addFloatingMessage('assistant', '⚠️ L\'IA n\'est pas configurée. Contactez votre administrateur.');
    return;
  }

  FLOATING_CHAT.running = true;
  if (input) { input.value = ''; input.style.height = 'auto'; }
  const btn = document.getElementById('floatingChatSendBtn');
  if (btn) btn.disabled = true;

  _addFloatingMessage('user', question);
  FLOATING_CHAT.history.push({ role: 'user', content: question });

  // Construire le contexte
  const projects = (window.STATE?.projects || []).filter(p => !p._shared);
  const reports  = (window.STATE?.reports  || []).filter(r => r.user_id === (window.STATE?.userId || ''));
  
  let context = `Tu es un assistant pour l'application "CR Master". Réponds de façon concise et utile en français.\n\n`;
  context += `Contexte utilisateur :\n`;
  context += `- Nombre de projets : ${projects.length}\n`;
  context += `- Nombre de CRs : ${reports.length}\n`;
  
  if (projects.length > 0) {
    context += `- Projets : ${projects.map(p => p.name).join(', ')}\n`;
  }
  
  if (reports.length > 0) {
    const recent = reports.slice(0, 10);
    context += `\nCRs récents :\n`;
    recent.forEach(r => {
      context += `- "${r.meeting_name || 'Sans titre'}" (${r.meeting_date || 'date inconnue'}, statut: ${r.status || 'brouillon'})\n`;
      if (r.key_points_html) {
        const txt = r.key_points_html.replace(/<[^>]+>/g, '').substring(0, 200);
        context += `  Points clés : ${txt}...\n`;
      }
    });
  }

  context += `\nQuestion de l'utilisateur : ${question}\n\nRéponse :`;

  try {
    const model = window.AI.currentModel || window.AI.defaultModel;
    const msgs = document.getElementById('floatingChatMessages');
    
    // Bulle assistant avec typing
    const asstDiv = document.createElement('div');
    asstDiv.style.alignSelf = 'flex-start';
    asstDiv.style.maxWidth = '85%';
    asstDiv.innerHTML = `<div class="floating-chat-typing"><span></span><span></span><span></span></div>`;
    msgs.appendChild(asstDiv);
    msgs.scrollTop = msgs.scrollHeight;

    const full = await (window.aiCallStream || aiCallStream)({
      model,
      messages: [
        { role: 'system', content: context },
        ...FLOATING_CHAT.history.slice(-6)
      ],
      onChunk: (partial) => {
        asstDiv.innerHTML = '';
        const bubble = _createFloatingBubble(partial);
        asstDiv.appendChild(bubble);
        msgs.scrollTop = msgs.scrollHeight;
      },
    });

    asstDiv.innerHTML = '';
    const bubble = _createFloatingBubble(full);
    asstDiv.appendChild(bubble);

    // Bouton copier
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.style.cssText = 'margin-top:4px;font-size:.68rem;color:#64748B;background:none;border:none;cursor:pointer;padding:2px 6px;';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copier';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(full).then(() => {
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copié !';
        setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copier'; }, 1500);
      });
    });
    asstDiv.appendChild(copyBtn);

    FLOATING_CHAT.history.push({ role: 'assistant', content: full });
    msgs.scrollTop = msgs.scrollHeight;

  } catch (e) {
    _addFloatingMessage('assistant', '❌ Erreur : ' + (e.message || 'inconnue'));
    FLOATING_CHAT.history.pop();
  } finally {
    FLOATING_CHAT.running = false;
    if (btn) btn.disabled = false;
  }
}

window.floatingChatSend = floatingChatSend;

function _addFloatingMessage(role, content) {
  const msgs = document.getElementById('floatingChatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `floating-chat-bubble floating-chat-bubble--${role}`;
  if (role === 'assistant') {
    div.innerHTML = _renderMarkdownLite(content);
  } else {
    div.textContent = content;
  }
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function _createFloatingBubble(content) {
  const bubble = document.createElement('div');
  bubble.className = 'floating-chat-bubble floating-chat-bubble--assistant';
  bubble.innerHTML = _renderMarkdownLite(content);
  return bubble;
}

/* Initialisation au chargement */
document.addEventListener('DOMContentLoaded', () => {
  _applyFloatingChatAppearance();

  // Click bouton flottant → ouvrir/fermer
  const btn = document.getElementById('floatingChatbot');
  if (btn) btn.addEventListener('click', toggleFloatingChat);

  // Envoyer avec Entrée
  const input = document.getElementById('floatingChatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        floatingChatSend();
      }
    });
  }

  // Bouton envoyer
  const sendBtn = document.getElementById('floatingChatSendBtn');
  if (sendBtn) sendBtn.addEventListener('click', floatingChatSend);

  // Suggestions cliquables
  document.getElementById('floatingChatMessages')?.addEventListener('click', (e) => {
    const sugg = e.target.closest('.floating-chat-suggestion');
    if (!sugg) return;
    const q = sugg.getAttribute('data-suggest') || '';
    const inp = document.getElementById('floatingChatInput');
    if (inp) inp.value = q;
    floatingChatSend();
  });
});
