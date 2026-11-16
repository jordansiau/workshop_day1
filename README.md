# Snip backend

Zero-dependency Bun 1.x URL shortener. Run `bun start` and test with `bun test`.
This branch keeps source files at its root; `main` later mounts it as a submodule.
Repository: https://github.com/jordansiau/workshop_day1.git

## Shared API contract

| Method | Path | Input | Result |
|---|---|---|---|
| POST | `/api/links` | JSON `{ "url": "https://example.com" }` | 201 `{ code, url, shortUrl, hits, createdAt }`; 400 `{ error: string }` for invalid JSON or URL |
| GET | `/api/links` | none | 200 array of the same records, in creation order |
| GET | `/:code` | none | 302 with `Location` set to the original URL, incrementing hits once; 404 `{ error: string }` if unknown |

Codes contain six random base62 characters; collisions are retried. Each successful
POST creates a fresh code, including repeat submissions. URL strings are trimmed
and otherwise preserved; only absolute HTTP(S) URLs are accepted. `hits` starts at
0, and `createdAt` is an ISO timestamp. Unknown routes return 404; unsupported
methods return 405 with `Allow`. Errors use JSON `{ error: string }`.

Open CORS applies to successes and errors; OPTIONS returns 204. `Location` is
exposed for browser clients. API and redirect responses disable caching so each
actual redirect request increments hits. The web UI and CLI share this one API.

## Configuration

- `PORT`: default `3000`, valid range 1–65535.
- `BASE_URL`: HTTP(S) origin for generated `shortUrl` values, highest priority.
- `RAILWAY_PUBLIC_DOMAIN`: fallback origin `https://<domain>`.
- Without either origin variable, use `http://localhost:<PORT>`.
- `PUBLIC_DIR`: optional existing directory relative to the working directory (or
  absolute). `/` serves `index.html`. API routes take priority, then existing
  public files, then short codes. No SPA fallback. Traversal and symlink escapes
  are rejected. The generated bundle uses `PUBLIC_DIR=./public` in its `.env`.

For development the Angular client calls `http://localhost:3000/api/links`; a
deployed bundle should call same-origin `/api/links`. The CLI selects its server
using `SNIP_API`. Set `BASE_URL` to the externally reachable origin when deploying.

## Verification and operations

```sh
bun test
bun start
curl -i -H "Content-Type: application/json" -d '{"url":"https://example.com"}' http://localhost:3000/api/links
curl http://localhost:3000/api/links
curl -i http://localhost:3000/REPLACE_WITH_RETURNED_CODE
curl http://localhost:3000/api/links
```

Expect 201, 200, 302, and then `hits: 1` on that record. Use `curl.exe` on Windows
PowerShell to avoid its curl alias. Stop with Ctrl+C. A GET of `/api/links` is the
readiness check and does not change state. No database, migrations, authentication,
or persistence: restarting loses every link by design. Open CORS and unauthenticated
listing are intentional demo behavior. Never fetch submitted destination URLs on
the server. Roll back by selecting a previously verified backend commit through
main's submodule pointer and rebuilding the release; a restart clears memory.
