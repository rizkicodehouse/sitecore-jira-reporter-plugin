# Vercel deployment guide

This guide walks through deploying the Bug Reporter for Jira
plugin to Vercel. Tenant settings and bug-report history are
stored as Sitecore items via the XM Cloud Authoring GraphQL
API — no external database is provisioned from Vercel.

## Prerequisites

- GitHub account with the repo pushed (see step 1 below)
- Vercel account (free Hobby tier works for testing)
- Node.js 22.14+ locally (for generating the encryption key)
- Access to a Sitecore XM Cloud tenant (the plugin persists
  everything there)

## Architecture summary

- **Runtime:** Next.js 15 on Vercel serverless functions
- **Persistence:** Sitecore items under
  `/sitecore/content/{tenant}/{site}/` — written through the
  XMC Authoring GraphQL API from the iframe using the
  Marketplace SDK bearer token. The Vercel backend never
  holds XMC credentials.
- **Templates:** `Feature/BugReporterJira` templates are
  created idempotently on first use by
  `src/services/sitecore/template-provision.ts`.
- **Secrets:** Jira API tokens are AES-256-GCM encrypted at
  rest before being written to the settings item, using a
  per-tenant DEK derived from `SETTINGS_ENCRYPTION_KEY` via
  HKDF-SHA-256.
- **In-memory cache:** `SettingsStore` caches per-tenant
  settings in-process (default 30s TTL).

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ALLOWED_PLUGIN_ORIGIN` | Yes (prod) | Space-separated Sitecore host origins for CSP `frame-ancestors` + CORS |
| `AUTH0_SECRET` | Yes | Cookie signing key (32 random bytes, base64) |
| `AUTH0_DOMAIN` | Yes | `https://auth.sitecorecloud.io` |
| `AUTH0_CLIENT_ID` | Yes | From Cloud Portal credentials dialog |
| `AUTH0_CLIENT_SECRET` | Yes | From Cloud Portal credentials dialog |
| `AUTH0_AUDIENCE` | Yes | `https://api-webapp.sitecorecloud.io` |
| `AUTH0_SCOPE` | Yes | `openid profile email offline_access` |
| `APP_BASE_URL` | Yes | Public HTTPS URL of this deployment |
| `SITECORE_AUTHORING_BASE_URL` | Yes | XMC Authoring GraphQL endpoint used by the client |
| `SETTINGS_ENCRYPTION_KEY` | Strongly recommended | Base64 of 32 bytes. Root KEK for per-tenant DEK derivation |
| `PLUGIN_ADMIN_EMAILS` | Optional | Comma-separated super-admin allowlist |
| `MAX_ATTACHMENT_MB` | Optional | Upload cap (default 25) |
| `SITECORE_TEMPLATE_SETTINGS` | Optional | Pin settings template GUID if deployed via SCS |
| `SITECORE_TEMPLATE_BUG_REPORT` | Optional | Pin bug-report template GUID if deployed via SCS |
| `JIRA_BASE_URL` | Optional | Dev fallback when tenant hasn't set creds via UI |
| `JIRA_SERVICE_EMAIL` | Optional | Dev fallback |
| `JIRA_API_TOKEN` | Optional | Dev fallback |
| `JIRA_DEFAULT_PROJECT_KEY` | Optional | Dev fallback |
| `JIRA_DEFAULT_ISSUE_TYPE` | Optional | Dev fallback (default `Bug`) |
| `XMC_LOCAL_MODE` | **Never in prod** | `true` swaps XMC for the local mock — dev only |

Auth0 credentials come from the Sitecore Cloud Portal
"Create credentials for regular web app" dialog — see
[auth0-cloud-portal-setup.md](./auth0-cloud-portal-setup.md)
for the full walkthrough including the allowed callback /
logout / origin URLs.

Without `SETTINGS_ENCRYPTION_KEY`, the runtime generates an
ephemeral KEK and logs a warning. All encrypted Jira tokens
become unreadable after the next cold start. Set this env
var explicitly before any tenant saves settings.

`XMC_LOCAL_MODE=true` is **dev-only**. It short-circuits the
real Authoring client with an in-process mock that persists
to `.xmc-local/state.json`. Do not set it in any Vercel
environment that points at a real Sitecore tenant.

