/* =====================================================
   WAVESTONE CR MASTER – import.js  (v3)
   Import amélioré : Mammoth.js DOCX, EML, TXT, coller-texte
   ===================================================== */

'use strict';

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Bouton "Coller du texte"
  const btnPaste = document.getElementById('btnPasteImport');
  if (btnPaste) {
    btnPaste.addEventListener('click', () => openModal('modalPasteImport'));
  }

  // Bouton "Analyser" dans la modale paste
  const btnAnalyse = document.getElementById('btnAnalysePaste');
  if (btnAnalyse) {
    btnAnalyse.addEventListener('click', async () => {
      const text = document.getElementById('pasteImportText').value.trim();
      if (!text || text.length < 5) {
        showToast('Veuillez coller du texte avant d\'analyser.', 'error');
        return;
      }

      const origHTML = btnAnalyse.innerHTML;
      btnAnalyse.disabled = true;
      btnAnalyse.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Analyse en cours…';

      try {
        let parsed = parseContent(text, 'txt');
        const aiUsed = await aiEnhanceParse(text, parsed, (msg) => {
          btnAnalyse.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${msg}`;
        });
        if (aiUsed) parsed = aiUsed;

        prefillForm(parsed);
        closeModal('modalPasteImport');
        document.getElementById('pasteImportText').value = '';
        const via = aiUsed ? ' (IA)' : '';
        const msg = parsed._fieldsFound > 0
          ? `✓ ${parsed._fieldsFound} champ(s) pré-rempli(s)${via}.`
          : 'Texte analysé — aucun champ détecté automatiquement, vous pouvez saisir manuellement.';
        showToast(msg, parsed._fieldsFound > 0 ? 'success' : 'info');
      } finally {
        btnAnalyse.disabled = false;
        btnAnalyse.innerHTML = origHTML;
      }
    });
  }

  bindFileInput();
});

function bindFileInput() {
  const inp = document.getElementById('fileImportInput');
  if (inp && !inp._bound) {
    inp._bound = true;
    inp.addEventListener('change', e => {
      if (e.target.files[0]) handleFileImport(e.target.files[0]);
      e.target.value = ''; // reset pour permettre re-sélection du même fichier
    });
  }
}

/* =====================================================
   POINT D'ENTRÉE — FICHIER
   ===================================================== */
async function handleFileImport(file) {
  const ext      = file.name.split('.').pop().toLowerCase();
  const dropArea = document.getElementById('dropArea');

  // Feedback visuel
  const origHTML = dropArea.innerHTML;
  dropArea.innerHTML = `
    <div class="import-progress">
      <div class="spinner"></div>
      <span>Analyse de <strong>${esc(file.name)}</strong>…</span>
    </div>`;

  try {
    let text   = '';
    let method = '';

    if (ext === 'txt') {
      text   = await readAsText(file);
      method = 'txt';
    } else if (ext === 'eml') {
      text   = await readEml(file);
      method = 'eml';
    } else if (ext === 'docx' || ext === 'doc') {
      const result = await readDocx(file);
      text         = result.text;
      method       = result.method;
    } else if (ext === 'pptx' || ext === 'ppt') {
      const result = await readPptx(file);
      text         = result.text;
      method       = result.method;
    } else {
      showToast('Format non supporté. Utilisez .txt, .eml, .docx ou .pptx', 'error');
      dropArea.innerHTML = origHTML;
      bindFileInput();
      return;
    }

    if (!text || text.trim().length < 10) {
      dropArea.innerHTML = origHTML;
      bindFileInput();
      showImportFallbackModal(file.name,
        `Le fichier "${file.name}" n'a pas pu être lu automatiquement (fichier binaire ou protégé).\n\nSolution : ouvrez le fichier dans Word ou votre messagerie, sélectionnez tout (Ctrl+A), copiez (Ctrl+C), puis cliquez sur "Coller du texte" et collez (Ctrl+V).`);
      return;
    }

    let parsed = parseContent(text, method);

    // Feedback visuel : IA en cours
    dropArea.innerHTML = `
      <div class="import-progress">
        <div class="spinner"></div>
        <span><i class="fa-solid fa-wand-magic-sparkles"></i> Analyse IA du contenu extrait…</span>
      </div>`;
    const aiEnhanced = await aiEnhanceParse(text, parsed);
    if (aiEnhanced) {
      parsed = aiEnhanced;
      method = method + '+ai';
    }

    dropArea.innerHTML = origHTML;
    bindFileInput();

    prefillForm(parsed);

    if (parsed._fieldsFound === 0) {
      showToast(
        `Fichier lu (${method.toUpperCase()}) mais aucun champ détecté. Utilisez "Coller du texte" pour un parsing manuel.`,
        'warning'
      );
      // Pré-remplir la zone de paste avec le texte extrait pour aider l'utilisateur
      setTimeout(() => {
        const pasteArea = document.getElementById('pasteImportText');
        if (pasteArea) pasteArea.value = text.substring(0, 8000);
        openModal('modalPasteImport');
      }, 500);
    } else {
      showToast(
        `"${file.name}" importé (${method}) — ${parsed._fieldsFound} champ(s) pré-rempli(s).`,
        'success'
      );
    }

  } catch(err) {
    console.error('Import error:', err);
    dropArea.innerHTML = origHTML;
    bindFileInput();
    showImportFallbackModal(file.name,
      `Erreur lors de la lecture de "${file.name}".\n\nOuvrez le fichier dans votre application, copiez le texte, puis utilisez "Coller du texte".`);
  }
}

/* =====================================================
   FALLBACK MODAL
   ===================================================== */
function showImportFallbackModal(filename, hint) {
  showToast(`Import automatique impossible — utilisez "Coller du texte".`, 'warning');
  setTimeout(() => {
    const ta = document.getElementById('pasteImportText');
    if (ta) {
      ta.placeholder = hint ||
        `Collez ici le contenu copié depuis "${filename}" (Word, email, etc.) pour que l'application l'analyse.`;
      ta.value = '';
    }
    openModal('modalPasteImport');
  }, 600);
}

/* =====================================================
   READERS
   ===================================================== */
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result || '');
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

function readEml(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      let text = e.target.result || '';
      text = decodeEmailEncoding(text);
      text = extractEmailBody(text);
      resolve(text);
    };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

async function readDocx(file) {
  // ── Mammoth peut s'exposer comme window.mammoth ou mammoth selon le build ──
  const mam = window.mammoth || (typeof mammoth !== 'undefined' ? mammoth : null);

  // ── Méthode 1 : Mammoth.js (meilleur résultat) ──
  if (mam && typeof mam.extractRawText === 'function') {
    try {
      const buf    = await file.arrayBuffer();
      const result = await mam.extractRawText({ arrayBuffer: buf });
      const txt    = (result.value || '').trim();
      if (txt.length > 10) {
        console.log('[import] Mammoth OK, chars:', txt.length);
        return { text: txt, method: 'docx/mammoth' };
      }
    } catch(e) {
      console.warn('[import] Mammoth failed:', e.message);
    }
  }

  // ── Méthode 2 : JSZip + XML word/document.xml ──
  const jsz = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
  if (jsz) {
    try {
      const buf  = await file.arrayBuffer();
      const zip  = await jsz.loadAsync(buf);
      const xmlF = zip.file('word/document.xml');
      if (xmlF) {
        const xmlStr = await xmlF.async('string');
        const txt    = xmlToText(xmlStr).trim();
        if (txt.length > 10) {
          console.log('[import] JSZip XML OK, chars:', txt.length);
          return { text: txt, method: 'docx/jszip' };
        }
      }
    } catch(e) {
      console.warn('[import] JSZip failed:', e.message);
    }
  }

  // ── Méthode 3 : extraction ASCII basique ──
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const bytes = new Uint8Array(e.target.result);
        let text = ''; let run = '';
        for (let i = 0; i < bytes.length; i++) {
          const c = bytes[i];
          if (c >= 32 && c < 127) { run += String.fromCharCode(c); }
          else { if (run.length > 4) text += run + ' '; run = ''; }
        }
        if (run.length > 4) text += run;
        resolve({ text: text.replace(/\s+/g,' ').trim(), method: 'docx/ascii' });
      } catch { resolve({ text: '', method: 'docx/ascii' }); }
    };
    reader.onerror = () => resolve({ text: '', method: 'docx/ascii' });
    reader.readAsArrayBuffer(file);
  });
}

