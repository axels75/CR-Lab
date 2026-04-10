/**
 * Cloudflare Pages Function — Proxy NVIDIA NIM (OpenAI-compatible)
 * Route : POST /api/ai/nim
 *
 * Le client envoie :
 *   {
 *     model:       "nvidia/llama-3.1-nemotron-70b-instruct",
 *     messages:    [...],
 *     temperature: 0.4,
 *     max_tokens:  1024,
 *     stream:      true | false,
 *   }
 *
 * Le Worker relaie vers https://integrate.api.nvidia.com/v1/chat/completions
 * en ajoutant l'entête Authorization: Bearer ${env.NVIDIA_API_KEY}.
 *
 * ⚠️ La clé NVIDIA NIM DOIT être définie comme variable d'environnement :
 *    Cloudflare Pages → Settings → Environment Variables → NVIDIA_API_KEY
 *
 * Avantages :
 *  - La clé n'est JAMAIS exposée au navigateur
 *  - Support streaming SSE (réponse en temps réel)
 *  - Mêmes contrôles CORS que le reste de l'API
 */

'use strict';

var NIM_ENDPOINT    = 'https://integrate.api.nvidia.com/v1/chat/completions';
var NIM_MODELS_URL  = 'https://integrate.api.nvidia.com/v1/models';

// Fallback de secours utilisé UNIQUEMENT côté serveur si la variable
// d'env NVIDIA_API_KEY n'est pas définie sur Cloudflare Pages.
// La clé n'est jamais renvoyée au navigateur (proxy only).
var FALLBACK_API_KEY = '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';

// Cache module-level du scan catalogue (durée de vie du Worker)
var MODELS_CACHE = { at: 0, data: null };
var MODELS_TTL_MS = 10 * 60 * 1000; // 10 min

var CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

// Catalogue curé des modèles NVIDIA NIM recommandés pour la rédaction
// de comptes-rendus (FR/EN). Tous sont gratuits via integrate.api.nvidia.com
// et vérifiés fonctionnels (200 OK) à la date du dernier test.
// Note : le reste du catalogue NVIDIA est ajouté dynamiquement via /v1/models.
var MODEL_CATALOG = [
  {
    id:       'meta/llama-3.3-70b-instruct',
    label:    'Llama 3.3 70B (recommandé)',
    family:   'Meta',
    size:     '70B',
    tags:     ['rédaction', 'polyvalent', 'rapide'],
    use_case: 'Excellent équilibre qualité/vitesse. Modèle par défaut pour la rédaction de CRs en français.',
    default:  true,
  },
  {
    id:       'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    label:    'Nemotron Super 49B',
    family:   'NVIDIA',
    size:     '49B',
    tags:     ['raisonnement', 'français', 'qualité'],
    use_case: 'Modèle NVIDIA optimisé pour le raisonnement et la rédaction structurée.',
  },
  {
    id:       'meta/llama-3.1-405b-instruct',
    label:    'Llama 3.1 405B (max qualité)',
    family:   'Meta',
    size:     '405B',
    tags:     ['qualité max', 'long contexte'],
    use_case: 'Meilleure qualité possible, plus lent. À utiliser pour les CRs longs et critiques.',
  },
  {
    id:       'mistralai/mixtral-8x22b-instruct-v0.1',
    label:    'Mixtral 8×22B',
    family:   'Mistral',
    size:     '8×22B',
    tags:     ['rapide', 'français'],
    use_case: 'Très rapide, excellent en français natif.',
  },
  {
    id:       'mistralai/mistral-medium-3-instruct',
    label:    'Mistral Medium 3',
    family:   'Mistral',
    size:     '—',
    tags:     ['français', 'rédaction'],
    use_case: 'Modèle français professionnel, idéal pour la rédaction business.',
  },
  {
    id:       'deepseek-ai/deepseek-v3.1',
    label:    'DeepSeek V3.1',
    family:   'DeepSeek',
    size:     '671B',
    tags:     ['raisonnement', 'analyse'],
    use_case: 'Raisonnement complexe : extraction d\'actions, analyse de risques, synthèse structurée.',
  },
  {
    id:       'qwen/qwen3-next-80b-a3b-instruct',
    label:    'Qwen 3 Next 80B',
    family:   'Qwen',
    size:     '80B',
    tags:     ['multilingue', 'qualité'],
    use_case: 'Modèle polyvalent récent, très performant en multilingue.',
  },
  {
    id:       'google/gemma-2-27b-it',
    label:    'Gemma 2 27B',
    family:   'Google',
    size:     '27B',
    tags:     ['rapide', 'léger'],
    use_case: 'Léger et rapide, idéal pour reformulations courtes et corrections.',
  },
  {
    id:       'microsoft/phi-3-medium-4k-instruct',
    label:    'Phi-3 Medium',
    family:   'Microsoft',
    size:     '14B',
    tags:     ['rapide'],
    use_case: 'Très rapide pour les tâches simples : corrections, traductions courtes.',
  },
];

