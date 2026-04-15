# JIRA Reporter — Sitecore Marketplace Plugin

Standalone Next.js plugin that lets a Sitecore XM Cloud Page
Builder user report a bug to JIRA Cloud in two clicks.

## Local dev

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill values.
3. `npm run dev` — plugin at `http://localhost:3002`.
4. Open `tests/e2e/dev-host.html` in a browser for a mock
   host to drive the plugin without a Sitecore tenant.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on :3002 |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit suite |
| `npm run test:coverage` | Enforce 80% gate |
| `npm run e2e` | Playwright E2E |
| `npm run typecheck` | tsc --noEmit |

## Environment

See `.env.example`. Required:

- `JIRA_BASE_URL`, `JIRA_SERVICE_EMAIL`, `JIRA_API_TOKEN`
- `XMC_TENANT_URL`
- `ALLOWED_PLUGIN_ORIGIN` (set to the Sitecore Cloud Portal
  origin in production)
- `PLUGIN_ADMIN_EMAILS` — comma-separated email allowlist

KV (optional — falls back to in-memory if unset):

- `KV_REST_API_URL`, `KV_REST_API_TOKEN`

## Deploy

1. Push to `develop`. Vercel builds and deploys on each PR.
2. After production deploy, register the plugin in Sitecore
   Cloud Portal → Developer Studio → Register App →
   Pages Context Panel, URL =
   `https://<vercel-deploy>/extensions/pages-panel`.

## Architecture

See `../../JIRA/CLD-XXX-JIRA-Module-Reporter/doc/` for the
design spec and implementation plan.
