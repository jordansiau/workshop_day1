const { randomInt } = require('node:crypto');
const { realpathSync } = require('node:fs');
const { realpath, stat } = require('node:fs/promises');
const path = require('node:path');

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'Location',
};

function randomCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(62)]).join('');
}

function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const rawOrigin = env.BASE_URL || (env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`);
  const origin = new URL(rawOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password
      || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment');
  }
  return {
    port,
    baseUrl: origin.origin,
    publicDir: env.PUBLIC_DIR ? realpathSync(path.resolve(env.PUBLIC_DIR)) : undefined,
  };
}

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { ...CORS, 'Cache-Control': 'no-store', ...headers } });
}

function failure(message, status, headers) {
  return json({ error: message }, status, headers);
}

function isInside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function createHandler({ baseUrl, publicDir, links = new Map(), makeCode = randomCode }) {
  return async function handle(request) {
    const pathname = new URL(request.url).pathname;
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (pathname === '/api/links') {
      if (request.method === 'GET') return json([...links.values()]);
      if (request.method !== 'POST') {
        return failure('Method not allowed', 405, { Allow: 'GET, POST, OPTIONS' });
      }
      let body;
      try { body = await request.json(); }
      catch { return failure('Invalid JSON', 400); }
      if (!body || typeof body.url !== 'string' || !body.url.trim()) {
        return failure('url must be an absolute HTTP(S) URL', 400);
      }
      const url = body.url.trim();
      try {
        const parsed = new URL(url);
        if (!/^https?:\/\//i.test(url) || /[\u0000-\u001f\u007f]/.test(url)
            || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid URL');
      } catch { return failure('url must be an absolute HTTP(S) URL', 400); }

      // Reserve the code and record without awaiting, so concurrent POSTs cannot overwrite it.
      let code;
      do { code = makeCode(); } while (links.has(code));
      const link = { code, url, shortUrl: `${baseUrl}/${code}`, hits: 0, createdAt: new Date().toISOString() };
      links.set(code, link);
      return json(link, 201);
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) return failure('Not found', 404);
    if (request.method !== 'GET') return failure('Method not allowed', 405, { Allow: 'GET, OPTIONS' });

    if (publicDir) {
      let decoded;
      try { decoded = decodeURIComponent(pathname); }
      catch { return failure('Invalid path', 400); }
      if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').includes('..')) {
        return failure('Not found', 404);
      }
      const candidate = path.resolve(publicDir, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!isInside(publicDir, candidate)) return failure('Not found', 404);
      try {
        const resolved = await realpath(candidate);
        if (!isInside(publicDir, resolved)) return failure('Not found', 404);
        if ((await stat(resolved)).isFile()) {
          return new Response(Bun.file(resolved), { headers: CORS });
        }
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }

    const code = pathname.slice(1);
    const link = /^[A-Za-z0-9]{6}$/.test(code) ? links.get(code) : undefined;
    if (!link) return failure('Not found', 404);
    const response = new Response(null, {
      status: 302,
      headers: { ...CORS, Location: new URL(link.url).href, 'Cache-Control': 'no-store' },
    });
    link.hits += 1;
    return response;
  };
}

function startServer(config = readConfig()) {
  const handle = createHandler(config);
  return Bun.serve({
    port: config.port,
    fetch: handle,
    error(error) {
      console.error('Request failed:', error.message);
      return failure('Internal server error', 500);
    },
  });
}

module.exports = { createHandler, readConfig, startServer };

if (require.main === module) {
  try {
    const server = startServer();
    console.log(`Snip listening on port ${server.port}`);
  } catch (error) {
    console.error(`Cannot start Snip: ${error.message}`);
    process.exitCode = 1;
  }
}
