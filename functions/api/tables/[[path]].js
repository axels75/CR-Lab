/**
 * Cloudflare Pages Function — REST API over D1
 * Route : /api/tables/:table[/:id]
 *
 * Binding requis dans wrangler.toml :
 *   [[d1_databases]]
 *   binding = "DB"
 *   database_name = "cr-master-db"
 *   database_id   = "..."
 *
 * Tables supportées : user_profiles, projects, meeting_reports,
 *   participant_profiles, project_members, cr_templates, invitations
 *
 * Schéma de chaque table :
 *   id          TEXT PRIMARY KEY
 *   data        TEXT   (JSON stringifié du contenu métier)
 *   created_at  INTEGER (ms epoch)
 *   updated_at  INTEGER (ms epoch)
 *   deleted     INTEGER DEFAULT 0  (0=actif, 1=supprimé)
 */

'use strict';

var ALLOWED_TABLES = [
  'user_profiles',
  'projects',
  'meeting_reports',
  'participant_profiles',
  'project_members',
  'cr_templates',
  'invitations'
];

var CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization'
};

export async function onRequest(context) {
  var req = context.request;
  var env = context.env;

  /* ── Preflight CORS ── */
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  /* ── Vérifier le binding D1 ── */
  var db = env.DB;
  if (!db) {
    return jsonResp(503, {
      error:   'D1_NOT_CONFIGURED',
      message: 'Binding D1 absent. Ajoutez [[d1_databases]] binding="DB" dans wrangler.toml et redéployez.'
    });
  }

  /* ── Parser la route ── */
  var url   = new URL(req.url);
  // context.params.path est un tableau ex: ["user_profiles"] ou ["user_profiles","abc-123"]
  var parts = [];
  if (context.params && context.params.path) {
    if (Array.isArray(context.params.path)) {
      parts = context.params.path;
    } else {
      parts = String(context.params.path).split('/').filter(Boolean);
    }
  } else {
    // Fallback : extraire depuis url.pathname
    var after = url.pathname.replace(/^\/api\/tables\/?/, '');
    parts = after ? after.split('/').filter(Boolean) : [];
  }

  var table = parts[0] || '';
  var id    = parts[1] || '';

  if (!table) {
    return jsonResp(400, { error: 'MISSING_TABLE', message: 'Précisez le nom de la table dans l\'URL.' });
  }
  if (ALLOWED_TABLES.indexOf(table) === -1) {
    return jsonResp(400, { error: 'UNKNOWN_TABLE', table: table, allowed: ALLOWED_TABLES });
  }

  /* ── S'assurer que la table existe avec le bon schéma ── */
  try {
    await ensureTable(db, table);
  } catch (e) {
    return jsonResp(500, { error: 'TABLE_INIT_FAILED', message: String(e.message), table: table });
  }

  /* ── Router la requête ── */
  try {
    var method = req.method.toUpperCase();

    if (method === 'GET'    && !id) return await listRecords(db, table, url);
    if (method === 'GET'    &&  id) return await getRecord(db, table, id);
    if (method === 'POST')          return await createRecord(db, table, req);
    if (method === 'PUT'    &&  id) return await replaceRecord(db, table, id, req);
    if (method === 'PATCH'  &&  id) return await patchRecord(db, table, id, req);
    if (method === 'DELETE' &&  id) return await deleteRecord(db, table, id);

    return jsonResp(405, { error: 'METHOD_NOT_ALLOWED', method: method });
  } catch (e) {
    return jsonResp(500, { error: 'QUERY_ERROR', message: String(e.message), table: table });
  }
}

/* ══════════════════════════════════════════════════
   GESTION DES TABLES (création + migration auto)
   ══════════════════════════════════════════════════ */

async function ensureTable(db, table) {
  // Créer la table si elle n'existe pas
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS "' + table + '" (' +
    '  id         TEXT    PRIMARY KEY,' +
    '  data       TEXT    NOT NULL DEFAULT \'{}\',' +
    '  created_at INTEGER NOT NULL DEFAULT 0,' +
    '  updated_at INTEGER NOT NULL DEFAULT 0,' +
    '  deleted    INTEGER NOT NULL DEFAULT 0' +
    ')'
  ).run();

  // Migration : ajouter les colonnes manquantes si la table existait déjà sans elles
  var info = await db.prepare('PRAGMA table_info("' + table + '")').all();
  var cols = (info.results || []).map(function(c) { return c.name; });

  if (cols.indexOf('data') === -1) {
    await db.prepare('ALTER TABLE "' + table + '" ADD COLUMN data TEXT NOT NULL DEFAULT \'{}\'').run();
  }
  if (cols.indexOf('created_at') === -1) {
    await db.prepare('ALTER TABLE "' + table + '" ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0').run();
  }
  if (cols.indexOf('updated_at') === -1) {
    await db.prepare('ALTER TABLE "' + table + '" ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0').run();
  }
  if (cols.indexOf('deleted') === -1) {
    await db.prepare('ALTER TABLE "' + table + '" ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0').run();
  }
}

/* ══════════════════════════════════════════════════
   OPÉRATIONS CRUD
   ══════════════════════════════════════════════════ */

