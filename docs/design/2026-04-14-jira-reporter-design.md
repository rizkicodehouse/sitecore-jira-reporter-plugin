# JIRA Reporter — Sitecore Marketplace Plugin · Design Spec

- **Ticket:** CLD-XXX-JIRA-Module-Reporter
- **Status:** Draft — pending user approval
- **Date:** 2026-04-14
- **Owner:** LauncherDX team
- **Target:** Sitecore XM Cloud Page Builder ("SitecoreAI" /
  "Pages") · distributable via Sitecore Marketplace

## 1. Summary

Ship a Sitecore Marketplace plugin that lets a Page Builder user
report a bug to JIRA Cloud in two clicks, with the current component
context (page, rendering, datasource fields, user, browser, optional
screenshot) auto-attached to the issue.

The plugin is a standalone Next.js 15 app at
`src/apps/jira-reporter-plugin/`, deployed to Vercel, and registered
with the Sitecore Cloud Portal as a **Pages Context Panel** extension.

## 2. Goals and non-goals

### 2.1 Goals (v1)

- One-click-to-dialog flow from inside Page Builder, with selected
  component context auto-populated.
- JIRA issue creation via a single shared service-account token, so
  onboarding requires no per-user auth.
- Cross-origin-safe screenshot via the Screen Capture API **and**
  manual upload — both paths supported.
- Admin-editable settings surface (project key, issue type, labels,
  default assignee) inside the plugin UI.
- Structured ADF description so the issue renders readably in JIRA.
- Installable and distributable via Sitecore Marketplace.

### 2.2 Non-goals (v1)

- Per-user OAuth (3LO) to JIRA — deferred to v1.1+.
- Multi-JIRA-project picker inside the dialog — one configured
  project per install.
- Severity, steps-to-reproduce, expected-vs-actual structured fields.
- JIRA comment threading, status tracking, or webhooks back from
  JIRA into Sitecore.
- In-canvas component-toolbar placement — see §4.1 for the reason.
- Sentry or third-party observability — v1 uses Vercel Logs only.

## 3. Research summary

Full research notes live in
`JIRA/CLD-XXX-JIRA-Module-Reporter/research/`:

- [`01-marketplace-sdk-extension-points.md`](../research/01-marketplace-sdk-extension-points.md)
- [`02-existing-jira-integrations.md`](../research/02-existing-jira-integrations.md)
- [`03-jira-cloud-rest-api.md`](../research/03-jira-cloud-rest-api.md)

### 3.1 Decisions forced by research

- **The in-canvas component toolbar is not an SDK extension point.**
  Sitecore exposes five slots: Standalone, Full Screen, Pages Context
  Panel, Custom Field, Dashboard Widget. The closest match is the
  **Pages Context Panel** (left-side panel). As of SDK v0.3 it can
  subscribe to `pages.context` and layout-change events, so it stays
  aware of the selected rendering.
- **Browser-direct calls to JIRA are blocked by CORS.** A server-side
  proxy is mandatory. We host it as Next.js Route Handlers in the
  same plugin app (`/api/jira/*`), so the iframe calls same-origin
  endpoints and the service-account token stays server-side.
- **No existing Sitecore–JIRA plugin exists.** First-mover.
  `Sitecore/marketplace-starter` is the scaffold baseline;
  `@xataio/screenshot` handles cross-origin-safe capture using the
  Screen Capture API.

## 4. Approaches considered

### 4.1 Placement

| # | Placement | Chosen? |
|---|---|---|
| P1 | Pages Context Panel + selected-component awareness | **Yes (v1)** |
| P2 | Full Screen extension launched from XMC nav | No — loses in-canvas context |
| P3 | Wait for Sitecore to expose a component-toolbar slot | No — roadmap-blocked |

v1 ships on **P1**. The architecture (§5) keeps the feature portable
so that if Sitecore later exposes the toolbar slot, adding it is a
30-line mount file with no changes to the dialog, services, or API.

### 4.2 Authentication

| # | Model | Chosen? |
|---|---|---|
| A | Shared service account (API token, server-only) | **Yes (v1)** |
| B | Per-user API token pasted in settings | No — onboarding friction |
| C | OAuth 2.0 3LO per user | No — defer to v1.1+ |

### 4.3 Proxy host

