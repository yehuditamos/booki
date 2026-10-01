'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
let handle;
const source = fs.readFileSync('supabase/functions/booki-reading-test/index.ts', 'utf8');
vm.runInNewContext(source, {
  Deno: { serve: fn => { handle = fn; }, env: { get: () => { throw Error('No credentials permitted'); } } },
  Headers, Response, Set, JSON,
  fetch: () => { throw Error('No outbound requests permitted'); },
});
(async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const response = handle(new Request('https://example.test', { method, headers: { origin: 'https://yehuditamos.github.io' } }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'experiment_paused');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://yehuditamos.github.io');
  }
  assert.equal(handle(new Request('https://example.test', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal(handle(new Request('https://example.test', { method: 'OPTIONS', headers: { origin: 'https://yehuditamos.github.io' } })).status, 204);
  const page = fs.readFileSync('booki-reading-pilot.html', 'utf8');
  assert(!page.includes('<script'));
  assert(!page.includes('supabase.co'));
  assert(page.includes('ניסוי ההאזנה מושהה זמנית'));
  console.log('PASS: experimental page cannot collect or send data; endpoint rejects operations without credentials or database calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
