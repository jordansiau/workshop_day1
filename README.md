# Snip frontend

Angular 19 web client for the shared Snip API. Source lives at the root of the independent frontend branch.

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
