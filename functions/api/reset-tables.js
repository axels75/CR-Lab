export async function onRequest(context) {
  var env = context.env;
  var db = env.DB;
  
  var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!db) {
    return new Response(JSON.stringify({ error: 'NO_DB' }), { status: 503, headers: CORS });
  }

  var tables = ['user_profiles','projects','meeting_reports','participant_profiles','project_members','cr_templates','invitations'];
  var results = {};

  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    try {
      // Supprimer l'ancienne table si elle existe
      await db.prepare('DROP TABLE IF EXISTS ' + t).run();
      // Recréer avec le bon schéma
      await db.prepare(
        'CREATE TABLE ' + t + ' (' +
        'id TEXT PRIMARY KEY NOT NULL, ' +
        'created_at INTEGER NOT NULL DEFAULT 0, ' +
        'updated_at INTEGER NOT NULL DEFAULT 0, ' +
        'deleted INTEGER NOT NULL DEFAULT 0, ' +
        'data TEXT NOT NULL DEFAULT \'{}\')'
      ).run();
      results[t] = 'OK — recréée';
    } catch(e) {
      results[t] = 'ERREUR: ' + e.message;
    }
  }

  return new Response(JSON.stringify({ done: true, results: results }, null, 2), { status: 200, headers: CORS });
}
