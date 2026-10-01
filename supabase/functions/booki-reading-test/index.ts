// Temporary containment: no database client, no elevated credentials, no storage.
// Existing experiment records stay untouched until an isolated backend is ready.
const allowedOrigins = new Set(['https://yehuditamos.github.io']);
Deno.serve((req) => {
  const origin = req.headers.get('origin') || '';
  const allowed = allowedOrigins.has(origin);
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' });
  if (allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'content-type');
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers });
  return new Response(JSON.stringify({ ok: false, error: 'experiment_paused', message: 'ניסוי ההאזנה מושהה עד להשלמת הפרדת המערכות. בוקי הראשית זמינה.' }), { status: 503, headers });
});