## Deployment steps

### 1. Push repo to GitHub

```bash
gh repo create sitecore-jira-reporter-plugin --private \
  --source=. --push
```

Or create the repo in the GitHub UI and push manually:

```bash
git remote add origin \
  git@github.com:<org>/sitecore-jira-reporter-plugin.git
git push -u origin main
```

### 2. Import project on Vercel

1. Go to <https://vercel.com/new>.
2. Select the repo.
3. Vercel auto-detects Next.js — accept defaults.
4. **Do not click Deploy yet.** The build will fail without
   `ALLOWED_PLUGIN_ORIGIN`.

### 3. Generate encryption keys

Locally:

```bash
node -e "console.log(require('crypto')\
  .randomBytes(32).toString('base64'))"
```

Run it twice — one value for `SETTINGS_ENCRYPTION_KEY`, a
separate value for `AUTH0_SECRET`.

### 4. Set environment variables

Project → Settings → Environment Variables. Add each for all
three scopes (Production, Preview, Development) unless noted:

- `ALLOWED_PLUGIN_ORIGIN` =
  `https://pages.sitecorecloud.io https://app.sitecorecloud.io`
  (space-separated — `pages` hosts the Pages Context Panel
  iframe, `app` hosts the Full Screen iframe from XMC
  Portfolio)
- `SETTINGS_ENCRYPTION_KEY` = (paste first key from step 3)
- `AUTH0_SECRET` = (paste second key from step 3)
- `AUTH0_DOMAIN` = `https://auth.sitecorecloud.io`
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` = from the Cloud
  Portal "Create credentials" dialog (see
  [auth0-cloud-portal-setup.md](./auth0-cloud-portal-setup.md))
- `AUTH0_AUDIENCE` = `https://api-webapp.sitecorecloud.io`
- `AUTH0_SCOPE` = `openid profile email offline_access`
- `APP_BASE_URL` = public HTTPS URL of this deployment
  (Production scope: the Vercel production URL; Preview
  scope: leave unset and the SDK reads `VERCEL_URL`)
- `SITECORE_AUTHORING_BASE_URL` = your XMC Authoring GraphQL
  endpoint (from the XM Cloud tenant deployment)
- `PLUGIN_ADMIN_EMAILS` = (optional, comma-separated)
- `MAX_ATTACHMENT_MB` = (optional, default 25)

Do **not** set `XMC_LOCAL_MODE` in Vercel — leave it unset
for every Vercel environment.

### 5. Deploy

Click *Deploy* from the project overview. First build should
succeed in ~2 minutes.

### 6. Verify

- Load the deployed URL — the landing page should render.
- Install the plugin in a Sitecore tenant (see
  [marketplace-registration.md](./marketplace-registration.md)),
  open the Pages Context Panel, save tenant config, confirm
  it persists across a redeploy.
- Confirm the settings item and `Bug Reports` folder appear
  under `/sitecore/content/{tenant}/{site}/` in Content
  Editor — the bootstrapper auto-creates them on first use.
- Check Vercel Logs for any `ALLOWED_PLUGIN_ORIGIN`,
  provisioning, or Authoring GraphQL errors.

## Post-deployment

### Register plugin URL in Sitecore

Give the production URL to whoever manages the Sitecore Cloud
Portal marketplace registration. See
[marketplace-registration.md](./marketplace-registration.md).

### Update CORS / frame-ancestors origins if needed

If Sitecore iframes the plugin from origins other than the
two above, append them (space-separated) to
`ALLOWED_PLUGIN_ORIGIN` in Vercel and redeploy. Verify the
actual ancestor origin from devtools:
`window.top.location.origin` inside the iframe.

## Operations

### Sitecore API usage

Every `SettingsStore.get` / `put` call becomes an Authoring
GraphQL read/write against the tenant. The in-process cache
(default 30s TTL — see `src/lib/settings-store.ts`) keeps
read volume low for hot tenants. Bug-report writes and
history reads likewise go through
`src/lib/reports-sitecore-repo.ts`.

Authoring GraphQL rate limits are enforced by XM Cloud, not
Vercel. If you see throttling errors in logs, review the
burst patterns on the Jira flow (each bug creation triggers
one settings read plus one bug-report write).