/* =====================================================
   HELPERS EMAIL
   ===================================================== */
function decodeEmailEncoding(raw) {
  // Décoder =?UTF-8?Q?...?=
  return raw
    .replace(/=\?UTF-8\?Q\?(.*?)\?=/gi, (_, enc) =>
      enc.replace(/=([0-9A-F]{2})/gi, (__, hex) =>
        String.fromCharCode(parseInt(hex, 16))).replace(/_/g, ' '))
    .replace(/=\?UTF-8\?B\?(.*?)\?=/gi, (_, enc) => {
      try { return atob(enc); } catch { return enc; }
    })
    .replace(/=\?ISO-8859-1\?Q\?(.*?)\?=/gi, (_, enc) =>
      enc.replace(/=([0-9A-F]{2})/gi, (__, hex) =>
        String.fromCharCode(parseInt(hex, 16))).replace(/_/g, ' '));
}

function extractEmailBody(raw) {
  const lines    = raw.split(/\r?\n/);
  let inBody     = false;
  const body     = [];
  let boundary   = '';
  let skip        = false;

  const boundaryM = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryM) boundary = boundaryM[1].trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inBody && line.trim() === '') { inBody = true; continue; }

    if (!inBody) {
      // Garder Subject, From, To, Date
      if (/^(subject|objet|from|de|date|to|à|cc)\s*:/i.test(line)) body.push(line);
      continue;
    }

    if (boundary && line.startsWith('--' + boundary)) {
      skip = line.includes('--' + boundary + '--'); // fin de message
      continue;
    }
    if (skip) continue;
    if (/^content-type\s*:/i.test(line)) {
      // Sauter les parties non-texte (images, pièces jointes)
      if (/content-type\s*:\s*(?:image|application)\//i.test(line)) skip = true;
      continue;
    }
    if (/^content-transfer-encoding|content-disposition/i.test(line)) continue;

    // Décoder quoted-printable
    const decoded = line.replace(/=([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)));
    if (decoded.trim() !== '--') body.push(decoded);
  }

  return body.join('\n').trim();
}

