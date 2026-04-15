# Research: JIRA Cloud REST API for Issue Creation & Attachments

Date: 2026-04-14
Status: Research-only (no code changes)
Ticket: CLD-XXX JIRA Module Reporter

## Context

The Sitecore plugin will create JIRA Cloud issues using a single shared
service account (Atlassian API token). This document captures the exact
REST API surface we will depend on and calls out the blocking constraint
discovered during research.

## TL;DR — CORS Verdict

**A browser-hosted plugin CANNOT call `https://<tenant>.atlassian.net/rest/api/3/*`
directly.** Atlassian does not return `Access-Control-Allow-Origin` on the
tenant domain for Basic-auth requests, and this is deliberate — session
cookies live on that origin, so allowing cross-origin access would expose
any logged-in user. CORS is only supported via OAuth 2.0 (3LO) through
`api.atlassian.com/ex/jira/{cloudid}/...`, which is not compatible with a
shared service-account token. The plugin therefore **requires a
server-side proxy** (e.g., a small middleware endpoint in
`src/middleware/` or a Next.js route handler in `src/apps/mainsite/`) that
holds the token server-side and forwards calls to Jira.

See [section 7](#7-cors) for sources.

---

## 1. Authentication

**Scheme:** HTTP Basic with a base64-encoded pair of the service-account
email and an Atlassian API token.

- Header: `Authorization: Basic <base64(email:apiToken)>`
- Also required on JSON calls: `Accept: application/json`,
  `Content-Type: application/json`.

**Token generation:** The service-account user signs in to
<https://id.atlassian.com/manage-profile/security/api-tokens> and clicks
*Create API token*. The token is shown once; store it in a secret manager
(Azure Key Vault / env var on the proxy).

**Service-account caveats:**

- The account must be a licensed Jira user and be added to the target
  project with *Create Issues* permission.
- The Atlassian account ID of the service user is what appears in the
  `reporter.accountId` field by default if `reporter` is omitted.
- API tokens act on behalf of the owning user — there is no concept of
  impersonation via token. To set `reporter` to a different user, the
  token's owner must have the *Modify Reporter* project permission.

Source: [Basic auth for REST APIs][basic-auth]

## 2. Create Issue Endpoint

- **Method + path:** `POST /rest/api/3/issue`
- **Base URL:** `https://<tenant>.atlassian.net`
- **Content-Type:** `application/json`

### 2.1 Minimum required fields

- `fields.project.key` (or `project.id`)
- `fields.issuetype.id` (or `issuetype.name`)
- `fields.summary` (string)

`description` is optional but almost always set. In v3 it **must** be an
ADF document object — v2 (`/rest/api/2/issue`) takes wiki markup / plain
text instead. Pick v3 if rich formatting is needed.

### 2.2 Example request body (v3, ADF description)

```json
{
  "fields": {
    "project": { "key": "CLD" },
    "issuetype": { "name": "Bug" },
    "summary": "Hero banner renders empty on /en/products",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            { "type": "text", "text": "Reported via Sitecore Launcher plugin." }
          ]
        }
      ]
    },
    "reporter": { "accountId": "5b10a2844c20165700ede21g" },
    "assignee": { "accountId": "5b109f2e9729b51b54dc274d" },
    "labels": ["sitecore-launcher", "auto-reported"],
    "priority": { "name": "Medium" }
  }
}
```

### 2.3 Response (201 Created)

```json
{
  "id": "10042",
  "key": "CLD-123",
  "self": "https://<tenant>.atlassian.net/rest/api/3/issue/10042"
}
```

### 2.4 Reporter vs assignee notes

- Both take `accountId` (Atlassian Cloud deprecated `name`/`key` for GDPR).
- Use `GET /rest/api/3/user/search?query=<email>` to resolve email to
  accountId when the plugin wants to attribute the issue to the actual
  end-user.
- If the service account lacks *Modify Reporter* permission, omit
  `reporter` — Jira will fall back to the authenticated user (the service
  account). The real reporter can instead be captured in the description
  body or a custom field.

Source: [Issues API — Create issue][create-issue]

## 3. Attachments

- **Method + path:**
  `POST /rest/api/3/issue/{issueIdOrKey}/attachments`
- **Content-Type:** `multipart/form-data`
- **Required header:** `X-Atlassian-Token: no-check` (bypasses CSRF block;
  request is rejected without it)
- **Form field name:** must be `file` (repeat to upload multiple files in
  one request)
- **Auth:** same Basic token as above

### 3.1 Can it be combined with create?

**No.** Attachments are a follow-up call. The flow is:

1. `POST /rest/api/3/issue` → receive `{ id, key }`.
2. `POST /rest/api/3/issue/{key}/attachments` with the file(s).
3. Optionally reference the attachment in a later `PUT /issue/{key}`
   description by its filename using an ADF `mediaSingle` node.

### 3.2 Size limit

- Default upload limit is per-instance and queryable at
  `GET /rest/api/3/attachment/meta` → `{ "enabled": true, "uploadLimit": N }`.
- Atlassian's published cap for Cloud is **100 MB per file** (Standard and
  above). Admin can lower it; the plugin should read `attachment/meta` at
  startup or surface a generic "file too large" error on 413.

