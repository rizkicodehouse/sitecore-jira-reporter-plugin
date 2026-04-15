# TODO — Auth0 integration (replaces stub token auth)

**Status:** Not started. Tracked as follow-up after the
interim `ALLOW_STUB_TOKEN=1` bypass landed in
`src/lib/auth.ts`.

**Priority:** Required before any real tenant onboards —
the current stub bypass disables auth entirely on Preview
and must never reach Production.

## Why this is needed

The installed `@sitecore-marketplace-sdk/client@0.3.1`
does not expose a session-token or JWT method. The plugin
originally planned to call `sdk.getSessionToken()` (see
`docs/design/2026-04-14-jira-reporter-plan.md:3629`) — that
API does not exist in v0.3.x. The code fell back to
hardcoding `"stub-valid-embedded-dev"` as the token, which
`src/lib/auth.ts` only honors when `NODE_ENV !==
"production"` (or now when `ALLOW_STUB_TOKEN=1`).

Sitecore's own recommended auth pattern for Marketplace
plugins with their own backend is **Auth0** via
`@auth0/nextjs-auth0`. Source:

- `docs/experimental-xmc.md` in the `Sitecore/marketplace-sdk`
  repo
- `docs/experimental-ai.md` in the same repo

## Prerequisites

1. **Register the plugin in Sitecore Cloud Portal** —
   follow [marketplace-registration.md](./marketplace-registration.md).
2. **Obtain Auth0 credentials** — either via Cloud Portal
   app registration or by creating an Auth0 app in the
   Sitecore Auth0 tenant. You need:
   - `AUTH0_CLIENT_ID`
   - `AUTH0_CLIENT_SECRET`
3. **Confirm iframe-compatible cookie requirements are
   acceptable** — `sameSite=None; Secure` is required for
   login inside the Sitecore Pages iframe. HTTPS everywhere.

## Target environment variables

Add to Vercel (all three scopes unless noted):

| Variable | Example | Notes |
|----------|---------|-------|
| `AUTH0_SECRET` | (32+ random bytes, base64) | Cookie signing |
| `AUTH0_DOMAIN` | `https://auth.sitecorecloud.io` | Fixed |
| `AUTH0_CLIENT_ID` | (from Cloud Portal) | Per-plugin |
| `AUTH0_CLIENT_SECRET` | (from Cloud Portal) | Per-plugin |
| `AUTH0_AUDIENCE` | `https://api-webapp.sitecorecloud.io` | Fixed |
| `AUTH0_SCOPE` | `openid profile email offline_access` | Fixed |
| `APP_BASE_URL` | `https://<your-app>.vercel.app` | Must be HTTPS |

Generate `AUTH0_SECRET`:

```bash
node -e "console.log(require('crypto')\
  .randomBytes(32).toString('base64'))"
```

## Files to change

| File | Change |
|------|--------|
| `package.json` | Add `@auth0/nextjs-auth0` dependency |
| `src/app/api/auth/[auth0]/route.ts` | New — login/callback/logout/me |
| `src/lib/auth0.ts` | New — configured Auth0 client |
| `src/lib/auth.ts` | Replace `verifySdkSession` to use `auth0.getSession()`; drop `__SDK_VALIDATOR__` and `ALLOW_STUB_TOKEN` |
| `src/lib/api-headers.ts` | Remove `X-Sdk-Token` header (session rides on cookies) |
| `src/app/pages-panel/PagesPanel.tsx` | Drop `sdkToken` state; check `/api/auth/me` to detect auth; redirect to `/api/auth/login` if unauthenticated |
| `src/features/report-bug/useAutoContext.ts` | Remove `sdkToken` option |
| `src/services/jira/client.ts` | Remove `sdkToken` from `JiraClient` options |
| `src/app/api/**/route.ts` (all) | Replace token check with session check |
| `src/app/api/**/route.test.ts` (all) | Mock `auth0.getSession()` instead of `X-Sdk-Token` headers |
| `src/lib/auth.test.ts` | Rewrite against Auth0 session |
| `next.config.mjs` | No change expected — CSP/CORS stay the same |
| `.env.example` | Add the seven Auth0 vars; remove `ALLOW_STUB_TOKEN` |
| `docs/vercel-deployment.md` | Replace stub-token step with Auth0 setup |

Rough scope: ~10-12 files, ~1-2 hours of focused work with
credentials in hand.

## Implementation sketch

### `src/lib/auth0.ts`

```typescript
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  session: {
    cookie: {
      sameSite: "none",
      secure: true,
      httpOnly: true
    }
  }
});
```

### `src/lib/auth.ts` (new shape)

```typescript
import { auth0 } from "./auth0";
import type { SdkSession } from "./types";

export async function verifySdkSession(
  _req: Request
): Promise<SessionResult> {
  const session = await auth0.getSession();
  if (!session) {
    return { ok: false, status: 401, reason: "no-session" };
  }
  return {
    ok: true,
    session: {
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      tenantId: getTenantId(_req) ?? ""
    }
  };
}
```

### Client side

`PagesPanel.tsx` drops all `sdkToken` plumbing. On mount,
it fetches `/api/auth/me`. On 401, it redirects:

```typescript
window.location.href =
  `/api/auth/login?returnTo=${encodeURIComponent(
    window.location.pathname
  )}`;
```

## Test strategy

- Unit: mock `auth0.getSession()` in each route test
- Integration: add one smoke test that hits
  `/api/auth/login` → follows redirect → lands back with
  session cookie → calls `/api/settings` → gets 200
- E2E (Playwright): extend the existing flow to log in
  once via storage state, reuse for all specs

## Rollout plan

1. Implement in a feature branch, keep
   `ALLOW_STUB_TOKEN=1` on Preview untouched.
2. Deploy to a **separate** Preview URL. Verify login flow
   works end-to-end inside the Sitecore Pages iframe.
3. Remove `ALLOW_STUB_TOKEN` from Preview env vars.
4. Promote to Production.
5. Delete this TODO doc once done.

## References

- Sitecore experimental XMC auth docs —
  `Sitecore/marketplace-sdk` / `docs/experimental-xmc.md`
- `@auth0/nextjs-auth0` v4 docs —
  <https://github.com/auth0/nextjs-auth0>
- Iframe cookie requirements —
  <https://web.dev/samesite-cookies-explained/>