| # | Host | Chosen? |
|---|---|---|
| H1 | Next.js Route Handlers inside the plugin app | **Yes (v1)** |
| H2 | New `.NET` middleware feature in `src/middleware/` | No — cross-stack, heavier |
| H3 | Separate API service on Vercel | No — duplicate deploy target |

## 5. Architecture

### 5.1 High-level shape

One Next.js 15 App Router app at `src/apps/jira-reporter-plugin/`,
deployed standalone on Vercel. Three surfaces in one codebase:

1. **Plugin UI (client)** — runs in the Sitecore Cloud Portal iframe,
   registered as a Pages Context Panel extension.
2. **Plugin API (server)** — Next.js Route Handlers at `/api/jira/*`,
   `/api/xmc/*`, and `/api/settings`. Holds the JIRA service-account
   token and proxies all upstream calls.
3. **Plugin registration landing** — a public `/` route used by the
   Sitecore Developer Studio during plugin registration.

### 5.2 Layered dependency graph

```text
┌─ extension-entry (pages-panel, full-screen, <toolbar-later>) ──┐
│     thin mount + SDK subscription wiring only                  │
├─ feature: ReportBugDialog, SettingsView ──────────────────────┤
│     UI, form, component-context auto-populate, screenshot      │
├─ services ────────────────────────────────────────────────────┤
│  sitecore/context     (pages.context, client-side)             │
│  sitecore/xmc         (XMC Authoring GraphQL, server-side)     │
│  screenshot/capture   (@xataio/screenshot — Screen Capture)    │
│  screenshot/upload    (manual file upload, validated)          │
│  jira/client          (calls same-origin /api/jira/*)          │
├─ api routes (server) ─────────────────────────────────────────┤
│  POST /api/jira/issue        → creates issue (ADF body)        │
│  POST /api/jira/attachment   → uploads screenshot              │
│  GET  /api/xmc/me            → resolves Sitecore user          │
│  GET  /api/xmc/datasource    → resolves component content      │
│  GET/PUT /api/settings       → admin-only settings CRUD        │
│  GET  /api/health            → smoke-check endpoint            │
└────────────────────────────────────────────────────────────────┘
```

The extension-entry layer is the only code that knows which slot it
is running in. Adding a new slot later means adding one new entry
file — the dialog, services, and API stay untouched.

### 5.3 Auth and secrets

Vercel environment variables, never shipped to the browser:

- `JIRA_BASE_URL` — e.g. `https://codehouse.atlassian.net`
- `JIRA_SERVICE_EMAIL` — service account email
- `JIRA_API_TOKEN` — Atlassian API token
- `XMC_TENANT_URL` — XMC Authoring GraphQL endpoint
- `ALLOWED_PLUGIN_ORIGIN` — Sitecore Cloud Portal origin for CORS
- `PLUGIN_ADMIN_EMAILS` — comma-separated allowlist for settings
- `MAX_ATTACHMENT_MB` — per-file size cap (default `25`)

Every `/api/*` route runs `lib/auth.verifySdkSession(req)` before
doing work; unauthenticated requests get `401`.

### 5.4 Rate-limit posture

Because one service-account token is shared across all plugin users,
`lib/rate-limit.ts` wraps JIRA calls in a `p-queue` with concurrency
1 and a 3-req/s cap. On `429` the server surfaces `Retry-After` to
the client and does **not** auto-retry.

## 6. Components

### 6.1 Extension-entry layer

- **`app/pages-panel/page.tsx`** — Pages Context Panel
  entry. Mounts `<ReportBugButton />`, `<SettingsGear />`, and
  conditionally `<ReportBugDialog />` / `<SettingsView />`.
  Subscribes to `pages.context` and layout-change events; disables
  the report button when no rendering is selected.
- **`app/full-screen/page.tsx`** — scaffolded-empty
  portability harness for v1.1.

### 6.2 Feature layer

- **`features/report-bug/ReportBugButton.tsx`** — stateless icon +
  label that opens the dialog.
- **`features/report-bug/ReportBugDialog.tsx`** — single-screen form:
  Summary (required), Description (optional), Auto-captured context
  preview (collapsed by default), attachments list, Submit.