### Cold-start behaviour

First request after idle hits the Authoring GraphQL endpoint
for tenant settings (~100–200ms added latency depending on
region). Subsequent requests in the same instance hit the
in-memory cache until the 30s TTL expires.

### Rotating the encryption key

Because the per-tenant DEK is derived deterministically from
`SETTINGS_ENCRYPTION_KEY` + `tenantId` via HKDF-SHA-256,
changing the env var invalidates every encrypted Jira token
the plugin has stored across **all** tenants. After rotation
each tenant must re-enter their Jira API token via the
Settings UI; the re-save will re-encrypt under the new key.
Plan rotations accordingly.

## Troubleshooting

### Build fails with `ALLOWED_PLUGIN_ORIGIN is required`

The env var is missing or not available to the Production
scope. Check Project → Settings → Environment Variables.

### Settings appear to reset every cold start

Either `SETTINGS_ENCRYPTION_KEY` is unset (so the ephemeral
KEK can't decrypt tokens written by the previous instance),
or the plugin is still running under `XMC_LOCAL_MODE=true`
in Vercel. Fix whichever applies.

### Settings UI returns 401 on deployed app

Auth0 session cookie is missing or expired. The middleware
should redirect to `/api/auth/login` automatically — if it
doesn't, verify:

- All seven `AUTH0_*` vars are set in the deployed scope
- The callback URL registered in the Cloud Portal matches
  `{APP_BASE_URL}/api/auth/callback` exactly
- Cookies are not blocked by the parent iframe context
  (Sitecore Pages needs `SameSite=None; Secure`, which the
  plugin sets — check browser devtools)

### Settings / bug-report items missing in Sitecore

Check Vercel function logs for provisioning errors. The
bootstrap flow in `src/lib/sitecore-provision.ts` grafts a
settings folder and a `Bug Reports` bucket under
`/sitecore/content/{tenant}/{site}/` the first time the
plugin runs for a tenant. Common failures:

- The Marketplace SDK bearer token in the iframe does not
  have write permission on the target site. Ask the XM Cloud
  admin to confirm the app role.
- `SITECORE_AUTHORING_BASE_URL` points at a stale tenant —
  confirm the URL against XM Cloud Deploy.
- Template GUIDs are pinned via `SITECORE_TEMPLATE_*` env
  vars but do not match what was deployed via Sitecore
  Content Serialization.

### Jira tokens fail to decrypt after redeploy

Symptom: API routes that decrypt Jira creds (e.g.
`/api/jira/create-meta`, `/api/jira/issue`,
`/api/settings`) return 500 with the Node crypto error
`Unsupported state or unable to authenticate data` in Vercel
function logs.

Root cause: the current `SETTINGS_ENCRYPTION_KEY` cannot
re-derive the per-tenant DEK that encrypted the token.
Common triggers:

- The env var was unset on the first deploy, so an ephemeral
  KEK encrypted the token; a later deploy set a real key,
  which does not match.
- The env var value was rotated.
- The stored blob was written against a different `tenantId`
  (e.g. the value in `X-Tenant-Id` now differs from what it
  was at save-time).

Remediation:

1. If you still have the original KEK, restore
   `SETTINGS_ENCRYPTION_KEY` to that value and redeploy.
2. Otherwise have the tenant re-enter their Jira API token
   via the Settings UI. The `put` path overwrites the
   encrypted blob under the new key.

Prevent recurrence by setting `SETTINGS_ENCRYPTION_KEY`
explicitly on the first production deploy (before any tenant
saves settings) and coordinating rotations with a
per-tenant re-save.

## Alternative persistence backends

The deployment intentionally keeps tenant state inside
Sitecore so the plugin remains a single-deploy, zero-DB
install. If a future requirement needs an external store
(e.g. cross-tenant analytics), implement the
`SettingsSitecoreRepo` / `ReportsSitecoreRepo` interfaces in
`src/lib/settings-sitecore-repo.ts` and
`src/lib/reports-sitecore-repo.ts` against the new backend,
then add the driver to
`src/lib/settings-store.ts` / `src/lib/reports-store.ts`.
Those are the only seams that need changing.
