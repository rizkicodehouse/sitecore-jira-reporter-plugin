# JIRA Reporter Plugin — Dev Setup & Vercel Deployment

Step-by-step guide to run the JIRA Reporter Sitecore Marketplace plugin
locally and deploy it to Vercel for staging/production.

## Prerequisites

- Node.js `>= 20.0.0` (LTS recommended)
- npm `>= 10.0.0`
- An Atlassian Cloud JIRA instance with admin access
- A Sitecore XM Cloud tenant (for real SDK testing)
- A Vercel account (free tier is sufficient for staging)
- [Optional] Upstash Redis account for persistent settings storage

## 1. Clone and Install

```bash
cd /path/to/LauncherDX/src/apps/jira-reporter-plugin
npm install
```

This installs Next.js 15, Sitecore Marketplace SDK, Vitest, Playwright,
and all runtime dependencies.

## 2. Create a JIRA Service Account

The plugin uses a single shared JIRA service account (v1 — no per-user
OAuth). All bugs reported by any Sitecore user are created under this
account in the target JIRA project.

Steps:

1. Log into JIRA as an admin.
2. Create a new user (e.g., `svc-bug-reporter@your-company.com`).
3. Grant the account "Create Issues" permission on the target project.
4. Generate an API token at
   <https://id.atlassian.com/manage-profile/security/api-tokens>.
5. Record the token, service email, and base URL for the next step.

## 3. Configure Environment Variables

Copy the example file and fill in real values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
# JIRA Cloud (required)
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_SERVICE_EMAIL=svc-bug-reporter@your-company.com
JIRA_API_TOKEN=<the API token from step 2>

# Sitecore XM Cloud Authoring endpoint (required for live field lookup)
XMC_TENANT_URL=https://xmc-<tenant>.sitecorecloud.io

# CSP / CORS — origins allowed to iframe the plugin (required in prod)
ALLOWED_PLUGIN_ORIGIN=https://portal.sitecorecloud.io

# Admin allowlist for /api/settings PUT (comma-separated emails)
PLUGIN_ADMIN_EMAILS=you@your-company.com

# Optional: attachment size cap (MB, default 25)
MAX_ATTACHMENT_MB=25

# Optional: Upstash Redis for persistent settings
# Leave blank to use in-memory store (resets on server restart)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

**Never commit `.env.local`.** It is already covered by the plugin's
`.gitignore`.

## 4. Run the Dev Server

```bash
npm run dev
```

The plugin starts at <http://localhost:3000>. Useful routes:

- `/pages-panel` — Pages Context Panel entry (primary)
- `/full-screen` — Full-screen entry (portability harness)
- `/api/health` — health probe returning JIRA configuration status

Note: opening these routes directly in a browser will show the plugin
trying to handshake with `window.parent` via the Marketplace SDK. Since
there is no real Sitecore host, the SDK init will time out after 5s.
Use the local harness below for UI testing.

## 5. Local UI Testing With the Dev Host Harness

A minimal iframe host simulates the Sitecore Pages Context Panel for
local UI iteration:

1. Start the dev server (step 4).
2. Open `tests/e2e/dev-host.html` in a browser (double-click or
   `file://` path).
3. The iframe loads `/pages-panel`.
4. The host auto-posts a `pages.layout` event 500ms after load to
   simulate a rendering selection — the "Report bug" button should
   enable.

For deeper testing (happy path, upload fallback, rate-limit), run the
Playwright specs:

```bash
npx playwright install chromium # once only
npx playwright test tests/e2e/happy-path.spec.ts
```

Note: the E2E specs require a stub mode in the plugin to bypass the
real SDK handshake. See "Known gaps" in the project README for the
current status.

## 5b. Attach Local Dev to a Real Sitecore Tenant (ngrok tunnel)

When you need hot-reload plus a real Marketplace SDK handshake, real
XMC GraphQL calls, and real JIRA submissions against your live tenant,
tunnel `localhost:3002` over HTTPS so Sitecore Pages can iframe it.

### 5b.1 Install ngrok

```bash
npm install -g ngrok
# or: brew install ngrok/ngrok/ngrok
```

Sign up at <https://ngrok.com> (free tier is fine) and connect your
auth token once:

```bash
ngrok config add-authtoken <YOUR_TOKEN>
```

### 5b.2 Start the Tunnel

In a **second terminal** (keep `npm run dev` running in the first):

```bash
ngrok http 3002
```

