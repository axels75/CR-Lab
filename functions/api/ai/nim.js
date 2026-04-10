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

var NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

var CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

// Catalogue curé des modèles NVIDIA NIM recommandés pour la rédaction
// de comptes-rendus (FR/EN). Tous sont gratuits via integrate.api.nvidia.com.
var MODEL_CATALOG = [
  {
    id:       'nvidia/llama-3.1-nemotron-70b-instruct',
    label:    'Nemotron 70B (recommandé)',
    family:   'NVIDIA',
    size:     '70B',
    tags:     ['rédaction', 'français', 'qualité'],
    use_case: 'Excellent pour rédiger, reformuler et structurer des CRs en français. Modèle par défaut.',
    default:  true,
  },
  {
    id:       'meta/llama-3.3-70b-instruct',
    label:    'Llama 3.3 70B',
    family:   'Meta',
    size:     '70B',
    tags:     ['polyvalent', 'rapide'],
    use_case: 'Modèle polyvalent, bon équilibre qualité/vitesse.',
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
    tags:     ['rapide', 'multilingue'],
    use_case: 'Très rapide, excellent en français natif (modèle français).',
  },
  {
    id:       'mistralai/mistral-large-2-instruct',
    label:    'Mistral Large 2',
    family:   'Mistral',
    size:     '123B',
    tags:     ['français', 'qualité'],
    use_case: 'Le meilleur modèle français pour la rédaction professionnelle.',
  },
  {
    id:       'writer/palmyra-creative-122b',
    label:    'Palmyra Creative 122B',
    family:   'Writer',
    size:     '122B',
    tags:     ['créatif', 'rédaction'],
    use_case: 'Spécialisé en rédaction créative et storytelling business.',
  },
  {
    id:       'deepseek-ai/deepseek-r1',
    label:    'DeepSeek R1 (raisonnement)',
    family:   'DeepSeek',
    size:     '671B',
    tags:     ['raisonnement', 'analyse'],
    use_case: 'Raisonnement complexe : extraction d\'actions, analyse de risques, synthèse structurée.',
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

  // GET /api/ai/nim → retourne le catalogue des modèles
  if (req.method === 'GET') {
    return jsonResp(200, {
      models:    MODEL_CATALOG,
      configured: Boolean(env.NVIDIA_API_KEY),
    });
  }

  if (req.method !== 'POST') {
    return jsonResp(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  // Vérifier la clé API
  var apiKey = env.NVIDIA_API_KEY;
  if (!apiKey) {
    return jsonResp(503, {
      error:   'NVIDIA_API_KEY_MISSING',
      message: 'La variable d\'environnement NVIDIA_API_KEY n\'est pas définie sur Cloudflare Pages. Allez dans Settings → Environment Variables → Add → NVIDIA_API_KEY.',
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
  var model = body.model || 'nvidia/llama-3.1-nemotron-70b-instruct';

  // Vérifier que le modèle est dans la liste autorisée (évite l'abus)
  var allowed = MODEL_CATALOG.some(function(m) { return m.id === model; });
  if (!allowed) {
    return jsonResp(400, {
      error:   'MODEL_NOT_ALLOWED',
      model:   model,
      allowed: MODEL_CATALOG.map(function(m) { return m.id; }),
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