### 3.3 Example (curl)

```bash
curl -X POST \
  -u 'svc-sitecore@codehouse.com:<api_token>' \
  -H 'X-Atlassian-Token: no-check' \
  -F 'file=@screenshot.png' \
  'https://<tenant>.atlassian.net/rest/api/3/issue/CLD-123/attachments'
```

### 3.4 Example response

```json
[
  {
    "id": "10001",
    "filename": "screenshot.png",
    "mimeType": "image/png",
    "size": 23123,
    "content": "https://<tenant>.atlassian.net/rest/api/3/attachment/content/10001"
  }
]
```

Source: [Issue attachments API][attachments-api]

## 4. Description Formatting — Atlassian Document Format (ADF)

ADF is a JSON tree. Root is `{ "type": "doc", "version": 1, "content": [...] }`.
Common node types:

- `paragraph`, `heading` (level 1–6)
- `bulletList` / `orderedList` with `listItem` children
- `text` with optional `marks`: `strong`, `em`, `code`, `link`
- `codeBlock` (with `attrs.language`)
- `table`, `tableRow`, `tableHeader`, `tableCell`
- `mediaSingle` + `media` (for embedded attachments after upload)

### 4.1 Minimal ADF example covering bold, list, code block, table

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Summary: ", "marks": [{ "type": "strong" }] },
        { "type": "text", "text": "hero banner empty on /en/products." }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "Browser: Chrome 134" }] }
          ]
        },
        {
          "type": "listItem",
          "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "Locale: en-GB" }] }
          ]
        }
      ]
    },
    {
      "type": "codeBlock",
      "attrs": { "language": "json" },
      "content": [
        { "type": "text", "text": "{\n  \"layout\": null\n}" }
      ]
    }
  ]
}
```

A lightweight helper (or the `@atlaskit/adf-utils` package) is recommended
on the proxy side — hand-building ADF for every ticket is tedious and
error-prone. For v3 compatibility, note that **single-line custom text
fields still take plain strings**; only `description`, `environment`, and
multi-line custom fields take ADF.

Source: [ADF reference in REST v3 intro][adf-intro], [atlaskit/adf-utils on npm][adf-utils]

## 5. Rate Limits

Jira Cloud enforces **three independent** limits simultaneously:

| Limit | Scope | Example | 429 reason header |
| --- | --- | --- | --- |
| Points quota | Hourly, per-tenant | 65,000 pts global default; Standard tenant pool ~100k + 10/user | `jira-quota-tenant-based` |
| Burst RPS | Per-second, per-endpoint | ~100 RPS GET/POST, 50 RPS PUT/DELETE | `jira-burst-based` |
| Per-issue writes | Per-issue | 20 writes / 2 s, 100 writes / 30 s | `jira-per-issue-on-write` |

### 5.1 429 response

- Status `429 Too Many Requests`
- `Retry-After: <seconds>` — always present
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` (ISO-8601)
- `RateLimit-Reason` identifies which bucket triggered

### 5.2 Handling guidance

- Read `Retry-After` and sleep; fall back to exponential backoff with
  jitter (base ~2 s, doubling, ×0.7–1.3 random).
- Cap retries at ~4.
- Because we use a **single shared token**, all plugin users share one
  quota bucket. Surging launches (e.g., 200 testers filing bugs in a
  sprint review) could hit quota; the proxy should queue + throttle.

Source: [Rate limiting guide][rate-limits]

## 6. Error Responses

All errors return the shared `ErrorCollection` shape:

