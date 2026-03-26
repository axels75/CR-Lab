/* =====================================================
   WAVESTONE CR MASTER — Cloudflare Pages Function
   functions/api/ping.js

   Endpoint de test pour vérifier que les Cloudflare
   Pages Functions sont bien actives.
   
   Test : fetch('/api/ping') doit retourner { ok: true }
   ===================================================== */

export async function onRequest(context) {
  const { request } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Cloudflare Pages Functions are active!',
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    }
  );
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
