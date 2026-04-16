# ngrok Dev Checklist

Quick run-list for every time the ngrok URL rotates (free
plan URLs change on each `ngrok http 3002` restart).

For the full one-time Auth0 setup, see
[auth0-cloud-portal-setup.md](./auth0-cloud-portal-setup.md).

## 1. Capture the new ngrok URL

```bash
ngrok http 3002
```

Copy the `https://<slug>.ngrok-free.app` line. Call it
`$NGROK` below.

## 2. Update `.env.local`

Change only the one line that depends on the hostname:

```bash
APP_BASE_URL=https://<slug>.ngrok-free.app
```

Multi-origin alternative (keeps Vercel working without
another edit):

```bash
APP_BASE_URL=https://sitecore-jira-reporter-plugin.vercel.app,https://<slug>.ngrok-free.app
```

The SDK accepts a comma-separated list and resolves the
base URL from the request `Host` at runtime.

## 3. Update the Auth0 application (Cloud Portal)

Append the new ngrok URL to all four allow-lists on the
JIRA Reporter Plugin credential. Callback needs the path;
the others take origins only.

| Field | Value to append |
|---|---|
| Allowed Callback URLs | `$NGROK/api/auth/callback` |
| Allowed Logout URLs | `$NGROK` |
| Allowed Origins (CORS) | `$NGROK` |
| Allowed Web Origins | `$NGROK` |

Save. No client-secret rotation is needed for URL edits.

## 4. Restart the dev server

```bash
# kill the running `next dev` first, then:
npm run dev
```

Required whenever `.env.local` changes — Next.js does not
hot-reload env values.

## 5. Smoke test

1. Open `$NGROK/pages-panel?marketplaceAppTenantId=dev`
   directly in the browser (not inside Pages yet).
2. The panel should redirect to
   `auth.sitecorecloud.io/authorize?...` and then back to
   `$NGROK/api/auth/callback?code=...`.
3. After the callback settles, `/api/xmc/me` should return
   200 with the session user.
4. Only once that works, open the plugin inside Sitecore
   Pages.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `/api/auth/login` → 404 | Middleware not detected | Confirm `src/middleware.ts` exists (not at repo root) |
| `/authorize` → 403 | ngrok URL missing from Auth0 allow-lists | Redo step 3 |
| Callback → 400 `redirect_uri mismatch` | Callback list out of sync with `APP_BASE_URL` | Check step 2 and step 3 reference the same host |
| Login loop (session never sticks) | Iframe cookies blocked | Confirm `auth0.ts` has `sameSite: "none"` + `secure: true`, and you're on HTTPS (ngrok is HTTPS by default) |

## Tip: skip this list entirely

Pay for an ngrok reserved domain (e.g.
`jira-reporter.ngrok.app`). Register it in Auth0 once and
this checklist reduces to "start ngrok, `npm run dev`".