ngrok prints a forwarding URL like:

```text
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3002
```

Copy that HTTPS URL. It rotates on every ngrok restart unless you pay
for a reserved static domain.

### 5b.3 Relax the Plugin's CSP

Sitecore Pages is hosted at `https://pages.sitecorecloud.io`. The
plugin's `next.config.mjs` restricts iframe parents via
`frame-ancestors`. Set it to allow Sitecore Pages:

```bash
# .env.local
ALLOWED_PLUGIN_ORIGIN=https://pages.sitecorecloud.io
```

Restart `npm run dev` after editing `.env.local` so Next picks it up.

### 5b.4 Register the Tunnel URL in Sitecore Marketplace

1. Go to <https://portal.sitecorecloud.io/> → **Developer Portal** →
   **Marketplace** → **Create Plugin** (or edit an existing dev
   plugin).
2. Fill in:

   - **Name:** JIRA Reporter (dev)
   - **Plugin Root URL:** `https://abc123.ngrok-free.app`
   - **Extension Points:**
     - Pages Context Panel →
       `https://abc123.ngrok-free.app/pages-panel`
     - Full Screen →
       `https://abc123.ngrok-free.app/full-screen`
   - **Permissions:** `xmc.authoring.read`, `pages.context.read`
3. Install the plugin on your dev tenant
   (`codehousef439-launcherxmcadb0-dev23e7`).

### 5b.5 Test End-to-End

1. Open Sitecore Pages on the dev tenant.
2. Select any page → open a rendering → the Context Panel shows the
   "Report bug" button.
3. Click it, fill the summary, submit.
4. Watch the terminal running `npm run dev` — you will see real
   GraphQL calls to `XMC_TENANT_URL` and JIRA API calls.
5. Check the JIRA project you configured in Settings — the ticket
   appears.

Hot reload works: edit any plugin source file and the iframe
auto-refreshes.

### 5b.6 Troubleshooting the Tunnel

**Sitecore shows a blank panel:** the plugin CSP rejected the
iframe. Confirm `ALLOWED_PLUGIN_ORIGIN=https://pages.sitecorecloud.io`
is in `.env.local` and the dev server was restarted.

**Handshake still times out:** ngrok URL changed. Rotate the plugin
URL in the Marketplace registration to the new tunnel.

**Requests to `/api/jira/issue` fail with 502:** the plugin reached
JIRA but JIRA rejected. Check `JIRA_API_TOKEN` and that the service
account has "Create Issues" permission on the project.

**ngrok rate-limits or adds a browser-warning page (free tier):** set
`--host-header=rewrite` or upgrade to remove the interstitial, which
can interfere with the iframe handshake.

### Alternative: Vercel Preview Deploy

If ngrok is blocked on your network, do a one-off Vercel preview
deploy instead. See section 7. Downside: each change needs a redeploy
(no hot reload).

## 6. Run Unit Tests & Typecheck

```bash
npm run typecheck         # TypeScript strict typecheck
npm test                  # Vitest unit tests (73 tests)
npm run test:coverage     # with coverage report
npm run build             # production Next.js build
```

CI runs all four on every push (see `.azdo/build-templates/
tasks-build.yml`).

## 7. Deploy to Vercel

### 7.1 One-Time Project Setup

1. Install the Vercel CLI:

   ```bash
   npm install -g vercel
   ```

2. Log in and link the project (run from the plugin directory):

   ```bash
   cd src/apps/jira-reporter-plugin
   vercel login
   vercel link
   ```

   When prompted:

   - **Set up and deploy?** Yes
   - **Which scope?** Your team/personal account
   - **Link to existing project?** No (first time)
   - **Project name?** `launcherdx-jira-reporter` (or your choice)
   - **Directory?** `./` (current directory)
   - **Override settings?** No — Vercel auto-detects Next.js

### 7.2 Configure Environment Variables in Vercel

Add the same env vars from step 3 via the Vercel dashboard or CLI:

```bash
vercel env add JIRA_BASE_URL production
vercel env add JIRA_SERVICE_EMAIL production
vercel env add JIRA_API_TOKEN production
vercel env add XMC_TENANT_URL production
vercel env add ALLOWED_PLUGIN_ORIGIN production
vercel env add PLUGIN_ADMIN_EMAILS production
```

Repeat with `preview` and `development` targets as needed so preview
deploys also have the config.