/* =====================================================
   READER PPTX
   ===================================================== */
async function readPptx(file) {
  const jsz = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
  if (!jsz) {
    console.warn('[import] JSZip absent — pptx non lisible');
    return { text: '', method: 'pptx/none' };
  }
  try {
    const buf = await file.arrayBuffer();
    const zip = await jsz.loadAsync(buf);
    const slideNames = Object.keys(zip.files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const na = parseInt((a.match(/slide(\d+)/i) || [])[1] || 0, 10);
        const nb = parseInt((b.match(/slide(\d+)/i) || [])[1] || 0, 10);
        return na - nb;
      });

    const chunks = [];
    for (let i = 0; i < slideNames.length; i++) {
      const xml = await zip.file(slideNames[i]).async('string');
      const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      const parts = matches
        .map(m => m.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, ''))
        .filter(Boolean);
      if (parts.length) {
        chunks.push(`--- Slide ${i + 1} ---\n${parts.join(' ')}`);
      }
    }
    const txt = chunks.join('\n\n').trim();
    console.log('[import] PPTX OK, slides:', slideNames.length, 'chars:', txt.length);
    return { text: txt, method: 'pptx/jszip' };
  } catch (e) {
    console.warn('[import] PPTX failed:', e.message);
    return { text: '', method: 'pptx/error' };
  }
}