- **`features/report-bug/useAutoContext.ts`** — React hook returning
  the full `ReportContext` shape:

  ```ts
  type ReportContext = {
    page:      { id: string; path: string; language: string;
                 siteName: string };
    rendering: { instanceId: string; renderingId: string;
                 name: string; templateName: string } | null;
    datasource:{ itemId: string; templateName: string;
                 fields: Record<string, string> } | null;
    reporter:  { name: string; email: string } | null;
    browser:   { userAgent: string;
                 viewport: { w: number; h: number } };
    timestamp: string;
  };
  ```

- **`features/settings/SettingsView.tsx`** — admin-only form for
  `projectKey`, `defaultIssueType`, `defaultLabels[]`,
  `defaultAssigneeAccountId?`.
- **`features/settings/SettingsGear.tsx`** — icon that opens the
  settings view.

### 6.3 Services layer

- **`services/sitecore/context.ts`** — wraps the Marketplace SDK.
  Exposes `getPagesContext()`, `subscribeToLayoutChanges()`,
  `getSelectedRendering()`.
- **`services/sitecore/xmc.ts`** — server-side XMC Authoring GraphQL
  client. Exposes `getDatasourceFields(itemId, language)` and
  `getCurrentUser()`.
- **`services/screenshot/capture.ts`** — `captureVisibleTab():
  Promise<Blob>` using `@xataio/screenshot`. Handles user cancel.
- **`services/screenshot/upload.ts`** — `readFileToBlob(file)`
  validates MIME (`image/png|jpeg|webp`) and size.
- **`services/jira/client.ts`** — browser-side client calling only
  same-origin `/api/jira/*`. Methods: `createIssue(payload)`,
  `uploadAttachment(issueKey, blob)`.

### 6.4 Server routes

- **`app/api/jira/issue/route.ts`** — `POST`. Builds ADF description,
  calls `POST /rest/api/3/issue`, returns `{ key, url }`.
- **`app/api/jira/attachment/route.ts`** — `POST`. Streams multipart
  to `POST /rest/api/3/issue/{key}/attachments` with
  `X-Atlassian-Token: no-check`.
- **`app/api/xmc/me/route.ts`** — `GET`. Resolves current Sitecore
  user via SDK-brokered auth.
- **`app/api/xmc/datasource/route.ts`** — `GET`. Resolves datasource
  field values via XMC Authoring GraphQL.
- **`app/api/settings/route.ts`** — `GET` / `PUT`. Reads/writes to
  the settings store; `PUT` requires admin allowlist membership.
- **`app/api/health/route.ts`** — `GET`. Smoke-check endpoint.

### 6.5 Shared libs

- **`lib/adf.ts`** — ADF builder helpers over `@atlaskit/adf-utils`.
- **`lib/jira-errors.ts`** — maps upstream JIRA statuses to four
  `PluginError` categories (`retryable`, `permission`, `config`,
  `unknown`).
- **`lib/rate-limit.ts`** — `p-queue`-based token bucket.
- **`lib/settings-store.ts`** — abstraction over Vercel KV with a
  30s in-memory cache.
- **`lib/auth.ts`** — `verifySdkSession(req)` + admin allowlist
  check.

### 6.6 Package additions

On top of the mainsite stack:

- `@sitecore-marketplace-sdk/client`
- `@sitecore-marketplace-sdk/xmc`
- `@xataio/screenshot`
- `@atlaskit/adf-utils`
- `p-queue`
- `@vercel/kv`

## 7. Data flow

### 7.1 Open dialog and auto-populate context

1. User selects a rendering in Page Builder. SDK fires a
   `pages.context` or layout-change event.
2. `pages-panel/page.tsx` enables `ReportBugButton`.
3. User clicks **Report Bug**.
4. `useAutoContext()` runs four calls in parallel:
   - Reads `pages.context` from SDK cache → `page` + `rendering`.
   - `GET /api/xmc/me` → `reporter` (5s server cache).
   - `GET /api/xmc/datasource?itemId=<uid>&language=<lang>` →
     `datasource.fields`.
   - Reads `navigator.userAgent` + viewport → `browser`.
5. Dialog renders; context preview is pre-filled and collapsed.

### 7.2 Attach screenshot

**Screen Capture path.** User clicks **Capture screen** → browser
prompts for tab/screen share → `capture.ts` grabs one frame → PNG
Blob appended to `attachments[]`. If the user declines, a soft toast
is shown and the form continues.

**Upload path.** User clicks **Upload image** → file picker →
`upload.ts` validates MIME and size → Blob appended.

