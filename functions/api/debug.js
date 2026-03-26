export async function onRequest(context) {
  var env = context.env;
  var CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  var info = {
    env_keys: Object.keys(env),
    hasKV: !!env.KV,
    hasDB: !!env.DB,
  };

  if (env.KV) {
    try {
      await env.KV.put('_ping', 'ok');
      var val = await env.KV.get('_ping');
      info.kvTest = val === 'ok' ? 'success' : 'unexpected value: ' + val;
    } catch(e) {
      info.kvTest = 'failed: ' + e.message;
    }
  }

  if (env.DB) {
    try {
      var r = await env.DB.prepare('SELECT 1 AS ok').first();
      info.dbTest = r ? 'success' : 'no result';
    } catch(e) {
      info.dbTest = 'failed: ' + e.message;
    }
  }

  return new Response(JSON.stringify(info, null, 2), { status: 200, headers: CORS });
}
