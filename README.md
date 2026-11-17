# Snip frontend

Angular 21 web client for the shared Snip API. Source lives at the root of the independent frontend branch.

## Run

npm ci
npm start

Open http://localhost:4200. Development uses http://localhost:3000/api/links. Production builds use same-origin /api/links so the generated Bun bundle works on any host. API_ORIGIN is an injectable override for integration tests or alternate local ports. If localhost:3000 is occupied, use a development proxy or override API_ORIGIN in app.config.ts for local testing; do not commit a machine-specific origin.

## Verify

npx ng build
npx ng test --watch=false --browsers=ChromeHeadless

Build output must remain dist/snip-frontend/browser. Tests cover URL validation, successful creation and table refresh, duplicate submission, API/network errors, and stale refresh responses.

POST /api/links accepts {url} and returns 201 {code,url,shortUrl,hits,createdAt}; 400 errors use {error:string}. GET /api/links returns those records as an array. Opening a shortUrl increments hits on the backend; use Refresh hits to reload counts. Storage clears on backend restart.

The form has inline errors, live feedback, keyboard focus styles and a responsive table. No extra runtime dependencies beyond Angular and RxJS.

Commit and push frontend changes, then update the frontend gitlink on main. The bundle branch is generated; never edit it to fix frontend source.

## Supported toolchain and security verification

The approved security upgrade replaces the tutorial's Angular 19 constraint. Angular framework and compiler packages are pinned to 21.2.26; CLI and the lean @angular/build builders are pinned to 21.2.30. The old webpack-capable @angular-devkit/build-angular package is removed. Application source, API origins, test cases, and output path are preserved.

Angular 21 is in LTS through June 2027 per [Angular support policy](https://angular.dev/reference/releases). Its [compatibility table](https://angular.dev/reference/versions) requires Node ^20.19.0, ^22.12.0, or ^24.0.0; TypeScript >=5.9.0 <6.0.0; RxJS ^6.5.3 or ^7.4.0. Verified locally with Node 22.19.0, npm 11.13.0, TypeScript 5.9.3, RxJS 7.8.2, and zone.js 0.15.1. Use npm ci to reproduce the lockfile.

On 2026-11-17, sequential verification passed: clean npm ci --no-audit, npm audit --audit-level=high, production ng build, then all six unchanged ChromeHeadless tests. The full audit reports 0 critical, 0 high, 16 moderate, 0 low findings. Production-only audit reports zero findings. Piscina is patched to 5.3.2 and tar is absent from the locked tree.

Remaining moderate findings are development-tool dependencies propagated from glob (GHSA-3g3m-2fjr-6pw4) and minimatch (GHSA-g3hv-75wg-m249) through Angular CLI's package-management chain. Keep these under review. npm's suggested Angular CLI 16 downgrade is unsupported; no forced downgrades, audit suppression, or cross-major dependency overrides were applied. Both audits pass the release gate of no HIGH or CRITICAL findings; this is not a claim of zero findings across development tools.