Attachments are held in memory (cap: 5 per report) until Submit.

### 7.3 Submit

1. Client validates Summary non-empty.
2. `POST /api/jira/issue` with `{ summary, descriptionText, context,
   attachmentCount }`.
3. Server verifies session, reads settings, builds ADF description,
   enters the rate-limit queue, calls
   `POST {JIRA_BASE_URL}/rest/api/3/issue` with Basic auth, returns
   `{ key, url }`.
4. For each attachment, client calls
   `POST /api/jira/attachment?issueKey=<key>`. Server forwards
   multipart upstream with `X-Atlassian-Token: no-check`.
5. Attachment failures are **non-fatal** — the issue stands, the UI
   shows per-attachment retry.
6. Success state: "Bug reported as **JIRA-123**" with a clickable
   link. Dialog dismisses after 2s or on user action.

### 7.4 ADF description assembly

Structured via `lib/adf.ts` and `@atlaskit/adf-utils`:

```text
## Description
<user-typed description or "No description provided.">

## Reporter
Name — email

## Page
Title · URL · Language · Site

## Rendering
Name (Template) · instanceId

## Datasource fields
- fieldName: value           (truncated at 500 chars each)
- ...

## Browser
userAgent · viewport · timestamp
```

### 7.5 Settings flow

1. Admin opens gear → `SettingsView`.
2. `GET /api/settings` hydrates form.
3. Admin edits, saves → `PUT /api/settings`.
4. Server checks admin allowlist, validates, writes KV, invalidates
   30s cache.
5. UI shows "Saved" toast.

## 8. Error handling

### 8.1 Principles

1. Never lose the user's typed content before success or explicit
   dismiss.
2. Degrade context, don't block submission. Missing fields become
   `"(unavailable)"` in the description.
3. Every server error collapses to one of four user-facing
   categories: `retryable`, `permission`, `config`, `unknown`. Raw
   JIRA payloads never reach the user.

### 8.2 Browser failures

| Failure | User sees | Recovery |
|---|---|---|
| SDK not ready or context lost | Button disabled + tooltip "Select a component to report" | Re-enables on next context event |
| Screen capture declined | Toast "Screen share declined" | User can Upload or Submit without screenshot |
| Upload rejected (MIME or size) | Inline error on the tile | Other attachments kept |
| XMC `/me` lookup fails | Banner "Couldn't identify you — enter email below" | Email field appears and is required |
| XMC datasource fetch fails | Context row "Datasource unavailable" | Submission proceeds; gap noted in description |
| `/api/jira/issue` error | Top-of-dialog banner + **Retry** | User-initiated, no auto-retry |
| Attachment fails post-create | "Bug reported as JIRA-123 · N of M attachments failed" | Per-attachment Retry |

### 8.3 Server error mapping

Collapsed in `lib/jira-errors.ts`:

- `401 invalid token` → `config` · "Plugin not configured correctly
  — contact your Sitecore admin."
- `403 no permission` → `config` · same surface, different log code.
- `404 unknown project` → `config` · "Configured JIRA project not
  found — check plugin settings."
- `400 validation` → `unknown` · "JIRA rejected the request" with a
  `requestId` reference.
- `413 attachment too big` → `retryable` (attachment only).
- `429 rate-limited` → `retryable` · surfaces `Retry-After`.
- `5xx / network` → `retryable` · "JIRA is temporarily unavailable."

Every server error logs one JSON line per request:
`{requestId, userEmail, route, upstreamStatus, jiraErrorCollection,
durationMs}`. No secrets ever logged. `requestId` is echoed to the
client and shown as a small "Ref: …" string in the error banner.

### 8.4 Security failures

- Missing/invalid SDK session token → `401` (never reveals whether
  the route exists).
- Non-admin attempts settings write → `403 "Admin access required"`.
  The env-var name is logged, not its value.
- CORS preflight from any origin other than `ALLOWED_PLUGIN_ORIGIN`
  is denied at the edge.

## 9. Testing

### 9.1 Stack

- **Vitest** — unit + integration.
- **React Testing Library** — components.
- **MSW (Mock Service Worker)** — intercepts JIRA + XMC calls at the
  network layer; reusable across unit, component, and local-dev.
- **Playwright** — E2E against a local `next dev` with MSW running.
- **No live Sitecore-host integration tests.** Covered by a manual
  smoke checklist.