export async function onRequest(context) {
  var req = context.request;
  var env = context.env;

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Résolution de la clé API (env var > fallback hardcodé)
  var apiKey = env.NVIDIA_API_KEY || FALLBACK_API_KEY;

  // GET /api/ai/nim → retourne le catalogue des modèles (curé + scan live)
  if (req.method === 'GET') {
    var merged = await getMergedCatalog(apiKey);
    return jsonResp(200, {
      models:     merged,
      configured: Boolean(apiKey),
      source:     env.NVIDIA_API_KEY ? 'env' : 'fallback',
    });
  }

  if (req.method !== 'POST') {
    return jsonResp(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  if (!apiKey) {
    return jsonResp(503, {
      error:   'NVIDIA_API_KEY_MISSING',
      message: 'Aucune clé NVIDIA NIM disponible (ni env, ni fallback).',
    });
  }

  // Parser le body client
  var body;
  try {
    body = await req.json();
  } catch (e) {
    return jsonResp(400, { error: 'INVALID_JSON', message: String(e.message) });
  }

  // Validation minimale + garde-fous
  if (!body || typeof body !== 'object') {
    return jsonResp(400, { error: 'BAD_BODY' });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResp(400, { error: 'MESSAGES_REQUIRED' });
  }

  // Modèle par défaut si non spécifié
  var model = body.model || 'meta/llama-3.3-70b-instruct';

  // Vérifier que le modèle est dans le catalogue (curé OU live)
  var catalog = await getMergedCatalog(apiKey);
  var allowed = catalog.some(function(m) { return m.id === model; });
  if (!allowed) {
    return jsonResp(400, {
      error:   'MODEL_NOT_ALLOWED',
      model:   model,
      allowed: catalog.map(function(m) { return m.id; }),
    });
  }

  // Construire le payload NVIDIA
  var payload = {
    model:       model,
    messages:    body.messages,
    temperature: clamp(body.temperature, 0, 2, 0.4),
    top_p:       clamp(body.top_p, 0, 1, 0.9),
    max_tokens:  clamp(body.max_tokens, 1, 4096, 1024),
    stream:      Boolean(body.stream),
  };

  // Relayer vers NVIDIA NIM
  var upstream;
  try {
    upstream = await fetch(NIM_ENDPOINT, {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type':  'application/json',
        'Accept':        payload.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return jsonResp(502, {
      error:   'UPSTREAM_UNREACHABLE',
      message: String(e.message),
    });
  }

  // Erreur upstream → relayer le body pour debug
  if (!upstream.ok) {
    var errText = '';
    try { errText = await upstream.text(); } catch (e) {}
    return jsonResp(upstream.status, {
      error:   'UPSTREAM_ERROR',
      status:  upstream.status,
      body:    errText.substring(0, 1000),
    });
  }

  // Mode streaming → passthrough SSE
  if (payload.stream) {
    var headers = new Headers({
      'Content-Type':                 'text/event-stream',
      'Cache-Control':                'no-cache',
      'Connection':                   'keep-alive',
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    return new Response(upstream.body, { status: 200, headers: headers });
  }

  // Mode non-streaming → JSON classique
  var json;
  try {
    json = await upstream.json();
  } catch (e) {
    return jsonResp(502, { error: 'INVALID_UPSTREAM_JSON' });
  }
  return jsonResp(200, json);
}

function clamp(val, min, max, fallback) {
  var n = Number(val);
  if (Number.isNaN(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function jsonResp(status, data) {
  var headers = Object.assign({ 'Content-Type': 'application/json' }, CORS);
  return new Response(JSON.stringify(data), { status: status, headers: headers });
}

/* =====================================================
   SCAN DYNAMIQUE DU CATALOGUE NVIDIA
   ===================================================== */
async function fetchLiveModels(apiKey) {
  // Cache de 10 min pour éviter de scanner à chaque requête
  var now = Date.now();
  if (MODELS_CACHE.data && (now - MODELS_CACHE.at) < MODELS_TTL_MS) {
    return MODELS_CACHE.data;
  }

  try {
    var r = await fetch(NIM_MODELS_URL, {
      method:  'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept':        'application/json',
      },
    });
    if (!r.ok) return [];
    var json = await r.json();
    var list = Array.isArray(json && json.data) ? json.data : [];

    // Ne garder que les modèles de type "chat" (on exclut embedding, rerank, vision seule, etc.)
    // NVIDIA n'expose pas toujours un champ `type`, donc on filtre par heuristique sur l'id.
    var chatOnly = list.filter(function(m) {
      if (!m || !m.id) return false;
      var id = String(m.id).toLowerCase();
      // Exclusions évidentes
      if (id.indexOf('embed') !== -1)         return false;
      if (id.indexOf('rerank') !== -1)        return false;
      if (id.indexOf('reward') !== -1)        return false;
      if (id.indexOf('guard') !== -1)         return false;  // safety models
      if (id.indexOf('retriever') !== -1)     return false;
      if (id.indexOf('nemoretriever') !== -1) return false;
      if (id.indexOf('ocr') !== -1)           return false;
      if (id.indexOf('asr-') !== -1)          return false;  // ASR = speech
      if (id.indexOf('tts-') !== -1)          return false;  // TTS = speech
      if (id.indexOf('diffusion') !== -1)     return false;  // image gen
      if (id.indexOf('flux') !== -1)          return false;  // image gen
      if (id.indexOf('sdxl') !== -1)          return false;  // image gen
      return true;
    });

    MODELS_CACHE = { at: now, data: chatOnly };
    return chatOnly;
  } catch (e) {
    return [];
  }
}

async function getMergedCatalog(apiKey) {
  // 1. Clone du catalogue curé
  var curatedById = {};
  var merged = MODEL_CATALOG.map(function(m) {
    curatedById[m.id] = true;
    return Object.assign({}, m);
  });

  // 2. Scan live → on ajoute les modèles manquants
  var live = await fetchLiveModels(apiKey);
  for (var i = 0; i < live.length; i++) {
    var lm = live[i];
    if (curatedById[lm.id]) continue;

    // Décodage du nom / de la taille depuis l'id
    var parts  = String(lm.id).split('/');
    var family = parts.length > 1 ? parts[0] : 'NVIDIA';
    var slug   = parts.length > 1 ? parts[1] : parts[0];
    var size   = _guessSize(slug);
    var label  = _prettyLabel(slug);

    merged.push({
      id:       lm.id,
      label:    label,
      family:   _prettyFamily(family),
      size:     size || '—',
      tags:     ['scanné'],
      use_case: 'Modèle détecté dynamiquement dans le catalogue NVIDIA NIM.',
    });
  }
  return merged;
}

function _guessSize(slug) {
  var m = String(slug).match(/(\d+x\d+b|\d+\.?\d*b)/i);
  return m ? m[1].toUpperCase() : '';
}
function _prettyLabel(slug) {
  return String(slug)
    .replace(/-instruct$/i, '')
    .replace(/-v\d+(\.\d+)?$/i, '')
    .split(/[-_]/)
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}
function _prettyFamily(fam) {
  var map = {
    'meta':       'Meta',
    'mistralai':  'Mistral',
    'nvidia':     'NVIDIA',
    'google':     'Google',
    'microsoft':  'Microsoft',
    'deepseek-ai':'DeepSeek',
    'writer':     'Writer',
    'qwen':       'Qwen',
    'ibm':        'IBM',
    'databricks': 'Databricks',
    'upstage':    'Upstage',
    'baichuan-inc':'Baichuan',
    'snowflake':  'Snowflake',
    'yentinglin': 'Community',
    'tiiuae':     'TII',
    'adept':      'Adept',
    'thudm':      'THUDM',
  };
  var k = String(fam).toLowerCase();
  return map[k] || (fam.charAt(0).toUpperCase() + fam.slice(1));
}