function xmlToText(xml) {
  // Insérer espace aux paragraphes/sauts de ligne Word
  xml = xml.replace(/<w:p[\s>]/g, '\n<w:p ').replace(/<w:br[^>]*>/g, '\n');
  const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return matches
    .map(m => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/* =====================================================
   PARSER PRINCIPAL
   ===================================================== */
function parseContent(text, ext) {
  const result = {
    meeting_name: '', mission_name: '', date: '', location: '',
    facilitator: '', author: '', participants: [], actions: [],
    key_points: '', _fieldsFound: 0,
  };

  const lines    = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fullText = lines.join('\n');

  /* ── DATE ── */
  const dateRE = [
    /(?:date|réunion|meeting|tenue le)[^\n:]*:\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:le|du)\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
    /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i,
  ];
  for (const re of dateRE) {
    const m = fullText.match(re);
    if (m) {
      const parsed = parseDate(m[0]);
      if (parsed) { result.date = parsed; result._fieldsFound++; break; }
    }
  }

  /* ── TITRE / NOM RÉUNION ── */
  const meetingRE = [
    /^(?:objet|sujet|re\s*:|fw\s*:|tr\s*:|fwd?\s*:|subject)\s*:?\s*(.{3,150})/im,
    /(?:réunion|meeting|cr|compte[- ]?rendu)\s*(?:de\s+|:?\s*[-–]?\s*)(.{5,120})/i,
    /^(?:CR|Compte[- ]?rendu|C\.R\.)\s+(?:de\s+|du\s+)?(.{5,100})/im,
    /^(?:PV|Procès[- ]?verbal)\s+(?:de\s+)?(.{5,100})/im,
  ];
  for (const re of meetingRE) {
    const m = fullText.match(re);
    if (m && m[1] && m[1].trim().length > 3) {
      result.meeting_name = m[1].replace(/^(?:re|fwd?|tr|fw)\s*:\s*/i,'').trim().substring(0, 150);
      result._fieldsFound++;
      break;
    }
  }
  if (!result.meeting_name) {
    const first = lines.find(l => l.length >= 10 && l.length < 150
      && !/^(de|from|to|à|date|cc|x-)\s*:/i.test(l)
      && !/^content-/i.test(l));
    if (first) { result.meeting_name = first.substring(0, 150); result._fieldsFound++; }
  }

  /* ── MISSION ── */
  const missionRE = [
    /(?:mission|projet|client|engagement|affaire|programme)\s*[:\-–]\s*(.{5,100})/i,
    /(?:dans le cadre (?:du|de la|de|d[eu]))\s+(.{5,80}?)(?:[,\.;]|\n|$)/i,
    /(?:contexte\s*:)\s*(.{5,100})/i,
  ];
  for (const re of missionRE) {
    const m = fullText.match(re);
    if (m && m[1]) { result.mission_name = m[1].trim().substring(0,100); result._fieldsFound++; break; }
  }

  /* ── LIEU ── */
  const locationM = fullText.match(
    /(?:lieu|localisation|salle|adresse|visio|teams|zoom|webex|meet|google\s+meet|présentiel|distanciel|hybride)[^\n:]*:?\s*(.{3,80})/i);
  if (locationM && locationM[1] && locationM[1].trim().length > 2) {
    result.location = locationM[1].trim().substring(0, 80); result._fieldsFound++;
  }

  /* ── ANIMATEUR ── */
  const facM = fullText.match(
    /(?:animé(?:e)? par|animateur|facilitat(?:eur|rice)|présid(?:é|ent[e]?)|modérat(?:eur|rice)|chair(?:man|woman|person)?)\s*[:\-–]?\s*([A-ZÀ-Ÿa-zà-ÿ][^,\n<]{2,50})/i);
  if (facM && facM[1]) { result.facilitator = cleanName(facM[1]); result._fieldsFound++; }

  /* ── AUTEUR ── */
  const authorM = fullText.match(
    /(?:rédigé(?:e)? par|rédacteur(?:trice)?|auteur(?:e)?|from\s*:|de\s*:)\s*([A-ZÀ-Ÿa-zà-ÿ][^,\n<]{2,60})/i);
  if (authorM && authorM[1]) { result.author = cleanName(authorM[1]); result._fieldsFound++; }

  /* ── PARTICIPANTS ── */
  result.participants = extractParticipants(fullText, lines);
  if (result.participants.length > 0) result._fieldsFound++;

  /* ── ACTIONS ── */
  result.actions = extractActions(fullText, lines);
  if (result.actions.length > 0) result._fieldsFound++;

  /* ── KEY POINTS ── */
  result.key_points = extractKeyPoints(fullText, lines);
  if (result.key_points.length > 30) result._fieldsFound++;

  return result;
}

/* =====================================================
   EXTRACTION PARTICIPANTS
   ===================================================== */
function extractParticipants(fullText, lines) {
  const participants = [];
  const seen         = new Set();

  // 1. Chercher section participants
  const secRE  = /(?:participants?|présents?|invités?|attendees?|liste\s+des?\s+participants?)[^\n]*/i;
  const secIdx = fullText.search(secRE);
  let candidates = [];

  if (secIdx >= 0) {
    const afterSec = fullText.substring(secIdx).split('\n').slice(1, 30);
    candidates = afterSec
      .map(l => l.replace(/^[-•·*►▸▶\d.)\s]+/, '').trim())
      .filter(l => l.length >= 2 && l.length <= 100
        && !/^(?:ordre du jour|points|actions|décisions|suivi|compte.rendu|résumé|objet|date|lieu|mission|bonjour|cordialement|bien\s+cordial|merci)/i.test(l));
  }

  // 2. Headers email : To / Cc
  const toCC = fullText.match(/^(?:to|à|cc)\s*:\s*(.+)/im);
  if (toCC) {
    toCC[1].split(/[,;]/).forEach(s => {
      const name = extractNameFromEmailStr(s.trim());
      if (name && name.length > 2) candidates.push(name);
    });
  }

  // 3. Pattern "Prénom NOM – Société" sur lignes dédiées
  if (candidates.length === 0) {
    lines.forEach(l => {
      if (/^[A-ZÀ-Ÿ][a-zà-ÿ]+\s+[A-ZÀ-Ÿ][A-ZÀ-Ÿa-zà-ÿ\-]{1,}(?:\s*[,|\/–\-].*)?$/.test(l.trim())
          && l.length < 100) {
        candidates.push(l.trim());
      }
    });
  }

  for (const cand of candidates.slice(0, 25)) {
    const key = cand.toLowerCase().trim().substring(0, 30);
    if (seen.has(key)) continue;
    seen.add(key);
    const parts = cand.split(/[,;|\/–\-]/).map(p => p.trim()).filter(Boolean);
    participants.push({
      name:    cleanName(parts[0]) || cand.substring(0, 60),
      company: parts[1] || '',
      role:    parts[2] || '',
    });
  }
  return participants.filter(p => p.name && p.name.length >= 2);
}