/* ── GET /table?page=1&limit=100&search=... ── */
async function listRecords(db, table, url) {
  var limit  = Math.min(parseInt(url.searchParams.get('limit')  || '100', 10), 500);
  var page   = Math.max(parseInt(url.searchParams.get('page')   || '1',   10), 1);
  var search = (url.searchParams.get('search') || '').toLowerCase();
  var offset = (page - 1) * limit;

  var countStmt, rowsStmt, countResult, rowsResult;

  if (search) {
    countStmt = db.prepare(
      'SELECT COUNT(*) as cnt FROM "' + table + '" WHERE deleted=0 AND lower(data) LIKE ?'
    ).bind('%' + search + '%');
    rowsStmt = db.prepare(
      'SELECT id, data, created_at, updated_at FROM "' + table + '" WHERE deleted=0 AND lower(data) LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind('%' + search + '%', limit, offset);
  } else {
    countStmt = db.prepare('SELECT COUNT(*) as cnt FROM "' + table + '" WHERE deleted=0');
    rowsStmt  = db.prepare(
      'SELECT id, data, created_at, updated_at FROM "' + table + '" WHERE deleted=0 ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset);
  }

  countResult = await countStmt.first();
  rowsResult  = await rowsStmt.all();

  var total = (countResult && countResult.cnt) ? Number(countResult.cnt) : 0;
  var rows  = (rowsResult.results || []).map(function(row) {
    return deserializeRow(row);
  });

  return jsonResp(200, { data: rows, total: total, page: page, limit: limit, table: table });
}

/* ── GET /table/:id ── */
async function getRecord(db, table, id) {
  var row = await db.prepare(
    'SELECT id, data, created_at, updated_at FROM "' + table + '" WHERE id=? AND deleted=0'
  ).bind(id).first();

  if (!row) return jsonResp(404, { error: 'NOT_FOUND', id: id });
  return jsonResp(200, deserializeRow(row));
}

/* ── POST /table ── */
async function createRecord(db, table, req) {
  var body = await parseBody(req);
  var now  = Date.now();
  var id   = body.id || makeUUID();

  // Fusionner les champs système dans l'objet métier
  var record = Object.assign({}, body, {
    id:         id,
    created_at: now,
    updated_at: now
  });

  // Stocker le contenu métier dans la colonne `data` (JSON)
  var dataStr = JSON.stringify(record);

  await db.prepare(
    'INSERT OR REPLACE INTO "' + table + '" (id, data, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, 0)'
  ).bind(id, dataStr, now, now).run();

  return jsonResp(201, record);
}

/* ── PUT /table/:id ── */
async function replaceRecord(db, table, id, req) {
  var body     = await parseBody(req);
  var now      = Date.now();

  // Récupérer le created_at existant pour ne pas l'écraser
  var existing = await db.prepare(
    'SELECT created_at FROM "' + table + '" WHERE id=?'
  ).bind(id).first();

  var createdAt = (existing && existing.created_at) ? existing.created_at : now;

  var record = Object.assign({}, body, {
    id:         id,
    created_at: createdAt,
    updated_at: now
  });

  var dataStr = JSON.stringify(record);

  await db.prepare(
    'INSERT OR REPLACE INTO "' + table + '" (id, data, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, 0)'
  ).bind(id, dataStr, createdAt, now).run();

  return jsonResp(200, record);
}

/* ── PATCH /table/:id ── */
async function patchRecord(db, table, id, req) {
  var body = await parseBody(req);
  var now  = Date.now();

  // Lire l'enregistrement existant
  var row  = await db.prepare(
    'SELECT id, data, created_at, updated_at FROM "' + table + '" WHERE id=? AND deleted=0'
  ).bind(id).first();

  var existing = row ? deserializeRow(row) : { id: id, created_at: now };

  var record = Object.assign({}, existing, body, {
    id:         id,
    created_at: existing.created_at,
    updated_at: now
  });

  var dataStr = JSON.stringify(record);

  await db.prepare(
    'INSERT OR REPLACE INTO "' + table + '" (id, data, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, 0)'
  ).bind(id, dataStr, existing.created_at, now).run();

  return jsonResp(200, record);
}

/* ── DELETE /table/:id (soft delete) ── */
async function deleteRecord(db, table, id) {
  await db.prepare(
    'UPDATE "' + table + '" SET deleted=1, updated_at=? WHERE id=?'
  ).bind(Date.now(), id).run();

  return new Response(null, { status: 204, headers: CORS });
}

/* ══════════════════════════════════════════════════
   UTILITAIRES
   ══════════════════════════════════════════════════ */

/* Reconstituer un objet plat depuis la ligne SQL */
function deserializeRow(row) {
  var obj = {};
  try { obj = JSON.parse(row.data || '{}'); } catch(e) { obj = {}; }
  // S'assurer que les champs système sont présents même si absents du JSON
  obj.id         = obj.id         || row.id;
  obj.created_at = obj.created_at || row.created_at || 0;
  obj.updated_at = obj.updated_at || row.updated_at || 0;
  return obj;
}

async function parseBody(req) {
  try {
    var text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch(e) {
    return {};
  }
}

function makeUUID() {
  var h = '0123456789abcdef';
  var r = '';
  for (var i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      r += '-';
    } else if (i === 14) {
      r += '4';
    } else if (i === 19) {
      r += h[(Math.random() * 4 | 0) + 8];
    } else {
      r += h[Math.random() * 16 | 0];
    }
  }
  return r;
}

function jsonResp(status, data) {
  var headers = Object.assign({ 'Content-Type': 'application/json' }, CORS);
  return new Response(JSON.stringify(data), { status: status, headers: headers });
}
