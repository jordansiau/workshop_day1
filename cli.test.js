'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { main, browserCommand, launchBrowser } = require('./cli');

function invoke(args, deps = {}) {
  const stdout = [], stderr = [];
  return main(args, { env: {}, out: s => stdout.push(s), err: s => stderr.push(s), ...deps })
    .then(code => ({ code, stdout: stdout.join('\n'), stderr: stderr.join('\n') }));
}
function child(args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['cli.js', ...args], { cwd: __dirname, env: { ...process.env, ...env }, windowsHide: true });
    let stdout = '', stderr = '';
    p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b);
    p.once('error', reject); p.once('close', code => resolve({ code, stdout, stderr }));
  });
}

test('help and invalid arguments never request API', async () => {
  const fetch = () => { throw new Error('Unexpected request'); };
  for (const args of [[], ['help'], ['-h'], ['--help']]) assert.equal((await invoke(args, { fetch })).code, 0);
  for (const args of [['nope'], ['add'], ['add', 'file:///x'], ['add', 'https://x', 'extra'], ['ls', 'extra'], ['open', '../x'], ['open', 'abcdef', 'extra'], ['help', 'extra']]) {
    const result = await invoke(args, { fetch }); assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.doesNotMatch(result.stderr, /Unexpected/);
  }
  assert.equal((await invoke(['ls'], { env: { SNIP_API: 'https://x/path' }, fetch })).code, 1);
});

test('mock API: subprocess output, exit codes, request body and errors', async t => {
  let links = [], posted;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/links' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      posted = JSON.parse(body); links = [{ code: 'Ab12Cd', hits: 0, url: posted.url, shortUrl: 'https://snip.test/Ab12Cd', createdAt: new Date().toISOString() }];
      res.writeHead(201); res.end(JSON.stringify(links[0]));
    } else if (req.url === '/api/links') res.end(JSON.stringify(links));
    else { res.writeHead(404); res.end(JSON.stringify({ error: 'Unknown code' })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const env = { SNIP_API: `http://127.0.0.1:${server.address().port}` };
  assert.deepEqual(await child(['ls'], env), { code: 0, stdout: 'No links yet.\n', stderr: '' });
  const added = await child(['add', 'https://example.com/?a=1&b=2'], env);
  assert.equal(added.code, 0); assert.equal(added.stdout, 'https://snip.test/Ab12Cd\n'); assert.equal(added.stderr, '');
  assert.deepEqual(posted, { url: 'https://example.com/?a=1&b=2' });
  const list = await child(['ls'], env); assert.equal(list.code, 0); assert.match(list.stdout, /CODE\s+HITS\s+URL\nAb12Cd\s+0\s+https:/);
  const missing = await child(['open', '000000'], env); assert.equal(missing.code, 1); assert.equal(missing.stdout, ''); assert.match(missing.stderr, /404: Unknown code/);
});

test('open asks once with manual redirect then launches only Location', async () => {
  let calls = 0, target;
  const result = await invoke(['open', 'Ab12Cd'], { fetch: async (url, options) => {
    calls++; assert.equal(url.pathname, '/Ab12Cd'); assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://example.com/?a=1&b=2' } });
  }, launch: async url => target = url });
  assert.equal(result.code, 0); assert.equal(calls, 1); assert.equal(target, 'https://example.com/?a=1&b=2');
});

test('malformed responses, unsafe redirects, API failures and launch failures exit 1', async () => {
  for (const [args, response] of [
    [['ls'], new Response('{}')], [['ls'], new Response('bad')],
    [['add', 'https://example.com'], new Response('{}', { status: 201 })],
    [['open', 'Ab12Cd'], new Response(null, { status: 302 })],
    [['open', 'Ab12Cd'], new Response(null, { status: 302, headers: { Location: 'file:///tmp/x' } })],
    [['ls'], new Response('{"error":"unavailable"}', { status: 503 })]
  ]) assert.equal((await invoke(args, { fetch: async () => response })).code, 1);
  const failed = await invoke(['open', 'Ab12Cd'], { fetch: async () => new Response(null, { status: 302, headers: { Location: 'https://example.com' } }), launch: async () => { throw new Error('launcher failed'); } });
  assert.equal(failed.code, 1); assert.match(failed.stderr, /launcher failed/);
});

test('timeout aborts and unreachable API fails cleanly', async t => {
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const env = { SNIP_API: `http://127.0.0.1:${server.address().port}` };
  const result = await invoke(['ls'], { env, timeoutMs: 30 }); assert.equal(result.code, 1); assert.match(result.stderr, /timed out/);
  const dead = await child(['ls'], { SNIP_API: 'http://127.0.0.1:1' }); assert.equal(dead.code, 1); assert.equal(dead.stdout, ''); assert.match(dead.stderr, /Cannot reach API/);
});

test('browser commands preserve URL and report OS launcher results', async () => {
  const url = "https://example.com/?a='hello'&b=$value";
  assert.deepEqual(browserCommand(url, 'linux'), ['xdg-open', [url]]);
  assert.deepEqual(browserCommand(url, 'darwin'), ['open', [url]]);
  const windows = browserCommand(url, 'win32'); assert.equal(windows[0], 'powershell.exe'); assert.match(windows[1].at(-1), /''hello''/);
  assert.throws(() => browserCommand(url, 'aix'), /unsupported/);
  for (const platform of ['win32', 'darwin', 'linux']) {
    await launchBrowser(url, platform, (command, args, options) => {
      assert.deepEqual([command, args], browserCommand(url, platform)); assert.equal(options.shell, false);
      const emitter = new EventEmitter(); process.nextTick(() => emitter.emit('close', 0)); return emitter;
    });
  }
  await assert.rejects(launchBrowser(url, 'linux', () => {
    const emitter = new EventEmitter(); process.nextTick(() => emitter.emit('error', new Error('ENOENT'))); return emitter;
  }), /Could not launch browser/);
  await assert.rejects(launchBrowser(url, 'linux', () => {
    const emitter = new EventEmitter(); process.nextTick(() => emitter.emit('close', 3)); return emitter;
  }), /code 3/);
});
