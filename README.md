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

## Generated release

```sh
node scripts/build-bundle.mjs
node scripts/verify-release.mjs
node scripts/build-bundle.mjs --push
```

The generator advances the three source submodules to remote branch tips, installs the frontend from its lockfile with `npm ci`, builds production assets, and copies the exact server and CommonJS CLI into bundle. `--frozen` builds the already pinned source commits instead. `release.json` records source commits and the immutable base-image digest. Only `--push` publishes Git commits, using `HEAD:bundle` even from a detached submodule. It pushes bundle before main. A repeated unchanged build makes no commits.

Run `bun start` from bundle to serve UI, API and redirects in one process. To test on an alternate port, set `PORT=3312`, `BASE_URL=http://127.0.0.1:3312`, and run `SNIP_API=http://127.0.0.1:3312 node scripts/smoke.mjs` from main. The smoke check confirms shared web/API/CLI records and exactly one redirect hit.

```sh
docker build -t snip ./bundle
docker run --rm -p 3312:3000 -e BASE_URL=http://127.0.0.1:3312 snip
```

The image runs as the unprivileged `bun` user, exposes port 3000, honors PORT, and checks `/api/links` for health. Railway configuration is generated for a future deployment from bundle; main is a superproject, not a deployment source.

## CI and publication

`bundle.yml` is dispatch-only: component pushes cannot find a workflow that exists only on main. Hourly dispatch belongs to an OpenBot channel routine so the user can inspect and stop it there. Rebuilds run tests and a production dependency audit before pushing. A changed bundle explicitly dispatches `docker.yml`, because a push authenticated with `GITHUB_TOKEN` does not trigger another push workflow. The dispatch job alone receives `actions: write`.

`docker.yml` runs on main pushes touching the bundle gitlink or its own workflow, and manual dispatch. It checks pinned release provenance, reruns backend/CLI/frontend tests, compares rebuilt frontend assets, builds the image, smoke-tests it, and scans both container and production dependencies. HIGH/CRITICAL findings fail closed. Only a separate successful publish job receives `packages: write` and GHCR credentials; it loads and publishes the exact tested image without rebuilding.

Intended successful image tags: `ghcr.io/jordansiau/workshop_day1:latest` and `sha-<main-short-sha>`. A tag is not a release until verification and publication actually succeed. Action versions and the Bun Alpine base are pinned by immutable hashes. Angular 19 currently has known high-severity dependency findings, so publication remains blocked pending an approved source upgrade.
