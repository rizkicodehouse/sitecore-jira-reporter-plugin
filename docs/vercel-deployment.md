# Vercel deployment guide

This guide walks through deploying the JIRA Reporter plugin to
Vercel with Upstash Redis as the multi-tenant settings store.

## Prerequisites

- GitHub account with the repo pushed (see step 1 below)
- Vercel account (free Hobby tier works for testing)
- Node.js 22.14+ locally (for generating the encryption key)

## Architecture summary

- **Runtime:** Next.js 15 on Vercel serverless functions
- **Persistence:** Upstash Redis (via Vercel Marketplace) for
  per-tenant settings
- **Secrets:** JIRA API tokens are AES-encrypted at rest using
  `SETTINGS_ENCRYPTION_KEY`
- **In-memory cache:** 30s TTL in `SettingsStore` reduces Redis
  read load

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ALLOWED_PLUGIN_ORIGIN` | Yes | CORS + `frame-ancestors` origin |
| `AUTH0_SECRET` | Yes | Cookie signing key (32 random bytes, base64) |
| `AUTH0_DOMAIN` | Yes | `https://auth.sitecorecloud.io` |
| `AUTH0_CLIENT_ID` | Yes | From Cloud Portal credentials dialog |
| `AUTH0_CLIENT_SECRET` | Yes | From Cloud Portal credentials dialog |
| `AUTH0_AUDIENCE` | Yes | `https://api-webapp.sitecorecloud.io` |
| `AUTH0_SCOPE` | Yes | `openid profile email offline_access` |
| `APP_BASE_URL` | Yes | Public HTTPS URL of this deployment |
| `UPSTASH_REDIS_REST_URL` | Yes (multi-tenant) | Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (multi-tenant) | Redis auth |
| `SETTINGS_ENCRYPTION_KEY` | Strongly recommended | AES key for JIRA tokens |
| `PLUGIN_ADMIN_EMAILS` | Optional | Super-admin allowlist |
| `MAX_ATTACHMENT_MB` | Optional | Upload cap (default 25) |

Auth0 credentials come from the Sitecore Cloud Portal
"Create credentials for regular web app" dialog — see
[auth0-cloud-portal-setup.md](./auth0-cloud-portal-setup.md)
for the full walkthrough including the allowed callback /
logout / origin URLs.

Without the Upstash vars, the plugin falls back to an in-memory
settings store that resets on every cold start — acceptable for
local dev, not for production.

Without `SETTINGS_ENCRYPTION_KEY`, production bootstraps an
ephemeral key into Redis and logs a warning. Set it explicitly
so tokens survive a key rotation of Redis itself.

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

### 3. Provision Upstash Redis

1. In the project view, open the *Storage* tab.
2. Click *Create Database* → *Marketplace* → *Upstash* →
   *Redis*.
3. Choose the *Free* plan (10k commands/day, 256MB).
4. Pick a region close to your Vercel deployment region
   (e.g., `us-east-1` / `iad1` for US East).
5. Click *Connect Project* and select all three environments
   (Production, Preview, Development).

Vercel auto-injects `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` — no manual copy/paste needed.

### 4. Generate encryption key

Locally:

```bash
node -e "console.log(require('crypto')\
  .randomBytes(32).toString('base64'))"
```

Copy the output.

### 5. Set remaining env vars

Project → Settings → Environment Variables. Add each for all
three scopes (Production, Preview, Development):

- `ALLOWED_PLUGIN_ORIGIN` = `https://pages.sitecorecloud.io`
- `SETTINGS_ENCRYPTION_KEY` = (paste key from step 4)
- `PLUGIN_ADMIN_EMAILS` = (optional, comma-separated)
- `AUTH0_SECRET` = (generate separately — 32 random bytes
  base64, same command as step 4)
- `AUTH0_DOMAIN` = `https://auth.sitecorecloud.io`
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` = from the
  Cloud Portal "Create credentials" dialog (see
  [auth0-cloud-portal-setup.md](./auth0-cloud-portal-setup.md))
- `AUTH0_AUDIENCE` = `https://api-webapp.sitecorecloud.io`
- `AUTH0_SCOPE` = `openid profile email offline_access`
- `APP_BASE_URL` = the public HTTPS URL of this deployment
  (Production scope: the Vercel production URL; Preview
  scope: leave unset and the SDK reads `VERCEL_URL`)

### 6. Deploy

Click *Deploy* from the project overview. First build should
succeed in ~2 minutes.

### 7. Verify

- Load the deployed URL — the app should render.
- Open the Settings UI → save tenant config → confirm it
  persists across a redeploy or cold start.
- Check Vercel Logs for any `ALLOWED_PLUGIN_ORIGIN` or
  Upstash connection errors.

## Post-deployment

### Register plugin URL in Sitecore

Give the production URL to whoever manages the Sitecore Cloud
Portal marketplace registration. See
[marketplace-registration.md](./marketplace-registration.md).

### Update CORS origin if needed

If Sitecore Pages iframes the plugin from a different origin
than `https://pages.sitecorecloud.io`, update
`ALLOWED_PLUGIN_ORIGIN` in Vercel and redeploy.

## Operations

### Upstash usage monitoring

Free tier = 10k commands/day. The 30s in-memory cache in
`SettingsStore` (see `src/lib/settings-store.ts`) keeps reads
low. If you hit the limit, Vercel logs will surface errors
like `command limit exceeded` — upgrade Upstash plan (pay as
you go ~$0.20 per 100k commands).

### Cold-start behavior

First request after idle hits Redis for tenant settings
(~50ms added latency). Subsequent requests in the same
instance hit the in-memory cache until the 30s TTL expires.

### Rotating the encryption key

Rotating `SETTINGS_ENCRYPTION_KEY` invalidates all stored
JIRA API tokens. Tenants will need to re-enter their tokens
via the Settings UI. Plan rotations accordingly.

## Troubleshooting

### Build fails with `ALLOWED_PLUGIN_ORIGIN is required`

The env var is missing or not available to the Production
scope. Check Project → Settings → Environment Variables.

### Settings reset after every request

`UPSTASH_REDIS_REST_URL` is not set in the current
environment scope. The store silently falls back to memory.

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

### `Unauthorized` / `WRONGPASS` from Upstash

The Marketplace integration was disconnected. Re-connect via
*Storage* tab, or regenerate the token in the Upstash console
and update the env vars.

### JIRA tokens fail to decrypt after redeploy

`SETTINGS_ENCRYPTION_KEY` changed between deploys. Restore
the previous key or have tenants re-enter their tokens.

## Alternative persistence backends

The `SettingsStore` interface only needs `get`/`set` with
JSON values. Alternatives (in order of effort):

- **Neon Postgres** — ~30-line adapter, better if you want
  SQL queries or an admin dashboard later.
- **Supabase** — similar to Neon, includes auth/storage if
  you expand scope.
- **MongoDB Atlas** — JSON-native, free M0 tier.
- **Cloudflare KV** — global edge KV, needs separate account.

See `src/lib/settings-store.ts` `readKv` / `writeKv` — those
are the only two methods that need swapping.
