---
date: 2026-04-14
topic: Sitecore Marketplace SDK and Page Builder extension points
status: research (no code changes)
---

# Research: Sitecore Marketplace SDK & Page Builder Extension Points

Research snapshot dated **2026-04-14**. Scope: evaluate what the
official Sitecore Marketplace SDK supports today for a plugin that
adds a "Report Bug to JIRA" action against a selected rendering in
the XM Cloud Page Builder (SitecoreAI Pages).

## 1. Official Marketplace SDK

The Sitecore Marketplace SDK is a JavaScript / TypeScript monorepo
published by Sitecore under `@sitecore-marketplace-sdk/*`. There is
no single "create-sitecore-xmcloud-plugin" CLI yet; scaffolding is
done by cloning the starter repo.

- Repo: `Sitecore/marketplace-sdk`
  ([github.com/Sitecore/marketplace-sdk](https://github.com/Sitecore/marketplace-sdk)).
- `@sitecore-marketplace-sdk/client` — required, handles the
  sandboxed iframe + postMessage bridge
  ([npm](https://www.npmjs.com/package/@sitecore-marketplace-sdk/client)).
  Latest on npm: **v0.3.2**, published **Feb 2026**
  (`0.3.0`–`0.3.2` series runs Dec 2025 – Feb 2026).
- `@sitecore-marketplace-sdk/core` — internal transport layer,
  pulled in by `client`
  ([npm](https://www.npmjs.com/package/@sitecore-marketplace-sdk/core)).
- `@sitecore-marketplace-sdk/xmc` — optional, typed wrapper over
  XM Cloud REST / GraphQL APIs
  ([npm](https://www.npmjs.com/package/@sitecore-marketplace-sdk/xmc)).
- Starter template (Next.js App Router, React): `Sitecore/marketplace-starter`
  ([github.com/Sitecore/marketplace-starter](https://github.com/Sitecore/marketplace-starter)).
- Documentation root:
  [doc.sitecore.com/mp](https://doc.sitecore.com/mp/en/developers/sdk/latest/sitecore-marketplace-sdk/marketplace-sdk-packages.html).
- Public overview:
  [developers.sitecore.com/learn/getting-started/marketplace](https://developers.sitecore.com/learn/getting-started/marketplace).

Licence: Apache-2.0. Framework support called out in official FAQ:
**React and Next.js** only
([source](https://developers.sitecore.com/learn/getting-started/marketplace)).

## 2. Extension Points in Pages / Page Builder

Per Sitecore's official "Introducing Sitecore Marketplace Custom
Apps" page there are **exactly five extension points today**: one in
Cloud Portal and four in XM Cloud
([source](https://developers.sitecore.com/learn/getting-started/marketplace)).

| # | Name | Host surface | UI location | Context passed |
|---|------|--------------|-------------|----------------|
| 1 | Standalone | Cloud Portal homepage | Launches in a new tab from the portal home | `application.context` only |
| 2 | Full Screen | XMC Portfolio (Sites) | Opened from XMC top bar navigation | `application.context` (no page context) |
| 3 | Pages Context Panel | XMC Page Builder | **Left-side panel** next to the canvas | `application.context` + `pages.context` (subscribable) |
| 4 | Custom Field | XMC Page Builder | Renders *inside a field* on the left page-fields panel or the right component-fields panel (driven by a template field typed `Marketplace Types -> Plugin`) | `application.context` + field `value`, `setValue` |
| 5 | Dashboard Widget | XMC Dashboard | Widget tile in the XMC dashboard | `application.context` + `site.context` |

Registration route fields confirmed by the Sitecore "Configure and
install a custom marketplace app" walkthrough
([source](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-register-app)):

- Full screen — Route URL: `/fullscreen-extension`
- Dashboard widgets — Route URL: `/dashboard-widget-extension`
- Page context panel — Route URL: `/page-contextpanel-extension`
- Custom field — Route URL: `/custom-field-extension`

The Konabos SUGCON Europe 2025 write-up confirms these are currently
the only touchpoints and frames them as "experience-first" touchpoints
rather than app types
([source](https://konabos.com/blog/unlocking-the-sitecore-marketplace-a-deep-dive-from-sugcon-europe-2025)).

## 3. Component-Toolbar Slot

**Verdict: NO dedicated extension point for the in-canvas
component-toolbar (the floating move/duplicate/delete bar above a
selected rendering) exists in Marketplace SDK today.**

Evidence:

- Sitecore's official extension-points list enumerates only the 5
  surfaces above; no "component toolbar", "rendering toolbar", or
  "canvas chrome" slot is listed
  ([source](https://developers.sitecore.com/learn/getting-started/marketplace)).
- Sitecore's marketplace-starter README describes the Pages Context
  Panel extension as the only in-canvas-adjacent surface and its
  sample explicitly "Subscribes to `pages.context` using the SDK to
  handle events. Shows page ID, title, language, and path."
  ([source](https://github.com/Sitecore/marketplace-starter)).
- Akshay Sura's SUGCON Europe 2025 session recap lists only:
  Cloud Portal, XM Cloud Navigation, Pages Context Panel, Custom
  Fields, Dashboard Widgets
  ([source](https://konabos.com/blog/unlocking-the-sitecore-marketplace-a-deep-dive-from-sugcon-europe-2025)).
- No Sitecore docs page, starter sample, or changelog entry exposes
  a `component.toolbar`, `rendering.actions`, or similar registration
  type as of the 2025-12-10 SDK v0.3 release
  ([Dec 2025 changelog](https://developers.sitecore.com/changelog/marketplace/10122025/introducing-marketplace-app-permissions-and-new-event-subscriptions-in-the-sdk)).

**Closest officially supported alternatives, ranked:**

1. **Pages Context Panel** (best fit). It renders in-canvas-adjacent,
   has access to `pages.context`, and as of SDK v0.3 can subscribe
   to *page layout changes* and *field layout changes* — which is
   how we learn that a user selected or moved a rendering
   ([Dec 2025 changelog](https://developers.sitecore.com/changelog/marketplace/10122025/introducing-marketplace-app-permissions-and-new-event-subscriptions-in-the-sdk)).
2. **Custom Field** — only works if we attach a field of type
   `Marketplace Types -> Plugin` to component datasource templates;
   it appears on the right-hand component-fields panel when a
   component with that datasource is selected
   ([source](https://doc.sitecore.com/mp/en/developers/marketplace/enable-a-custom-field-in-the-xm-cloud-page-builder.html),
   referenced from the official overview page).
   Caveat: it invades the content model, so it is intrusive to ship
   as a "bug reporter".
3. **Full Screen** — top-bar button, breaks flow (new modal / route).

## 4. Context APIs

The `client` package exposes a query/mutation API inspired by
GraphQL / React Query
([source](https://github.com/Sitecore/marketplace-sdk/blob/main/packages/client/README.md)).

### `application.context` (available everywhere)

Returned shape, per the official `client` README
([source](https://www.npmjs.com/package/@sitecore-marketplace-sdk/client)):

```javascript
{
  id: 'my-app-id',
  name: 'My App',
  type: 'portal',
  url: 'https://my-app.com/app',
  iconUrl: 'https://my-app.com/assets/icon.png',
  installationId: 'abc1234567890',
  resourceAccess: [
    {
      resourceId: 'resource-1',
      tenantId: 'tenant-1',
      tenantName: 'Example Tenant',
      context: {
        live: '1234567890',
        preview: '0987654321'
      }
    }
  ]
}
```

This gives environment/tenant identifiers and Context IDs but
**not a user email**.

### `pages.context` (Page Builder extension points only)

Invoked as `client.query("pages.context")` and subscribable
([source](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/query-the-page-context.html)).
Per the marketplace-starter README the response exposes at minimum
**page ID, title, language, and path**
([source](https://github.com/Sitecore/marketplace-starter)). A
mutation form `client.mutate("pages.context", { params: { itemId } })`
navigates the canvas to a different page.

> Gap: Sitecore's public docs do **not** publish the full TypeScript
> shape of `pages.context`. It is exposed via the `QueryMap`
> interface in `@sitecore-marketplace-sdk/client` TypeScript defs
> (referenced by the client README) — confirm by reading
> `dist/sdk-types.d.ts` in the installed package.

### Layout & field subscriptions (SDK v0.3, Dec 2025)

The v0.3 changelog adds subscriptions to *page layout* and *field
layout* changes, described as reacting "when … the user of the
SitecoreAI Page builder adds or moves a page component, or edits a
field"
([Dec 2025 changelog](https://developers.sitecore.com/changelog/marketplace/10122025/introducing-marketplace-app-permissions-and-new-event-subscriptions-in-the-sdk)).
That is the mechanism we rely on to know *which rendering is
selected* from inside a Pages Context Panel app. Two related doc
pages exist but were not reachable through my fetcher:

- `subscribe-to-page-events.html`
- `subscribe-to-page-layout-changes.html`
- `subscribe-to-field-changes.html`

Published in the SDK doc tree under
`doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/`
and linked from the page-context guide.

### `site.context`

`client.query("site.context")` — returns current site details;
documented only for dashboard widgets
([source](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/query-the-site-context.html)).

### Datasource field values ("component content")

Not provided directly by `pages.context`. Options:

- If we own a `Marketplace Types -> Plugin` field on the datasource
  template, the **Custom Field** extension receives `value` /
  `setValue` hooks (see starter `app/custom-field-extension/page.tsx`)
  ([source](https://github.com/Sitecore/marketplace-starter)).
- For any other datasource field values, use the **XMC package**
  to call the Authoring & Management GraphQL API via
  `@sitecore-marketplace-sdk/xmc`
  ([npm](https://www.npmjs.com/package/@sitecore-marketplace-sdk/xmc)).
  This is the documented path for "need item content".

### User email / name

Not in `application.context`. Sitecore's SDK "manages token
lifecycle and permission scopes under the hood" and authenticates
"against Sitecore's identity system"
([source](https://konabos.com/blog/unlocking-the-sitecore-marketplace-a-deep-dive-from-sugcon-europe-2025)),
but the public SDK README does not yet expose a `user.context`
query. To get the reporter's identity today we must either call an
XMC API with the granted token or roll our own auth.

## 5. Plugin Shape & Deployment

- **Runtime**: plugin loads as a **sandboxed iframe** inside the
  Sitecore host; host ↔ plugin traffic is over the browser's
  `postMessage` API
  ([client README](https://www.npmjs.com/package/@sitecore-marketplace-sdk/client),
  [overview](https://developers.sitecore.com/learn/getting-started/marketplace)).
- **Initialization** (from the v0.3.2 client README):

  ```typescript
  import { ClientSDK } from '@sitecore-marketplace-sdk/client';

  const config = { target: window.parent };
  const client = await ClientSDK.init(config);
  ```

- **Framework**: React / Next.js (App Router demonstrated in
  starter). No Angular / Vue support announced
  ([FAQ](https://developers.sitecore.com/learn/getting-started/marketplace)).
- **Hosting**: Sitecore does **not** host your app. Bring your own
  Vercel / Netlify / Azure hosting. HTTPS required. Deployment URL
  is set in Developer Studio at registration time
  ([register walkthrough](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-register-app)).
- **Registration**: no JSON manifest file — registration is done in
  the Cloud Portal "Developer Studio" UI. You set: app name,
  extension points + their route URLs, API access scope, deployment
  URL, icon URL. Activate, then install into your organization
  ([register walkthrough](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-register-app)).
- **Custom apps vs public apps**: only **Custom Apps** are GA today
  (private to one org, no Sitecore review). Public apps are "coming
  soon"
  ([overview](https://developers.sitecore.com/learn/getting-started/marketplace)).
- **Local development**: register `http://localhost:3000` as the
  deployment URL on a non-prod environment and run `npm run dev`
  in the starter ([walkthrough](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-register-app)).
- **Prereqs**: Node.js ≥ 16, npm ≥ 10
  ([client README](https://www.npmjs.com/package/@sitecore-marketplace-sdk/client)).

## 6. Auth to External Services (JIRA)

- Sitecore does not host the plugin, and the SDK only brokers
  auth to **Sitecore APIs** (Authoring, Experience Edge, XM Cloud
  Pages REST, Sites REST)
  ([overview](https://developers.sitecore.com/learn/getting-started/marketplace),
  [register walkthrough](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-register-app)).
- There is **no Sitecore-side secret store** for third-party
  credentials today. To call the JIRA Cloud REST API we must stand
  up our own backend (Next.js route handlers on the hosting
  provider, or a separate API) and keep the JIRA token or OAuth
  client secret there. The iframe calls that backend; the backend
  calls JIRA.
- SDK v0.3 adds **app permissions** enabled at registration
  (open pop-ups / in-app links, read + write clipboard) — useful
  for OAuth redirect pop-ups, but not a secret store
  ([Dec 2025 changelog](https://developers.sitecore.com/changelog/marketplace/10122025/introducing-marketplace-app-permissions-and-new-event-subscriptions-in-the-sdk)).
- The "XM Cloud APIs" scope at registration is an all-or-nothing
  bundle (Experience Edge Admin + Edge Token + XMC Pages REST +
  XMC Sites REST + Authoring GraphQL)
  ([register walkthrough](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-register-app)).

Recommended pattern: host the plugin as Next.js on Vercel; call
`/api/jira/*` route handlers from the iframe; put the JIRA PAT /
OAuth client secret in Vercel env vars; for multi-tenant support,
use JIRA OAuth 2.0 (3LO) with a short-lived code exchange on the
backend.

## 7. Gotchas

- **Iframe sandbox**: Sitecore host loads the plugin in a
  "sandboxed iframe"
  ([overview](https://developers.sitecore.com/learn/getting-started/marketplace));
  the exact `sandbox="…"` attribute list is not published. Expect
  `allow-scripts allow-same-origin` at minimum and plan for the
  possibility that `allow-popups` / clipboard access are what the
  SDK v0.3 "permissions" actually toggle on
  ([Dec 2025 changelog](https://developers.sitecore.com/changelog/marketplace/10122025/introducing-marketplace-app-permissions-and-new-event-subscriptions-in-the-sdk)).
- **CSP / CORS**: deployment URL must serve `X-Frame-Options` /
  `frame-ancestors` headers that allow the XMC host. Sitecore
  docs do not publish the exact host origin; confirm empirically
  during the spike. Next.js defaults block framing, so this needs
  explicit config.
- **Direct-route access blocked**: the marketplace-starter README
  warns, "You cannot access extension point routes directly in the
  browser (e.g., `localhost:3000/...`). These routes must be invoked
  within the Sitecore XM Cloud environment through the configured
  extension points."
  ([source](https://github.com/Sitecore/marketplace-starter))
- **No published bundle-size / memory limit**: none of
  [overview](https://developers.sitecore.com/learn/getting-started/marketplace),
  the register walkthrough, or the SDK README publishes a size
  or memory cap. Treat as unconstrained but keep First Contentful
  Paint tight for the Pages Context Panel (small surface).
- **Version churn**: Sitecore docs URL segment `/sdk/0/` signals a
  pre-1.0 SDK. Breaking changes between v0.2 (Aug–Oct 2025) and
  v0.3 (Dec 2025 – Feb 2026) are already visible in the npm
  history
  ([npm versions](https://www.npmjs.com/package/@sitecore-marketplace-sdk/client)).
- **Permissions need re-consent**: "If permissions change for an
  app that's already installed in an organization, an admin or
  owner needs to update the app in My apps for the changes to take
  effect."
  ([Dec 2025 changelog](https://developers.sitecore.com/changelog/marketplace/10122025/introducing-marketplace-app-permissions-and-new-event-subscriptions-in-the-sdk))
- **No review gate for Custom Apps**: custom apps bypass Sitecore
  review — we are responsible for our own security, accessibility,
  and support
  ([overview FAQ](https://developers.sitecore.com/learn/getting-started/marketplace)).

## Unresolved / Needs Spike

- Exact TypeScript shape of `pages.context` (selected rendering id?
  rendering name? template id? datasource id?). Resolve by reading
  `node_modules/@sitecore-marketplace-sdk/client/dist/sdk-types.d.ts`
  after install.
- Whether the `page layout` / `field layout` subscription events
  include the selected rendering instance UID or only the raw
  layout delta.
- Exact iframe `sandbox` attribute set used by the XMC host.
- Whether a `user.context` or equivalent is planned for SDK 0.4+.