/* =====================================================
   EXTRACTION ACTIONS
   ===================================================== */
function extractActions(fullText, lines) {
  const actions = [];

  const secRE   = /(?:actions?|tâches?|suivi|prochaine[s]?\s+étape[s]?|next\s+steps?|à\s+faire|plan\s+d['']actions?)[^\n]*/i;
  const secIdx  = fullText.search(secRE);
  const zone    = secIdx >= 0 ? fullText.substring(secIdx) : fullText;

  // Pattern 1 : "- description | porteur | date"
  const re1 = /[-•·✓✗□✔■]\s*(.{5,120}?)\s*[|\-–]\s*([A-ZÀ-Ÿ][^|\-–\n]{1,40})\s*[|\-–]\s*(\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?)/g;
  let m;
  while ((m = re1.exec(zone)) !== null && actions.length < 30) {
    actions.push({ action: m[1].trim(), owner: m[2].trim(), due: parseDate(m[3]) || m[3], status: 'todo' });
  }

  // Pattern 2 : "action : X; responsable : Y; échéance : Z"
  if (actions.length === 0) {
    const re2 = /action\s*:?\s*([^,;\n]{5,100})(?:[,;].*?(?:responsable|porteur|par)\s*:?\s*([^,;\n]{2,50}))?(?:[,;].*?(?:échéance|deadline|avant le|pour le)\s*:?\s*([^\n,;]{3,20}))?/gi;
    while ((m = re2.exec(zone)) !== null && actions.length < 30) {
      if (m[1]) actions.push({ action: m[1].trim(), owner: (m[2]||'').trim(), due: m[3] ? parseDate(m[3])||'' : '', status:'todo' });
    }
  }

  // Pattern 3 : lignes bullet avec verbe d'action
  if (actions.length === 0) {
    const actionVerbs = /\b(?:préparer|envoyer|transmettre|valider|organiser|contacter|relancer|produire|rédiger|définir|analyser|vérifier|planifier|présenter|mettre en place|faire|réaliser|assurer|communiquer|livrer|finaliser|soumettre|obtenir|confirmer|partager|mettre à jour|créer|développer|traiter)\b/i;
    lines.forEach(l => {
      if (actions.length >= 25) return;
      const clean = l.replace(/^[-•·✓✗□■▶▷*\[\]x✔\d.)\s]+/, '').trim();
      if (clean.length >= 8 && clean.length <= 200 && actionVerbs.test(clean)) {
        actions.push({ action: clean, owner: '', due: '', status: 'todo' });
      }
    });
  }

  return actions;
}