```json
{
  "errorMessages": ["Issue does not exist or you do not have permission to see it."],
  "errors": {
    "summary": "You must specify a summary of the issue.",
    "project": "project is required"
  }
}
```

Common codes on `POST /rest/api/3/issue`:

| Code | Meaning | Likely cause | User-facing message |
| --- | --- | --- | --- |
| 400 | Bad Request / validation | Missing summary, bad issuetype, ADF malformed | Show field-level errors from `errors` map |
| 401 | Unauthorized | API token wrong, expired, or email mismatch | "JIRA integration not configured — contact admin" |
| 403 | Forbidden | Service account lacks *Create Issues* on project | "You don't have permission to log issues in PROJECT-X" |
| 404 | Not found | Project key wrong | "Project not found" |
| 413 | Payload too large | Attachment exceeds `uploadLimit` | "Attachment too large (max X MB)" |
| 422 | Unprocessable | Field value rejected by a screen/workflow rule | Show raw error |
| 429 | Rate limited | See section 5 | Auto-retry silently; surface only if retries exhausted |

The plugin should log the entire `ErrorCollection` server-side but only
show `errorMessages[0]` + a mapped user-friendly message in the UI.

Source: [Status codes overview][status-codes]

## 7. CORS

**Official Atlassian position:**
`<tenant>.atlassian.net/rest/api/3/*` **does not set
`Access-Control-Allow-Origin`** for Basic-auth requests. Preflight
`OPTIONS` returns a failure, so `fetch()` from a browser is blocked.
The stated reason on the long-standing ticket
[JRACLOUD-30371][jra-30371] is that the tenant domain holds the logged-in
user's session cookies — if CORS were opened, any other site could issue
authenticated requests on the user's behalf.

The only CORS-enabled Jira endpoint is
`api.atlassian.com/ex/jira/{cloudid}/...` and it accepts **only OAuth 2.0
(3LO) bearer tokens**, not Basic / API-token auth. Since the plugin uses a
shared service-account API token, OAuth 3LO is not a viable swap.

### 7.1 Implication for architecture

We must introduce a thin server-side component:

- **Option A (recommended):** New endpoint in `src/middleware/` (the
  `LauncherDx.Middleware` project, Helix `Feature.JiraReporter`), invoked
  by the Sitecore plugin. Handles auth header construction, ADF
  assembly, attachment forwarding, and rate-limit retry.
- **Option B:** Next.js route handler in
  `src/apps/mainsite/src/app/api/jira/...` (only appropriate if the
  Launcher plugin is embedded in the rendering host). Token lives in
  `.env` / App Service config, never reaches the browser.
- **Option C (rejected):** Public CORS proxy — violates security review
  (token exposed in browser, any origin can use it).

The chosen option must:

- Strip/validate origin (only allow the Sitecore CM host or preview host).
- Never echo the Basic auth header into responses.
- Forward `429` back to the client unchanged so the client can show a
  "please wait" toast.

Sources: see [section 7 Sources](#sources) below.

## Sources

- [Basic auth for REST APIs — developer.atlassian.com][basic-auth]
- [Jira Cloud REST v3 — Create issue][create-issue]
- [Jira Cloud REST v3 — Issue attachments][attachments-api]
- [Jira Cloud REST v3 — Intro & ADF note][adf-intro]
- [atlaskit/adf-utils — npm][adf-utils]
- [Jira Cloud rate limiting][rate-limits]
- [Jira Cloud REST v3 — Status codes][status-codes]
- [JRACLOUD-30371 — Allow cross-domain requests for CORS][jra-30371]
- [Atlassian community — CORS error with Jira REST API on Cloud][cors-community]
- [Atlassian developer community — CORS error with REST API][cors-dev-community]

[basic-auth]: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
[create-issue]: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post
[attachments-api]: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/
[adf-intro]: https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
[adf-utils]: https://www.npmjs.com/package/@atlaskit/adf-utils
[rate-limits]: https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
[status-codes]: https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#status-codes
[jra-30371]: https://jira.atlassian.com/browse/JRACLOUD-30371
[cors-community]: https://community.atlassian.com/forums/Jira-questions/CORS-error-with-Jira-REST-API-on-Cloud/qaq-p/1018216
[cors-dev-community]: https://community.developer.atlassian.com/t/cors-error-with-rest-api/27354