**Critical:** `ALLOWED_PLUGIN_ORIGIN` **must** be set to
`https://portal.sitecorecloud.io` in production. The plugin's
`next.config.mjs` hard-fails the build if this is missing in a
production build, because CSP `frame-ancestors` and CORS depend on
it.

### 7.3 Deploy

```bash
vercel              # preview deploy
vercel --prod       # production deploy
```

Vercel returns a URL like
`https://launcherdx-jira-reporter.vercel.app`. Smoke-test it:

```bash
curl https://launcherdx-jira-reporter.vercel.app/api/health
# expect: {"ok":true,"jiraConfigured":true,"settingsLoaded":true,...}
```

### 7.4 Automatic Deploys

Link the Git repo in the Vercel dashboard → Settings → Git. Pick
`feature/CLD-XXX-jira-reporter-plugin` as the preview branch and
`develop` (or `main`) as the production branch. Every push triggers a
fresh deploy.

## 8. Register the Plugin in Sitecore Marketplace

Once deployed to Vercel, register the plugin with Sitecore:

1. Log into Sitecore Cloud Portal.
2. Navigate to **Developer Portal → Marketplace → Create Plugin**.
3. Fill in:

   - **Name:** JIRA Reporter
   - **Plugin Root URL:**
     `https://launcherdx-jira-reporter.vercel.app`
   - **Extension Points:**
     - Pages Context Panel →
       `https://launcherdx-jira-reporter.vercel.app/pages-panel`
     - Full Screen →
       `https://launcherdx-jira-reporter.vercel.app/full-screen`
   - **Permissions (SDK v0.3.x):**
     - `xmc.authoring.read` (datasource fields + user)
     - `pages.context.read`
4. Submit for internal review.
5. Install the plugin on your XM Cloud tenant via
   **Administration → Plugins → Install**.

See `src/apps/jira-reporter-plugin/docs/marketplace-registration.md`
for full details.

## 9. Troubleshooting

### `ALLOWED_PLUGIN_ORIGIN is required in production`

The build script hard-fails if this env var is missing. Set it in
`.env.local` (dev) and in Vercel env settings (deploy).

### Plugin shows "Initialising…" forever / "Handshake timed out"

The Marketplace SDK tried to `postMessage(window.parent, ...)` but
there is no Sitecore host listening. Options:

- **Direct browser load:** the plugin auto-detects this and uses a
  mock SDK with sample page/rendering context — you should see the UI
  render after ~100ms. If you still see the error, hard-reload to
  clear the cached build.
- **Real Sitecore handshake:** use the ngrok tunnel path (section 5b)
  or deploy to Vercel (section 7) and register the URL in Sitecore
  Marketplace.

### `401 Unauthorized` on `/api/settings`

The SDK session token is missing or invalid. In production this is
passed via the `X-Sdk-Token` header after Marketplace SDK handshake
completes. The current dev build uses a stub token — production
token wiring is tracked as an open item in the release checklist.

### JIRA `401` or `403`

Verify `JIRA_API_TOKEN` is valid and the service account has "Create
Issues" permission on the target project key (configured via the
Settings gear in the plugin UI).

### Rate limiting surfacing as `429`

Expected behaviour when > 3 req/s hit the shared service token. The
plugin shows a "Try again in Ns" banner and a Retry button. The queue
respects the `Retry-After` header.

## 10. File Locations Reference

| Topic | Path |
|---|---|
| Plugin source | `src/apps/jira-reporter-plugin/src/` |
| Unit tests | `src/apps/jira-reporter-plugin/src/**/*.test.{ts,tsx}` |
| E2E specs | `src/apps/jira-reporter-plugin/tests/e2e/*.spec.ts` |
| Dev host | `src/apps/jira-reporter-plugin/tests/e2e/dev-host.html` |
| Env example | `src/apps/jira-reporter-plugin/.env.example` |
| Next config | `src/apps/jira-reporter-plugin/next.config.mjs` |
| Vitest config | `src/apps/jira-reporter-plugin/vitest.config.ts` |
| Playwright | `src/apps/jira-reporter-plugin/playwright.config.ts` |
| CI pipeline | `.azdo/build-templates/tasks-build.yml` |
| Design spec | `JIRA/CLD-XXX-JIRA-Module-Reporter/doc/2026-04-14-jira-reporter-design.md` |
| Impl. plan | `JIRA/CLD-XXX-JIRA-Module-Reporter/doc/2026-04-14-jira-reporter-plan.md` |