### 9.2 Coverage targets

| Layer | Target |
|---|---|
| `lib/*` (adf, jira-errors, rate-limit, settings-store, auth) | 95% |
| `services/*` | 90% |
| `app/api/*` route handlers | 85% |
| `features/*` components | 80% |
| **Project-wide CI gate** | **80%** lines / branches / functions |

### 9.3 Playwright E2E scenarios

Run against `next dev` with an MSW worker. A tiny `dev-host.html`
page renders `/pages-panel` and injects a faked
`pages.context` via `postMessage` to stand in for the Sitecore host.

1. **Happy path** — select component → dialog opens → context
   auto-populates → Summary typed → Capture screen (Playwright
   `display-capture` permission) → Submit → assert "Bug reported as
   MOCK-1" + link.
2. **Screenshot declined + upload fallback** — Capture declined →
   toast → Upload fixture PNG → Submit → assert success.
3. **JIRA rate-limit** — MSW returns `429 Retry-After: 3` → banner +
   Retry → second Submit succeeds.

### 9.4 Unit-test focal points

- `lib/adf.ts` — every helper produces schema-valid ADF (validated
  against `@atlaskit/adf-schema`).
- `lib/jira-errors.ts` — every documented status maps to the correct
  category and user message.
- `lib/rate-limit.ts` — concurrency cap, 429 respect, queue drain.
- `lib/auth.ts` — valid / expired / malformed / missing token.
- `services/screenshot/upload.ts` — MIME and size validation for
  every rejected type.

### 9.5 TDD discipline

Per `.claude/rules/common/testing.md`: tests first. The
writing-plans output will order each task
*Test → Implement → Refactor → Verify coverage*. Definition of done
for any task includes passing tests and coverage not regressing
below the 80% gate.

### 9.6 Manual smoke checklist

Runs once per release in a dev Sitecore tenant (~10 min):

1. Plugin installs via Developer Studio; appears in the Pages
   Context Panel.
2. Report button disabled until a rendering is selected; enables on
   selection.
3. Submit creates an issue in the target JIRA project with every
   ADF section populated.
4. Settings gear is visible; non-admin email sees `403` on save;
   admin email saves successfully.
5. `GET /api/health` returns `{ ok: true }` from the deployed
   Vercel URL.

## 10. Open risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SDK `pages.context` does not expose selected-rendering `instanceId` | Medium | High — blocks datasource fetch | 1-day spike during Phase 1 of implementation; fall back to rendering name + page URL if unavailable |
| XMC Authoring GraphQL schema for datasource fields differs across tenants | Medium | Medium | Wrap behind `services/sitecore/xmc.ts` with per-field null-safety; ship with feature flag to disable datasource capture |
| Screen Capture API unavailable on the user's browser | Low | Low | Manual upload fallback already in v1 |
| JIRA rate-limit exceeded under burst load (shared service token) | Low for current team size | Medium | `p-queue` + `Retry-After` surfacing; v1.1 can move to per-user OAuth if it matters |
| Marketplace SDK pre-1.0 breaking changes | High (pre-1.0) | Medium | Pin SDK version in `package.json`; track changelog as part of release checklist |

## 11. Future work (explicit deferrals)

- **v1.1:** OAuth 2.0 3LO per user, Sentry telemetry, severity +
  steps-to-reproduce structured fields, Full Screen extension
  enabled as an alternative entry.
- **v1.2:** Component-toolbar placement if Sitecore exposes that
  extension point; multi-project picker; JIRA comment threading.
- **v2:** Open-source the plugin and publish to the Sitecore
  Marketplace as a Public App once the SDK ships Public App support.

## 12. References

- Research: `../research/01-marketplace-sdk-extension-points.md`
- Research: `../research/02-existing-jira-integrations.md`
- Research: `../research/03-jira-cloud-rest-api.md`
- Sitecore Marketplace overview:
  <https://developers.sitecore.com/learn/getting-started/marketplace>
- Marketplace starter repo:
  <https://github.com/Sitecore/marketplace-starter>
- Reference plugin (shell visible):
  <https://smart-pages-phi.vercel.app>
- JIRA Cloud REST API v3:
  <https://developer.atlassian.com/cloud/jira/platform/rest/v3/>
- ADF builder helpers: `@atlaskit/adf-utils`
- Screen Capture library: `@xataio/screenshot`