/* =====================================================
   EXTRACTION KEY POINTS
   ===================================================== */
function extractKeyPoints(fullText, lines) {
  const secRE  = /(?:ordre du jour|points?\s+(?:discutés?|abordés?|structurants?)|discussion|notes?|résumé|synthèse|compte[- ]?rendu|observations|échanges|déroulement|contenu)[^\n]*/i;
  const secIdx = fullText.search(secRE);

  if (secIdx >= 0) {
    const section = fullText.substring(secIdx, secIdx + 6000);
    return section.split('\n')
      .filter(l => l.trim().length > 3)
      .slice(0, 80)
      .map(l => l.trim())
      .join('\n');
  }

  // Fallback : corps du texte épuré
  return lines.filter(l =>
    l.length > 20
    && !/^(?:from|to|cc|date|objet|subject|réunion|participants?|actions?|de\s*:|à\s*:|x-|mime|content-)/i.test(l)
  ).slice(0, 60).join('\n');
}

/* =====================================================
   PRÉFILL FORMULAIRE
   ===================================================== */
function prefillForm(parsed) {
  // Remplir seulement si la valeur parsée n'est pas vide
  if (parsed.meeting_name) {
    const el = document.getElementById('fieldMeetingName');
    if (el && !el.value) el.value = parsed.meeting_name;
    else if (el) el.value = parsed.meeting_name; // override car import explicite
  }
  if (parsed.mission_name) {
    const el = document.getElementById('fieldMission');
    if (el) el.value = parsed.mission_name;
  }
  if (parsed.date) {
    const el = document.getElementById('fieldDate');
    if (el) el.value = parsed.date;
  }
  if (parsed.location) {
    const el = document.getElementById('fieldLocation');
    if (el) el.value = parsed.location;
  }
  if (parsed.facilitator) {
    const el = document.getElementById('fieldFacilitator');
    if (el) el.value = parsed.facilitator;
  }
  if (parsed.author) {
    const el = document.getElementById('fieldAuthor');
    if (el) el.value = parsed.author;
  }

  if (parsed.participants?.length > 0) renderParticipants(parsed.participants);
  if (parsed.actions?.length > 0)      renderActions(parsed.actions);

  if (parsed.key_points && parsed.key_points.trim() && STATE.quillEditor) {
    if (parsed._keyPointsHtml) {
      // HTML déjà rendu par l'IA (sanitize minimal)
      STATE.quillEditor.root.innerHTML = sanitizeQuillHtml(parsed.key_points);
    } else {
      const html = parsed.key_points.split('\n')
        .filter(l => l.trim())
        .map(l => {
          // Conserver les listes à puce
          if (/^[-•·*►▸▶]/.test(l)) return `<li>${escHtmlImport(l.replace(/^[-•·*►▸▶]\s*/,''))}</li>`;
          return `<p>${escHtmlImport(l)}</p>`;
        })
        .join('');
      STATE.quillEditor.root.innerHTML = html
        .replace(/(<li>.*<\/li>)+/g, match => `<ul>${match}</ul>`);
    }
  }
}

