import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const base = process.env.SNIP_API || 'http://127.0.0.1:3312';
const cli = resolve(process.argv[2] || 'bundle/cli.js');
const get = (path, options) => fetch(base + path, { signal: AbortSignal.timeout(5000), ...options });
let ready = false;
for (let i = 0; i < 60; i++) {
  try { if ((await get('/api/links')).ok) { ready = true; break; } } catch {}
  await new Promise(r => setTimeout(r, 500));
}
assert(ready, 'Server must become ready');
const index = await get('/');
assert.equal(index.status, 200);
assert.match(await index.text(), /<app-root/);
assert.equal((await get('/api/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })).status, 400);
const created = await get('/api/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/snip-smoke' }) });
assert.equal(created.status, 201);
const link = await created.json();
assert.match(link.code, /^[A-Za-z0-9]{6}$/);
assert.equal(link.hits, 0);
assert.equal(new URL(link.shortUrl).origin, base);
const cliRun = args => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, SNIP_API: base } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
assert.match(cliRun(['ls']), new RegExp(link.code));
const redirect = await get('/' + link.code, { redirect: 'manual' });
assert.equal(redirect.status, 302);
assert.equal(redirect.headers.get('location'), link.url);
assert.equal((await (await get('/api/links')).json()).find(item => item.code === link.code).hits, 1);
const added = cliRun(['add', 'https://example.com/from-cli']).trim();
assert((await (await get('/api/links')).json()).some(item => item.shortUrl === added));
assert.equal((await get('/does-not-exist')).status, 404);
console.log('PASS: bundled UI, API validation, creation/listing, redirect, one hit, shared CLI records');
