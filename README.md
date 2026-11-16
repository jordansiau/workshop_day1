# Snip

One in-memory Bun backend, two clients: an Angular 19 web app and a zero-dependency Node CommonJS CLI. Restarting the server clears links.

| Request | Result |
| --- | --- |
| POST /api/links with {url} | 201 {code,url,shortUrl,hits,createdAt}; invalid input: 400 {error} |
| GET /api/links | 200 array of link records |
| GET /:code | 302 Location and one hit; unknown code: 404 |

## Branches and checkout

Independent-history branches `backend`, `frontend`, and `cli` keep source files at their roots. `main` mounts exact commits as submodules. `bundle` is generated release output; never edit it manually.

```sh
git clone --recurse-submodules https://github.com/jordansiau/workshop_day1.git
cd workshop_day1
```

A plain clone leaves submodules empty; populate them with `git submodule update --init --recursive`.

## Development

Run `bun start` in backend, `npm ci` then `npm start` in frontend, and `node cli.js help` in cli. Node 20+ is required (CI uses Node 24). Bun 1.4.4 is used for verification.

Frontend development defaults to http://localhost:3000. Another local service currently uses IPv6 localhost:3000; use an explicit IPv4 API override or a common alternate port when integrating. The production frontend uses same-origin `/api`.

Set backend `PORT` and optionally `BASE_URL` (public origin); otherwise `RAILWAY_PUBLIC_DOMAIN` supplies the HTTPS origin. `PUBLIC_DIR` enables static serving. No Railway deployment is performed by these workflows.

## Updating a layer

Commit and push inside the source submodule first, then update and commit its pointer separately on main:

```sh
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push origin main
```

Only one person owns the shared checkout at a time. Never switch branches while another owner is working.