/* =====================================================
   UTILS
   ===================================================== */
function parseDate(str) {
  if (!str) return '';
  str = str.trim();
  // ISO
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY ou DD.MM.YYYY
  const fr = str.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (fr) {
    const y = fr[3].length === 2 ? '20' + fr[3] : fr[3];
    return `${y}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`;
  }
  // "15 janvier 2026"
  const months = { janvier:1,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,septembre:9,octobre:10,novembre:11,décembre:12 };
  const lit = str.match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i);
  if (lit) {
    const mo = months[lit[2].toLowerCase()];
    if (mo) return `${lit[3]}-${String(mo).padStart(2,'0')}-${lit[1].padStart(2,'0')}`;
  }
  return '';
}

function cleanName(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/[<>"]/g, '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 80);
}

function extractNameFromEmailStr(str) {
  const m = str.match(/^([^<@]+?)\s*(?:<[^>]*>)?$/);
  if (m && m[1].trim().length > 1) return m[1].replace(/['"]/g, '').trim();
  const emailM = str.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return emailM ? emailM[0] : '';
}

function sanitizeQuillHtml(html) {
  // Retire script/style/on*= attributs et balises non autorisées.
  // On ne garde que les tags Quill classiques.
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/<(\/?)(h[1-6])>/gi, '<$1p>'); // headings → paragraphes
  // Supprimer tags non whitelist
  const allowed = /^(?:p|br|ul|ol|li|strong|em|b|i|u|s|a|span|blockquote|pre|code)$/i;
  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (m, tag) => (allowed.test(tag) ? m : ''));
  return s;
}

function escHtmlImport(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* =====================================================
   ENRICHISSEMENT IA (NVIDIA NIM)
   - Relance le parsing quand le regex est faible
   - Ne complète que les champs vides (regex reste prioritaire
     sur les marqueurs explicites du document)
   - No-op silencieux si l'IA n'est pas configurée
   ===================================================== */
async function aiEnhanceParse(text, regexResult, onProgress) {
  if (typeof window.aiCall !== 'function') return null;
  if (!window.AI || !window.AI.configured)  return null;
  if (window.AI._running)                   return null;
  if (!text || text.length < 40)            return null;

  const systemPrompt =
    `Tu extrais les métadonnées d'un compte-rendu de réunion depuis un texte brut ` +
    `(email, notes, Word, PowerPoint, transcription, etc.).\n\n` +
    `Tu réponds UNIQUEMENT avec un objet JSON valide, sans préambule, sans backticks, ` +
    `sans commentaire, de la forme EXACTE :\n` +
    `{\n` +
    `  "meeting_name": "",\n` +
    `  "mission_name": "",\n` +
    `  "date": "YYYY-MM-DD",\n` +
    `  "location": "",\n` +
    `  "facilitator": "",\n` +
    `  "author": "",\n` +
    `  "participants": [{"name":"","company":"","role":""}],\n` +
    `  "actions": [{"action":"","owner":"","due":"YYYY-MM-DD","status":"todo"}],\n` +
    `  "key_points": "<p>…</p><ul><li>…</li></ul>"\n` +
    `}\n\n` +
    `Règles strictes :\n` +
    `- Si un champ n'est pas déterminable, mets-le à "" (chaîne vide).\n` +
    `- Les dates DOIVENT être au format ISO YYYY-MM-DD ou "".\n` +
    `- "participants" : pas de doublons, omets les adresses email seules.\n` +
    `- "actions" : chaque action est une tâche concrète. status toujours "todo".\n` +
    `- "key_points" : synthèse structurée en HTML Quill (<p>...</p>, <ul><li>...</li></ul>). ` +
    `Pas d'entête, pas de <h1>/<h2>, pas de markdown.\n` +
    `- Rédige en français professionnel.`;

  const userMsg = `Texte source :\n\n${text.substring(0, 14000)}`;

  try {
    if (typeof onProgress === 'function') onProgress('IA en cours…');
    const raw = await window.aiCall({
      system:      systemPrompt,
      user:        userMsg,
      temperature: 0.1,
      max_tokens:  2500,
    });

    const json = tryParseAiJson(raw);
    if (!json || typeof json !== 'object') return null;

    return mergeAiResult(regexResult, json);
  } catch (e) {
    console.warn('[import] AI enhance failed:', e.message);
    return null;
  }
}

function tryParseAiJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // Retirer fences markdown si le modèle en a glissé
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // Premier tentative directe
  try { return JSON.parse(s); } catch {}
  // Extraction du premier objet JSON
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

function mergeAiResult(regex, ai) {
  const out = Object.assign({}, regex);
  const scalarFields = ['meeting_name','mission_name','date','location','facilitator','author'];
  for (const k of scalarFields) {
    const aiVal = String(ai[k] || '').trim();
    if (aiVal && !String(out[k] || '').trim()) {
      out[k] = aiVal;
      out._fieldsFound++;
    }
  }
  // Participants : union (regex prioritaire sur la clé nom normalisé)
  const existing = new Set((out.participants || []).map(p =>
    String(p.name || '').toLowerCase().trim().substring(0, 30)
  ));
  const aiParts = Array.isArray(ai.participants) ? ai.participants : [];
  const addedParts = [];
  for (const p of aiParts) {
    const name = cleanName(p && p.name);
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase().substring(0, 30);
    if (existing.has(key)) continue;
    existing.add(key);
    addedParts.push({
      name,
      company: String((p && p.company) || '').trim().substring(0, 80),
      role:    String((p && p.role)    || '').trim().substring(0, 80),
    });
  }
  if (addedParts.length) {
    const hadBefore = (out.participants || []).length > 0;
    out.participants = (out.participants || []).concat(addedParts);
    if (!hadBefore) out._fieldsFound++;
  }

  // Actions : privilégier la liste IA si regex n'en a trouvé aucune
  const aiActs = Array.isArray(ai.actions) ? ai.actions : [];
  if (aiActs.length && (!out.actions || out.actions.length === 0)) {
    out.actions = aiActs
      .filter(a => a && String(a.action || '').trim().length >= 3)
      .slice(0, 40)
      .map(a => ({
        action: String(a.action).trim().substring(0, 300),
        owner:  String(a.owner  || '').trim().substring(0, 80),
        due:    normalizeIsoDate(a.due) || '',
        status: 'todo',
      }));
    if (out.actions.length) out._fieldsFound++;
  }

  // Key points : remplacer si regex vide / trivial
  const aiKp = String(ai.key_points || '').trim();
  if (aiKp.length > 30 && (!out.key_points || out.key_points.trim().length < 30)) {
    out.key_points = aiKp;
    // Marquer comme HTML déjà rendu pour éviter un double-échappement au prefill
    out._keyPointsHtml = true;
    out._fieldsFound++;
  }

  return out;
}

function normalizeIsoDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return parseDate(s) || '';
}

window.handleFileImport = handleFileImport;
