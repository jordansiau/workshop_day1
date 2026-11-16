#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const USAGE = `Snip — tiny URL shortener
Usage:
  snip add <url>    Create a short link (HTTP/HTTPS only)
  snip ls           List code, hits, and original URL
  snip open <code>  Resolve a short code and open its target in your browser
  snip help         Show this help

Environment:
  SNIP_API          API origin (default http://localhost:3000)
Requests time out after 10 seconds. Errors exit with code 1.
`;

function httpUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be an absolute HTTP(S) URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\x00-\x20\x7f]/.test(value)) {
    throw new Error(`${label} must be an absolute HTTP(S) URL without credentials or whitespace.`);
  }
  return parsed;
}

function browserCommand(url, platform = process.platform) {
  httpUrl(url, 'Redirect target');
  if (platform === 'win32') {
    // A literal PowerShell string avoids cmd.exe metacharacter expansion in URLs.
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${url.replace(/'/g, "''")}'`]];
  }
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'linux') return ['xdg-open', [url]];
  throw new Error(`Browser launching is unsupported on ${platform}.`);
}

function launchBrowser(url, platform = process.platform, spawnProcess = spawn) {
  const [command, args] = browserCommand(url, platform);
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { shell: false, stdio: 'ignore', windowsHide: true });
    child.once('error', error => reject(new Error(`Could not launch browser: ${error.message}`)));
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Browser launcher exited with code ${code}.`)));
  });
}

async function request(base, path, options = {}, fetchImpl = fetch, timeoutMs = 10000) {
  try {
    return await fetchImpl(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('API request timed out.');
    throw new Error(`Cannot reach API: ${error.message}`);
  }
}

async function apiError(response) {
  let detail;
  try { detail = (await response.json()).error; } catch {}
  throw new Error(`API returned ${response.status}${typeof detail === 'string' ? `: ${detail}` : '.'}`);
}

async function json(response) {
  try { return await response.json(); } catch { throw new Error('API returned invalid JSON.'); }
}

async function main(args = process.argv.slice(2), deps = {}) {
  const out = deps.out || (value => console.log(value));
  const err = deps.err || (value => console.error(value));
  try {
    const [command, value, ...extra] = args;
    if (!command || ['help', '--help', '-h'].includes(command)) {
      if (args.length > 1) throw new Error('Help accepts no arguments.');
      out(USAGE.trimEnd()); return 0;
    }
    if (!['add', 'ls', 'open'].includes(command)) throw new Error(`Unknown command: ${command}. Run snip help.`);
    if (extra.length || (command === 'ls' ? value !== undefined : value === undefined)) throw new Error(`Invalid arguments for ${command}. Run snip help.`);
    if (command === 'add') httpUrl(value, 'URL');
    if (command === 'open' && !/^[A-Za-z0-9]{6}$/.test(value)) throw new Error('Code must contain exactly six base62 characters.');
    const base = httpUrl((deps.env || process.env).SNIP_API || 'http://localhost:3000', 'SNIP_API');
    if (base.pathname !== '/' || base.search || base.hash) throw new Error('SNIP_API must be an origin without a path, query, or fragment.');
    const call = (path, options) => request(base, path, options, deps.fetch, deps.timeoutMs);
    if (command === 'open') {
      const response = await call(`/${value}`);
      if (response.status !== 302) await apiError(response);
      const location = response.headers.get('location');
      if (!location) throw new Error('API redirect has no Location header.');
      httpUrl(location, 'Redirect target');
      await (deps.launch || launchBrowser)(location);
      return 0;
    }
    const response = await call('/api/links', command === 'add' ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value })
    } : {});
    if (response.status !== (command === 'add' ? 201 : 200)) await apiError(response);
    const data = await json(response);
    if (command === 'add') {
      if (typeof data?.shortUrl !== 'string') throw new Error('API response is missing shortUrl.');
      httpUrl(data.shortUrl, 'shortUrl'); out(data.shortUrl);
    } else {
      if (!Array.isArray(data) || data.some(link => !link || typeof link.code !== 'string' || typeof link.url !== 'string' || !Number.isSafeInteger(link.hits) || link.hits < 0)) throw new Error('API returned an invalid link list.');
      if (!data.length) out('No links yet.');
      else {
        const rows = [['CODE', 'HITS', 'URL'], ...data.map(link => [link.code, String(link.hits), link.url])];
        const widths = [0, 1].map(i => Math.max(...rows.map(row => row[i].length)));
        out(rows.map(row => `${row[0].padEnd(widths[0])}  ${row[1].padStart(widths[1])}  ${row[2]}`).join('\n'));
      }
    }
    return 0;
  } catch (error) { err(`snip: ${error.message}`); return 1; }
}

if (require.main === module) main().then(code => { process.exitCode = code; });
module.exports = { main, request, browserCommand, launchBrowser };
