import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import backend from './server.js';

const { createHandler, readConfig, startServer } = backend;
const fixtures = mkdtempSync(path.join(tmpdir(), 'snip-backend-'));
const publicDir = path.join(fixtures, 'public');
mkdirSync(publicDir);
writeFileSync(path.join(publicDir, 'index.html'), '<h1>Snip</h1>');
writeFileSync(path.join(fixtures, 'secret.txt'), 'must stay private');
mkdirSync(path.join(fixtures, 'outside'));
writeFileSync(path.join(fixtures, 'outside', 'secret.txt'), 'must stay private');
symlinkSync(path.join(fixtures, 'outside'), path.join(publicDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');

let server;
let origin;
const post = (url, body) => fetch(`${url}/api/links`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeAll(() => {
  server = startServer({ port: 0, baseUrl: 'https://snip.example', publicDir });
  origin = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  // Only remove the unique fixture directory created by this test run.
  if (path.dirname(fixtures) === path.resolve(tmpdir()) && path.basename(fixtures).startsWith('snip-backend-')) {
    rmSync(fixtures, { recursive: true, force: true });
  }
});

describe('shared HTTP contract', () => {
  test('POST -> list -> manual redirect -> exactly one hit', async () => {
    const response = await post(origin, { url: '  https://example.com/path?q=one  ' });
    expect(response.status).toBe(201);
    const link = await response.json();
    expect(Object.keys(link).sort()).toEqual(['code', 'url', 'shortUrl', 'hits', 'createdAt'].sort());
    expect(link.code).toMatch(/^[a-zA-Z0-9]{6}$/);
    expect(link.url).toBe('https://example.com/path?q=one');
    expect(link.shortUrl).toBe(`https://snip.example/${link.code}`);
    expect(link.hits).toBe(0);
    expect(new Date(link.createdAt).toISOString()).toBe(link.createdAt);
    const list = await fetch(`${origin}/api/links`);
    expect(list.status).toBe(200);
    expect(await list.json()).toContainEqual(link);
    const redirect = await fetch(`${origin}/${link.code}`, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(link.url);
    expect(redirect.headers.get('cache-control')).toBe('no-store');
    expect(redirect.headers.get('access-control-expose-headers')).toBe('Location');
    const after = await (await fetch(`${origin}/api/links`)).json();
    expect(after.find(item => item.code === link.code).hits).toBe(1);
  });

  test('redirects Unicode destinations using a valid encoded Location', async () => {
    const url = 'https://example.com/你好?q=hello world';
    const link = await (await post(origin, { url })).json();
    expect(link.url).toBe(url);
    const redirect = await fetch(`${origin}/${link.code}`, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(new URL(url).href);
  });

  test('rejects invalid JSON, shape, and non-HTTP(S) destinations', async () => {
    for (const body of [null, [], {}, { url: 123 }, { url: '' }, { url: '/relative' },
      { url: 'javascript:alert(1)' }, { url: 'ftp://example.com' },
      { url: 'https:example.com' }, { url: 'https://example.com/a\r\nInjected: value' }]) {
      const response = await post(origin, body);
      expect(response.status).toBe(400);
      expect(typeof (await response.json()).error).toBe('string');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    }
    const invalidJson = await fetch(`${origin}/api/links`, { method: 'POST', body: '{' });
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({ error: 'Invalid JSON' });
  });

  test('CORS preflight and error paths', async () => {
    const preflight = await fetch(`${origin}/api/links`, {
      method: 'OPTIONS', headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type');
    const missing = await fetch(`${origin}/missing`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('access-control-allow-origin')).toBe('*');
    expect(typeof (await missing.json()).error).toBe('string');
    expect((await fetch(`${origin}/api/missing`)).status).toBe(404);
    const unsupported = await fetch(`${origin}/api/links`, { method: 'DELETE' });
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('allow')).toContain('POST');
    expect((await fetch(`${origin}/abcdef`, { method: 'POST' })).status).toBe(405);
  });

  test('concurrent and repeated submissions get distinct records', async () => {
    const responses = await Promise.all(Array.from({ length: 50 }, () => post(origin, { url: 'http://example.org' })));
    expect(responses.every(response => response.status === 201)).toBe(true);
    const records = await Promise.all(responses.map(response => response.json()));
    expect(new Set(records.map(record => record.code)).size).toBe(50);
  });

  test('serves index, API before files, and files before code redirects', async () => {
    const index = await fetch(origin);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toBe('<h1>Snip</h1>');
    const link = await (await post(origin, { url: 'https://example.org' })).json();
    writeFileSync(path.join(publicDir, link.code), 'static wins');
    expect(await (await fetch(`${origin}/${link.code}`)).text()).toBe('static wins');
    const records = await (await fetch(`${origin}/api/links`)).json();
    expect(records.find(record => record.code === link.code).hits).toBe(0);
    mkdirSync(path.join(publicDir, 'api'));
    writeFileSync(path.join(publicDir, 'api', 'links'), 'must not shadow API');
    expect(Array.isArray(await (await fetch(`${origin}/api/links`)).json())).toBe(true);
    expect((await fetch(`${origin}/unknown-client-route`)).status).toBe(404);
  });

  test('rejects encoded traversal and symlink escape', async () => {
    for (const suffix of ['/..%2fsecret.txt', '/..%5csecret.txt', '/escape/secret.txt']) {
      const response = await fetch(`${origin}${suffix}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('must stay private');
    }
  });
});

test('collision retry preserves earlier records', async () => {
  const codes = ['aaaaaa', 'aaaaaa', 'bbbbbb'];
  const handler = createHandler({ baseUrl: 'http://localhost:3000', makeCode: () => codes.shift() });
  const request = url => new Request('http://localhost/api/links', { method: 'POST', body: JSON.stringify({ url }) });
  const first = await (await handler(request('https://example.com/one'))).json();
  const second = await (await handler(request('https://example.com/two'))).json();
  expect(first.code).toBe('aaaaaa');
  expect(second.code).toBe('bbbbbb');
  const list = await (await handler(new Request('http://localhost/api/links'))).json();
  expect(list).toEqual([first, second]);
});

test('a fresh server has an empty in-memory Map', async () => {
  const fresh = startServer({ port: 0, baseUrl: 'http://localhost:3000' });
  try {
    expect(await (await fetch(`http://localhost:${fresh.port}/api/links`)).json()).toEqual([]);
  } finally { fresh.stop(true); }
});

test('configuration origin precedence and validation', () => {
  expect(readConfig({}).baseUrl).toBe('http://localhost:3000');
  expect(readConfig({ PORT: '4321' }).baseUrl).toBe('http://localhost:4321');
  expect(readConfig({ RAILWAY_PUBLIC_DOMAIN: 'snip.up.railway.app' }).baseUrl).toBe('https://snip.up.railway.app');
  expect(readConfig({ BASE_URL: 'https://custom.example/', RAILWAY_PUBLIC_DOMAIN: 'ignored.example' }).baseUrl).toBe('https://custom.example');
  for (const PORT of ['0', '65536', 'foo', '1.5']) expect(() => readConfig({ PORT })).toThrow();
  for (const BASE_URL of ['ftp://example.org', 'https://example.org/path', 'https://user:pass@example.org']) {
    expect(() => readConfig({ BASE_URL })).toThrow();
  }
});
