# Auth0 Cloud Portal Setup

Step-by-step guide for filling in the Sitecore Cloud Portal
"Create credentials for regular web app" dialog and wiring
the resulting Auth0 credentials into the plugin.

See [app_credential.png](./images/app_credential.png) for
a screenshot of the dialog this document describes.

## Context

This is the **real-auth** replacement for the interim
`ALLOW_STUB_TOKEN=1` bypass in `src/lib/auth.ts`. Once the
steps below are complete, the follow-up work in
[TODO-auth0-integration.md](./TODO-auth0-integration.md)
can land and the stub bypass can be deleted.

- **Production URL:**
  `https://sitecore-jira-reporter-plugin.vercel.app`
- **Local dev port:** `3002` (from `package.json` dev script)
- **Dev tunnel host pattern:** `*.ngrok-free.app` (declared in
  `next.config.mjs:12-14`)

## Prerequisites

- Admin access to the Sitecore Cloud Portal for your tenant
- Owner/Admin access to the Vercel project
  `sitecore-jira-reporter-plugin`
- `node` installed locally (used to generate `AUTH0_SECRET`)

## Step 1 — Fill in the Cloud Portal dialog

Open Cloud Portal → Developer Studio → Credentials →
**Create credentials for regular web app**.

### Alias

```text
JIRA Reporter Plugin
```

Free-form label. Any name works; this is just how the
credential shows up in the Cloud Portal list.

> **The Cloud Portal rejects wildcards.** Every URL must be
> a valid absolute URL — `https://*.vercel.app` fails
> validation. Register concrete URLs only, and append more
> entries (ngrok, new Preview builds) by editing the
> credential later.

### Allowed callback URLs

Comma-separated list. One entry per environment where the
plugin's `/api/auth/callback` route will be reached:

```text
https://sitecore-jira-reporter-plugin.vercel.app/api/auth/callback,
http://localhost:3002/api/auth/callback
```

- Entry 1 — Production
- Entry 2 — Raw localhost (non-iframe, direct browser)

Add later as needed:

- The specific Vercel Preview URL for the PR under test
  (e.g. `https://sitecore-jira-reporter-plugin-git-<branch>
  -<scope>.vercel.app/api/auth/callback`)
- The current ngrok forwarding URL for real Sitecore iframe
  testing (e.g.
  `https://abc123.ngrok-free.app/api/auth/callback`) —
  rotates on every `ngrok http 3002` restart

### Allowed logout URLs

Same origins, no path:

```text
https://sitecore-jira-reporter-plugin.vercel.app,
http://localhost:3002
```

### Allowed origins URLs

CORS origins — same list:

```text
https://sitecore-jira-reporter-plugin.vercel.app,
http://localhost:3002
```

### Allowed web origins URLs

Used by Auth0 silent authentication — same list:

```text
https://sitecore-jira-reporter-plugin.vercel.app,
http://localhost:3002
```

Click **Create credentials**.

## Step 2 — Copy the generated credentials

The portal displays two values. **Copy both now** — the
secret is shown only once:

- `CLIENT_ID` → becomes `AUTH0_CLIENT_ID`
- `CLIENT_SECRET` → becomes `AUTH0_CLIENT_SECRET`

## Step 3 — Generate `AUTH0_SECRET`

Locally, run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Save the output — this is the cookie signing key
(`AUTH0_SECRET`). Generate once, reuse across all
environments.

## Step 4 — Add env vars to Vercel

Vercel Dashboard → Project `sitecore-jira-reporter-plugin` →
Settings → Environment Variables. Add all seven to
**Production + Preview + Development** scopes:

| Variable | Value | Source |
|---|---|---|
| `AUTH0_SECRET` | (from Step 3) | Generated |
| `AUTH0_DOMAIN` | `https://auth.sitecorecloud.io` | Fixed |
| `AUTH0_CLIENT_ID` | (from Step 2) | Cloud Portal |
| `AUTH0_CLIENT_SECRET` | (from Step 2) | Cloud Portal |
| `AUTH0_AUDIENCE` | `https://api-webapp.sitecorecloud.io` | Fixed |
| `AUTH0_SCOPE` | `openid profile email offline_access` | Fixed |
| `APP_BASE_URL` | see below | Per scope |

`APP_BASE_URL` varies by scope:

- **Production** →
  `https://sitecore-jira-reporter-plugin.vercel.app`
- **Preview** → leave unset; the implementation reads
  Vercel's built-in `VERCEL_URL` and prepends `https://`
- **Development** → `http://localhost:3002`

Mirror the same seven vars in `.env.local` for local dev.

## Step 5 — Trigger the implementation

Once Steps 1-4 are complete, ask Claude to execute
[TODO-auth0-integration.md](./TODO-auth0-integration.md).
That work:

1. Installs `@auth0/nextjs-auth0`
2. Adds `src/lib/auth0.ts` and
   `src/app/api/auth/[auth0]/route.ts`
3. Rewrites `src/lib/auth.ts` around `auth0.getSession()`
4. Drops `X-Sdk-Token`, `sdkToken` plumbing, and
   `ALLOW_STUB_TOKEN`
5. Updates the 12 files in the TODO's change table
6. Rewrites auth tests against mocked sessions

## Step 6 — Verify before removing the stub

After the implementation lands and deploys:

1. Open the Preview URL inside Sitecore Pages → login flow
   should redirect through Auth0 and return with a session
2. Confirm `/api/auth/me` returns user info
3. Confirm an authenticated `/api/settings` call succeeds
4. Only then remove `ALLOW_STUB_TOKEN` from the Preview env
5. Promote to Production

## Adding Preview and ngrok URLs later

The Cloud Portal only accepts valid absolute URLs, so every
new environment must be added explicitly. Edit the
credential in Cloud Portal and append the new URL to all
four lists (callback needs the `/api/auth/callback` path;
the other three lists use origins only).

**Vercel Preview builds:**

Each PR gets a URL like
`https://sitecore-jira-reporter-plugin-git-<branch>
-<scope>.vercel.app`. Register the URL once per branch
under active testing; delete it when the PR merges.

**ngrok tunnel for real Sitecore iframe testing:**

`ngrok http 3002` prints a URL like
`https://abc123.ngrok-free.app` that rotates on every
restart. Either:

- Pay for an ngrok reserved domain so the URL is stable, or
- Update the credential each time you tunnel

See `docs/design/2026-04-15-jira-reporter-dev-setup.md`
section 5b for the ngrok workflow.

## References

- [TODO-auth0-integration.md](./TODO-auth0-integration.md)
  — full implementation plan
- [marketplace-registration.md](./marketplace-registration.md)
  — plugin registration (separate flow, not Auth0)
- [vercel-deployment.md](./vercel-deployment.md) — Vercel
  environment setup
- [@auth0/nextjs-auth0 v4 docs][auth0-docs]
- [Iframe cookie requirements][samesite]

[auth0-docs]: https://github.com/auth0/nextjs-auth0
[samesite]: https://web.dev/samesite-cookies-explained/
