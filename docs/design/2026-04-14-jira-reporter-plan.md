# JIRA Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Sitecore Marketplace plugin that lets a Page
Builder user report a bug to JIRA in two clicks, with full
component context auto-attached.

**Architecture:** Standalone Next.js 15 app at
`src/apps/jira-reporter-plugin/`, deployed to Vercel, registered
as a Sitecore Marketplace Pages Context Panel extension. Browser
UI calls same-origin Next.js Route Handlers which proxy to JIRA
Cloud (CORS blocks browser-direct), hold the service-account
token server-side, and broker XMC Authoring GraphQL calls.

**Tech stack:** Next.js 15, React 19, TypeScript, Tailwind v4,
Vitest, React Testing Library, MSW, Playwright, p-queue,
@vercel/kv, @sitecore-marketplace-sdk/client,
@sitecore-marketplace-sdk/xmc, @xataio/screenshot,
@atlaskit/adf-utils.

**Reference docs (read before starting):**

- Design: `./2026-04-14-jira-reporter-design.md`
- Research: `../research/01-marketplace-sdk-extension-points.md`
- Research: `../research/02-existing-jira-integrations.md`
- Research: `../research/03-jira-cloud-rest-api.md`

**Base paths used throughout this plan:**

- App root: `src/apps/jira-reporter-plugin/`
- Source root: `src/apps/jira-reporter-plugin/src/`
- Tests are co-located with source as `*.test.ts` / `*.test.tsx`
  (Vitest). Playwright E2E lives in `tests/e2e/`.

**Commit convention (Conventional Commits):**
`<type>(<scope>): <subject>` — `feat`, `fix`, `test`, `chore`,
`refactor`, `docs`, `ci`. Commit after each task passes its test.

---

## Phase 0 — Scaffold

### Task 1: Bootstrap the plugin app

**Files:**

- Create: `src/apps/jira-reporter-plugin/package.json`
- Create: `src/apps/jira-reporter-plugin/tsconfig.json`
- Create: `src/apps/jira-reporter-plugin/next.config.mjs`
- Create: `src/apps/jira-reporter-plugin/tailwind.config.ts`
- Create: `src/apps/jira-reporter-plugin/postcss.config.mjs`
- Create: `src/apps/jira-reporter-plugin/vitest.config.ts`
- Create: `src/apps/jira-reporter-plugin/playwright.config.ts`
- Create: `src/apps/jira-reporter-plugin/.env.example`
- Create: `src/apps/jira-reporter-plugin/.gitignore`
- Create: `src/apps/jira-reporter-plugin/src/app/layout.tsx`
- Create: `src/apps/jira-reporter-plugin/src/app/page.tsx`
- Create: `src/apps/jira-reporter-plugin/src/app/globals.css`
- Create: `src/apps/jira-reporter-plugin/README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@launcherdx/jira-reporter-plugin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3002",
    "build": "next build",
    "start": "next start --port 3002",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@atlaskit/adf-utils": "^19.0.0",
    "@sitecore-marketplace-sdk/client": "0.3.1",
    "@sitecore-marketplace-sdk/xmc": "0.3.2",
    "@upstash/redis": "^1.34.0",
    "@xataio/screenshot": "^0.1.0",
    "next": "^15.0.0",
    "p-queue": "^8.0.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@vitest/coverage-v8": "^2.1.0",
    "jsdom": "^25.0.0",
    "msw": "^2.4.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=22.14.0" }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
const allowed = process.env.ALLOWED_PLUGIN_ORIGIN ?? "*";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/api/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: allowed },
        { key: "Access-Control-Allow-Methods",
          value: "GET,POST,PUT,OPTIONS" },
        { key: "Access-Control-Allow-Headers",
          value: "Content-Type, Authorization, X-Sdk-Token" }
      ]
    }];
  }
};
export default nextConfig;
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 80, functions: 80, branches: 80, statements: 80
      },
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx",
        "src/test/**"
      ]
    }
  }
});
```

- [ ] **Step 5: Create `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => { cleanup(); });
```

- [ ] **Step 6: Create `.env.example`**

```bash
JIRA_BASE_URL=https://example.atlassian.net
JIRA_SERVICE_EMAIL=svc-bot@example.com
JIRA_API_TOKEN=
XMC_TENANT_URL=https://xmc-<tenant>.sitecorecloud.io
ALLOWED_PLUGIN_ORIGIN=https://portal.sitecorecloud.io
PLUGIN_ADMIN_EMAILS=alice@codehouse.com,bob@codehouse.com
MAX_ATTACHMENT_MB=25
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 7: Create minimal `src/app/layout.tsx`,
`src/app/page.tsx`, `src/app/globals.css`** (enough to boot)

```tsx
// src/app/layout.tsx
import "./globals.css";
export const metadata = { title: "JIRA Reporter Plugin" };
export default function RootLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
```

```tsx
// src/app/page.tsx
export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">
        JIRA Reporter Plugin
      </h1>
      <p>Registration landing. Extension routes live at
         /extensions/*.</p>
    </main>
  );
}
```

```css
/* src/app/globals.css */
@import "tailwindcss";
```

- [ ] **Step 8: Install and run typecheck**

Run from `src/apps/jira-reporter-plugin/`:

```bash
npm install
npm run typecheck
npm run build
```

Expected: `tsc` exits 0, `next build` succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/apps/jira-reporter-plugin/
git commit -m "feat(jira-reporter): scaffold Next.js plugin app"
```

---

## Phase 1 — Shared libraries (TDD, pure functions)

### Task 2: `lib/adf.ts` — Atlassian Document Format builders

**Files:**

- Create: `src/apps/jira-reporter-plugin/src/lib/adf.ts`
- Test: `src/apps/jira-reporter-plugin/src/lib/adf.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/adf.test.ts
import { describe, it, expect } from "vitest";
import { doc, h2, para, bullet, codeBlock, buildDescription }
  from "./adf";

describe("adf builders", () => {
  it("doc wraps content with version + type", () => {
    expect(doc([para("hi")])).toEqual({
      type: "doc", version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "hi" }]
      }]
    });
  });

  it("h2 emits heading level 2", () => {
    expect(h2("Title")).toEqual({
      type: "heading", attrs: { level: 2 },
      content: [{ type: "text", text: "Title" }]
    });
  });

  it("bullet list emits bulletList with listItems", () => {
    expect(bullet(["a", "b"])).toEqual({
      type: "bulletList",
      content: [
        { type: "listItem", content: [
          { type: "paragraph",
            content: [{ type: "text", text: "a" }] }
        ]},
        { type: "listItem", content: [
          { type: "paragraph",
            content: [{ type: "text", text: "b" }] }
        ]}
      ]
    });
  });

  it("codeBlock preserves language + text", () => {
    expect(codeBlock("json", '{"a":1}')).toEqual({
      type: "codeBlock", attrs: { language: "json" },
      content: [{ type: "text", text: '{"a":1}' }]
    });
  });

  it("buildDescription assembles all sections", () => {
    const adf = buildDescription({
      description: "broken",
      reporter: { name: "Ada", email: "a@x.com" },
      page: { title: "Home", url: "/en",
              language: "en", site: "main" },
      rendering: { name: "Hero", template: "Banner",
                   instanceId: "abc" },
      datasource: { fields: { Title: "Welcome" } },
      browser: { userAgent: "UA", viewport: "1024x768",
                 timestamp: "2026-04-14T00:00:00Z" }
    });
    expect(adf.type).toBe("doc");
    expect(adf.version).toBe(1);
    const headings = (adf.content ?? [])
      .filter((n) => n.type === "heading")
      .map((n: any) => n.content?.[0]?.text);
    expect(headings).toEqual([
      "Description", "Reporter", "Page", "Rendering",
      "Datasource fields", "Browser"
    ]);
  });

  it("buildDescription truncates long field values", () => {
    const long = "x".repeat(1000);
    const adf = buildDescription({
      description: "",
      reporter: null, page: null, rendering: null,
      datasource: { fields: { Big: long } },
      browser: { userAgent: "", viewport: "",
                 timestamp: "" }
    });
    const serialised = JSON.stringify(adf);
    expect(serialised).toContain("x".repeat(500));
    expect(serialised).not.toContain("x".repeat(501));
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npx vitest run src/lib/adf.test.ts
```

Expected: fails with "Cannot find module './adf'".

- [ ] **Step 3: Implement `src/lib/adf.ts`**

```ts
export type AdfNode = {
  type: string;
  version?: number;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
};

export const text = (t: string): AdfNode =>
  ({ type: "text", text: t });

export const para = (t: string): AdfNode =>
  ({ type: "paragraph", content: [text(t)] });

export const h2 = (t: string): AdfNode => ({
  type: "heading",
  attrs: { level: 2 },
  content: [text(t)]
});

export const bullet = (items: string[]): AdfNode => ({
  type: "bulletList",
  content: items.map((t) => ({
    type: "listItem",
    content: [para(t)]
  }))
});

export const codeBlock = (
  language: string, body: string
): AdfNode => ({
  type: "codeBlock",
  attrs: { language },
  content: [text(body)]
});

export const doc = (content: AdfNode[]): AdfNode =>
  ({ type: "doc", version: 1, content });

const MAX_FIELD = 500;
const clip = (s: string) =>
  s.length > MAX_FIELD ? s.slice(0, MAX_FIELD) : s;

export type DescriptionInput = {
  description: string;
  reporter: { name: string; email: string } | null;
  page: {
    title: string; url: string;
    language: string; site: string;
  } | null;
  rendering: {
    name: string; template: string; instanceId: string;
  } | null;
  datasource: {
    fields: Record<string, string>;
  } | null;
  browser: {
    userAgent: string; viewport: string; timestamp: string;
  };
};

export function buildDescription(
  input: DescriptionInput
): AdfNode {
  const sections: AdfNode[] = [];
  sections.push(h2("Description"));
  sections.push(para(
    input.description || "No description provided."
  ));
  sections.push(h2("Reporter"));
  sections.push(para(
    input.reporter
      ? `${input.reporter.name} — ${input.reporter.email}`
      : "(unavailable)"
  ));
  sections.push(h2("Page"));
  sections.push(para(
    input.page
      ? [input.page.title, input.page.url,
         input.page.language, input.page.site].join(" · ")
      : "(unavailable)"
  ));
  sections.push(h2("Rendering"));
  sections.push(para(
    input.rendering
      ? `${input.rendering.name} (${input.rendering.template}) · ` +
        `${input.rendering.instanceId}`
      : "(unavailable)"
  ));
  sections.push(h2("Datasource fields"));
  if (input.datasource &&
      Object.keys(input.datasource.fields).length > 0) {
    sections.push(bullet(
      Object.entries(input.datasource.fields)
        .map(([k, v]) => `${k}: ${clip(String(v))}`)
    ));
  } else {
    sections.push(para("(unavailable)"));
  }
  sections.push(h2("Browser"));
  sections.push(para(
    [input.browser.userAgent, input.browser.viewport,
     input.browser.timestamp].join(" · ")
  ));
  return doc(sections);
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run src/lib/adf.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/apps/jira-reporter-plugin/src/lib/adf*
git commit -m "feat(jira-reporter): add ADF description builder"
```

---

### Task 3: `lib/jira-errors.ts` — upstream error mapping

**Files:**

- Create: `src/apps/jira-reporter-plugin/src/lib/jira-errors.ts`
- Test: `src/apps/jira-reporter-plugin/src/lib/jira-errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/jira-errors.test.ts
import { describe, it, expect } from "vitest";
import { mapJiraError } from "./jira-errors";

describe("mapJiraError", () => {
  it.each([
    [401, "config",    /not configured correctly/i],
    [403, "config",    /not configured correctly/i],
    [404, "config",    /project not found/i],
    [400, "unknown",   /JIRA rejected/i],
    [413, "retryable", /too large/i],
    [429, "retryable", /try again/i],
    [500, "retryable", /temporarily unavailable/i],
    [502, "retryable", /temporarily unavailable/i],
    [503, "retryable", /temporarily unavailable/i]
  ])("maps %s → %s", (status, category, userMsg) => {
    const err = mapJiraError({
      status, upstreamBody: { errorMessages: ["x"] }
    });
    expect(err.category).toBe(category);
    expect(err.userMessage).toMatch(userMsg);
  });

  it("surfaces Retry-After on 429", () => {
    const err = mapJiraError({
      status: 429,
      upstreamBody: {},
      retryAfterSeconds: 7
    });
    expect(err.userMessage).toContain("7");
    expect(err.retryAfterSeconds).toBe(7);
  });

  it("falls back to unknown on unexpected status", () => {
    const err = mapJiraError({
      status: 418, upstreamBody: {}
    });
    expect(err.category).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npx vitest run src/lib/jira-errors.test.ts
```

- [ ] **Step 3: Implement `src/lib/jira-errors.ts`**

```ts
export type PluginErrorCategory =
  "retryable" | "permission" | "config" | "unknown";

export type PluginError = {
  category: PluginErrorCategory;
  userMessage: string;
  logCode: string;
  retryAfterSeconds?: number;
};

export type UpstreamInput = {
  status: number;
  upstreamBody: unknown;
  retryAfterSeconds?: number;
};

export function mapJiraError(u: UpstreamInput): PluginError {
  const { status, retryAfterSeconds } = u;
  if (status === 401) return {
    category: "config", logCode: "jira.401.invalid-token",
    userMessage:
      "Plugin not configured correctly — contact your " +
      "Sitecore admin."
  };
  if (status === 403) return {
    category: "config", logCode: "jira.403.no-permission",
    userMessage:
      "Plugin not configured correctly — contact your " +
      "Sitecore admin."
  };
  if (status === 404) return {
    category: "config", logCode: "jira.404.project-not-found",
    userMessage:
      "Configured JIRA project not found — check plugin " +
      "settings."
  };
  if (status === 400) return {
    category: "unknown", logCode: "jira.400.validation",
    userMessage:
      "JIRA rejected the request. Please contact support."
  };
  if (status === 413) return {
    category: "retryable",
    logCode: "jira.413.payload-too-large",
    userMessage: "Screenshot too large — try a smaller image."
  };
  if (status === 429) return {
    category: "retryable", logCode: "jira.429.rate-limited",
    userMessage:
      `JIRA is busy — try again in ${retryAfterSeconds ?? 10}s.`,
    retryAfterSeconds
  };
  if (status >= 500 && status < 600) return {
    category: "retryable", logCode: `jira.${status}.server`,
    userMessage: "JIRA is temporarily unavailable."
  };
  return {
    category: "unknown", logCode: `jira.${status}.unknown`,
    userMessage: "JIRA returned an unexpected error."
  };
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): map upstream JIRA errors to plugin errors"
```

---

### Task 4: `lib/rate-limit.ts` — p-queue wrapper

**Files:**

- Create: `src/apps/jira-reporter-plugin/src/lib/rate-limit.ts`
- Test: `src/apps/jira-reporter-plugin/src/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rate-limit.test.ts
import { describe, it, expect, vi } from "vitest";
import { JiraQueue } from "./rate-limit";

describe("JiraQueue", () => {
  it("serialises concurrent tasks (concurrency 1)", async () => {
    const q = new JiraQueue({ concurrency: 1, intervalCap: 100 });
    const order: number[] = [];
    const run = (n: number, ms: number) => q.add(async () => {
      await new Promise((r) => setTimeout(r, ms));
      order.push(n);
    });
    await Promise.all([run(1, 30), run(2, 10), run(3, 10)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("honours intervalCap per second", async () => {
    const q = new JiraQueue({ concurrency: 1, intervalCap: 2 });
    const t0 = Date.now();
    await Promise.all([
      q.add(async () => {}),
      q.add(async () => {}),
      q.add(async () => {})
    ]);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  it("propagates errors from the enqueued task", async () => {
    const q = new JiraQueue({ concurrency: 1, intervalCap: 10 });
    await expect(q.add(async () => { throw new Error("boom"); }))
      .rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/lib/rate-limit.ts`**

```ts
import PQueue from "p-queue";

export type JiraQueueOptions = {
  concurrency: number;
  intervalCap: number;
  interval?: number;
};

export class JiraQueue {
  private readonly queue: PQueue;
  constructor(opts: JiraQueueOptions) {
    this.queue = new PQueue({
      concurrency: opts.concurrency,
      intervalCap: opts.intervalCap,
      interval: opts.interval ?? 1000,
      carryoverConcurrencyCount: true
    });
  }
  async add<T>(fn: () => Promise<T>): Promise<T> {
    const result = await this.queue.add(fn);
    return result as T;
  }
  get pending(): number { return this.queue.pending; }
  get size(): number { return this.queue.size; }
}

let singleton: JiraQueue | null = null;
export function getJiraQueue(): JiraQueue {
  if (!singleton) {
    singleton = new JiraQueue({
      concurrency: 1, intervalCap: 3, interval: 1000
    });
  }
  return singleton;
}

export function resetJiraQueueForTests(): void {
  singleton = null;
}
```

- [ ] **Step 4: Run test — expect pass** (allow up to 2s).

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add JIRA request queue with interval cap"
```

---

### Task 5: `lib/auth.ts` — session + admin allowlist

**Files:**

- Create: `src/apps/jira-reporter-plugin/src/lib/auth.ts`
- Test: `src/apps/jira-reporter-plugin/src/lib/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { verifySdkSession, isAdminEmail } from "./auth";

describe("verifySdkSession", () => {
  beforeEach(() => {
    vi.stubEnv("MARKETPLACE_SDK_PUBLIC_KEY", "test-key");
  });

  it("rejects requests with no header", async () => {
    const req = new Request("http://x/api", { method: "GET" });
    const out = await verifySdkSession(req);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(401);
  });

  it("accepts requests with a valid token (stub)", async () => {
    const req = new Request("http://x/api", {
      method: "GET",
      headers: { "X-Sdk-Token": "stub-valid" }
    });
    const out = await verifySdkSession(req);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.session.email).toBeTypeOf("string");
  });
});

describe("isAdminEmail", () => {
  it("is true when email is in allowlist (case-insensitive)",
     () => {
    vi.stubEnv(
      "PLUGIN_ADMIN_EMAILS",
      "alice@x.com, bob@x.com"
    );
    expect(isAdminEmail("ALICE@x.com")).toBe(true);
    expect(isAdminEmail("eve@x.com")).toBe(false);
  });

  it("is false when env not set", () => {
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "");
    expect(isAdminEmail("alice@x.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/lib/auth.ts`**

Note: the real implementation will verify a JWT issued by the
Sitecore Marketplace SDK. Until the SDK version is pinned and the
public key source is confirmed, this file exposes a stub verifier
that accepts tokens starting with `stub-valid` in non-production
and calls a pluggable validator in production. A follow-up task
(tracked in `docs/todo/sdk-jwt.md`) swaps in the real verifier.

```ts
export type SdkSession = {
  email: string;
  name: string;
  tenantId: string;
};

export type SessionResult =
  | { ok: true; session: SdkSession }
  | { ok: false; status: number; reason: string };

export async function verifySdkSession(
  req: Request
): Promise<SessionResult> {
  const token = req.headers.get("X-Sdk-Token");
  if (!token) {
    return {
      ok: false, status: 401, reason: "missing-token"
    };
  }
  if (process.env.NODE_ENV !== "production" &&
      token.startsWith("stub-valid")) {
    return {
      ok: true,
      session: {
        email: "dev@local", name: "Dev User",
        tenantId: "dev-tenant"
      }
    };
  }
  const validator = globalThis.__SDK_VALIDATOR__;
  if (!validator) {
    return {
      ok: false, status: 401, reason: "no-validator"
    };
  }
  try {
    const session = await validator(token);
    return { ok: true, session };
  } catch {
    return {
      ok: false, status: 401, reason: "invalid-token"
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __SDK_VALIDATOR__:
    ((t: string) => Promise<SdkSession>) | undefined;
}

export function isAdminEmail(email: string): boolean {
  const raw = process.env.PLUGIN_ADMIN_EMAILS ?? "";
  const list = raw.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(jira-reporter): add session verify + admin check"
```

---

### Task 6: `lib/settings-store.ts` — Vercel KV abstraction

**Files:**

- Create: `src/apps/jira-reporter-plugin/src/lib/settings-store.ts`
- Test: `src/apps/jira-reporter-plugin/src/lib/settings-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/settings-store.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import {
  SettingsStore, SettingsSchema
} from "./settings-store";

describe("SettingsSchema", () => {
  it("accepts a valid settings object", () => {
    const parsed = SettingsSchema.parse({
      projectKey: "CLD",
      defaultIssueType: "Bug",
      defaultLabels: ["page-builder"],
      defaultAssigneeAccountId: null
    });
    expect(parsed.projectKey).toBe("CLD");
  });

  it("rejects empty projectKey", () => {
    expect(() => SettingsSchema.parse({
      projectKey: "",
      defaultIssueType: "Bug",
      defaultLabels: [],
      defaultAssigneeAccountId: null
    })).toThrow();
  });
});

describe("SettingsStore (in-memory driver)", () => {
  let store: SettingsStore;
  beforeEach(() => {
    store = new SettingsStore({
      driver: "memory", cacheMs: 10
    });
  });

  it("returns defaults when nothing stored", async () => {
    const s = await store.get();
    expect(s.projectKey).toBe("CLD");
  });

  it("round-trips settings through put", async () => {
    await store.put({
      projectKey: "OPS",
      defaultIssueType: "Task",
      defaultLabels: ["x"],
      defaultAssigneeAccountId: null
    });
    const s = await store.get();
    expect(s.projectKey).toBe("OPS");
    expect(s.defaultIssueType).toBe("Task");
  });

  it("caches reads for cacheMs then refreshes", async () => {
    const driver = { reads: 0 };
    const s = new SettingsStore({
      driver: "memory", cacheMs: 20,
      onRead: () => { driver.reads += 1; }
    });
    await s.get();
    await s.get();
    expect(driver.reads).toBe(1);
    await new Promise((r) => setTimeout(r, 25));
    await s.get();
    expect(driver.reads).toBe(2);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/lib/settings-store.ts`**

```ts
import { z } from "zod";

export const SettingsSchema = z.object({
  projectKey: z.string().min(1),
  defaultIssueType: z.string().min(1),
  defaultLabels: z.array(z.string()),
  defaultAssigneeAccountId: z.string().nullable()
});
export type Settings = z.infer<typeof SettingsSchema>;

const DEFAULTS: Settings = {
  projectKey: "CLD",
  defaultIssueType: "Bug",
  defaultLabels: ["page-builder"],
  defaultAssigneeAccountId: null
};

export type StoreOptions = {
  driver: "memory" | "vercel-kv";
  cacheMs: number;
  onRead?: () => void;
  onWrite?: () => void;
};

export class SettingsStore {
  private cache: { value: Settings; at: number } | null = null;
  private mem: Settings = DEFAULTS;
  constructor(private readonly opts: StoreOptions) {}

  async get(): Promise<Settings> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.opts.cacheMs) {
      return this.cache.value;
    }
    this.opts.onRead?.();
    const fresh = this.opts.driver === "memory"
      ? this.mem
      : await this.readKv();
    this.cache = { value: fresh, at: now };
    return fresh;
  }

  async put(next: Settings): Promise<void> {
    SettingsSchema.parse(next);
    this.opts.onWrite?.();
    if (this.opts.driver === "memory") {
      this.mem = next;
    } else {
      await this.writeKv(next);
    }
    this.cache = { value: next, at: Date.now() };
  }

  private async readKv(): Promise<Settings> {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    const raw = await r.get<Settings>("plugin:settings");
    return raw ? SettingsSchema.parse(raw) : DEFAULTS;
  }

  private async writeKv(value: Settings): Promise<void> {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    await r.set("plugin:settings", value);
  }
}

let singleton: SettingsStore | null = null;
export function getSettingsStore(): SettingsStore {
  if (!singleton) {
    const driver = process.env.UPSTASH_REDIS_REST_URL
      ? "vercel-kv" : "memory";
    singleton = new SettingsStore({ driver, cacheMs: 30_000 });
  }
  return singleton;
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add settings store with Vercel KV driver"
```

---

## Phase 2 — Services

### Task 7: `services/screenshot/upload.ts` — file validation

**Files:**

- Create: `src/services/screenshot/upload.ts`
- Test: `src/services/screenshot/upload.test.ts`

(Paths relative to `src/apps/jira-reporter-plugin/src/`.)

- [ ] **Step 1: Write the failing test**

```ts
// src/services/screenshot/upload.test.ts
import { describe, it, expect } from "vitest";
import { readFileToBlob, MAX_ATTACHMENT_BYTES }
  from "./upload";

const makeFile = (bytes: number, type: string) =>
  new File([new Uint8Array(bytes)], "x", { type });

describe("readFileToBlob", () => {
  it("accepts a valid png under size", async () => {
    const f = makeFile(1024, "image/png");
    const out = await readFileToBlob(f);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.blob.type).toBe("image/png");
  });

  it.each(["image/png", "image/jpeg", "image/webp"])(
    "accepts %s", async (mime) => {
    const out = await readFileToBlob(makeFile(10, mime));
    expect(out.ok).toBe(true);
  });

  it("rejects unsupported mime", async () => {
    const out = await readFileToBlob(
      makeFile(10, "application/pdf")
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("unsupported-mime");
  });

  it("rejects oversize files", async () => {
    const out = await readFileToBlob(
      makeFile(MAX_ATTACHMENT_BYTES + 1, "image/png")
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("too-large");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/services/screenshot/upload.ts`**

```ts
const ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp"
]);

export const MAX_ATTACHMENT_BYTES = (() => {
  const mb = Number(process.env.MAX_ATTACHMENT_MB ?? 25);
  return mb * 1024 * 1024;
})();

export type UploadResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason:
      "unsupported-mime" | "too-large" | "empty" };

export async function readFileToBlob(
  file: File
): Promise<UploadResult> {
  if (file.size === 0) return { ok: false, reason: "empty" };
  if (!ALLOWED.has(file.type)) {
    return { ok: false, reason: "unsupported-mime" };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  const buf = await file.arrayBuffer();
  return { ok: true, blob: new Blob([buf], { type: file.type }) };
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add upload validation service"
```

---

### Task 8: `services/screenshot/capture.ts` — Screen Capture API

**Files:**

- Create: `src/services/screenshot/capture.ts`
- Test: `src/services/screenshot/capture.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/screenshot/capture.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { captureVisibleTab } from "./capture";

describe("captureVisibleTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a blob when the user accepts the prompt",
     async () => {
    const stop = vi.fn();
    const track = { stop, readyState: "live" };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track]
    } as unknown as MediaStream;

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(stream)
      }
    });
    vi.stubGlobal("ImageCapture", class {
      constructor(_: unknown) {}
      grabFrame() {
        return Promise.resolve({ width: 10, height: 10 });
      }
    });
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(_w: number, _h: number) {}
      getContext() {
        return {
          drawImage: vi.fn()
        };
      }
      convertToBlob() {
        return Promise.resolve(
          new Blob(["x"], { type: "image/png" })
        );
      }
    });

    const out = await captureVisibleTab();
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.blob.type).toBe("image/png");
    expect(stop).toHaveBeenCalled();
  });

  it("returns cancelled when the user declines",
     async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockRejectedValue(
          new DOMException("denied", "NotAllowedError")
        )
      }
    });
    const out = await captureVisibleTab();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("cancelled");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/services/screenshot/capture.ts`**

```ts
export type CaptureResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "cancelled" | "unsupported" | "error" };

export async function captureVisibleTab(): Promise<CaptureResult> {
  const md = typeof navigator !== "undefined"
    ? navigator.mediaDevices : undefined;
  if (!md || !md.getDisplayMedia) {
    return { ok: false, reason: "unsupported" };
  }
  let stream: MediaStream;
  try {
    stream = await md.getDisplayMedia({
      video: { frameRate: 1 } as MediaTrackConstraints,
      audio: false
    });
  } catch (err) {
    const isDenied = err instanceof DOMException &&
      err.name === "NotAllowedError";
    return {
      ok: false,
      reason: isDenied ? "cancelled" : "error"
    };
  }
  try {
    const [track] = stream.getVideoTracks();
    if (!track) return { ok: false, reason: "error" };
    const ImageCaptureCtor = (globalThis as unknown as {
      ImageCapture?: new (t: MediaStreamTrack) => {
        grabFrame: () => Promise<ImageBitmap>;
      };
    }).ImageCapture;
    if (!ImageCaptureCtor) {
      return { ok: false, reason: "unsupported" };
    }
    const capture = new ImageCaptureCtor(track);
    const bitmap = await capture.grabFrame();
    const canvas = new OffscreenCanvas(
      bitmap.width, bitmap.height
    );
    const ctx = canvas.getContext("2d") as
      OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return { ok: false, reason: "error" };
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    const blob = await canvas.convertToBlob({
      type: "image/png"
    });
    return { ok: true, blob };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add screen capture service"
```

---

### Task 9: `services/jira/client.ts` — browser HTTP client

**Files:**

- Create: `src/services/jira/client.ts`
- Test: `src/services/jira/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/jira/client.test.ts
import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest";
import { JiraClient } from "./client";

describe("JiraClient", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.stubGlobal("fetch", originalFetch); });

  it("createIssue POSTs to /api/jira/issue with JSON body",
     async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ key: "CLD-1", url: "http://j/CLD-1" }),
        { status: 201 }
      )
    );
    const c = new JiraClient({ sdkToken: "stub-valid" });
    const out = await c.createIssue({
      summary: "s", descriptionText: "d",
      context: {} as never, attachmentCount: 0
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/jira/issue",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Sdk-Token": "stub-valid"
        })
      })
    );
    expect(out.key).toBe("CLD-1");
  });

  it("createIssue throws a PluginError on non-2xx",
     async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            category: "config",
            userMessage: "bad",
            logCode: "jira.401.invalid-token"
          }
        }),
        { status: 401 }
      )
    );
    const c = new JiraClient({ sdkToken: "stub-valid" });
    await expect(c.createIssue({
      summary: "s", descriptionText: "",
      context: {} as never, attachmentCount: 0
    })).rejects.toMatchObject({
      category: "config", userMessage: "bad"
    });
  });

  it("uploadAttachment POSTs multipart", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ id: "att-1" }),
        { status: 201 }
      )
    );
    const c = new JiraClient({ sdkToken: "stub-valid" });
    const out = await c.uploadAttachment(
      "CLD-1", new Blob(["x"], { type: "image/png" })
    );
    expect(out.id).toBe("att-1");
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/services/jira/client.ts`**

```ts
import type { PluginError } from "@/lib/jira-errors";

export type CreateIssuePayload = {
  summary: string;
  descriptionText: string;
  context: unknown;
  attachmentCount: number;
};

export type CreateIssueResult = { key: string; url: string };
export type AttachmentResult = { id: string };

export class JiraClient {
  constructor(private readonly opts: { sdkToken: string }) {}

  async createIssue(
    payload: CreateIssuePayload
  ): Promise<CreateIssueResult> {
    const res = await fetch("/api/jira/issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sdk-Token": this.opts.sdkToken
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw await this.asError(res);
    return (await res.json()) as CreateIssueResult;
  }

  async uploadAttachment(
    issueKey: string, blob: Blob
  ): Promise<AttachmentResult> {
    const form = new FormData();
    form.append(
      "file", blob,
      `screenshot-${Date.now()}.png`
    );
    const res = await fetch(
      `/api/jira/attachment?issueKey=${encodeURIComponent(issueKey)}`,
      {
        method: "POST",
        headers: { "X-Sdk-Token": this.opts.sdkToken },
        body: form
      }
    );
    if (!res.ok) throw await this.asError(res);
    return (await res.json()) as AttachmentResult;
  }

  private async asError(res: Response): Promise<PluginError> {
    try {
      const body = (await res.json()) as { error?: PluginError };
      if (body.error) return body.error;
    } catch {}
    return {
      category: "unknown",
      userMessage: `HTTP ${res.status}`,
      logCode: `client.${res.status}`
    };
  }
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add browser JIRA client"
```

---

### Task 10: `services/sitecore/xmc.ts` — XMC GraphQL (server)

**Files:**

- Create: `src/services/sitecore/xmc.ts`
- Test: `src/services/sitecore/xmc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/sitecore/xmc.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  createXmcClient, GET_ITEM_QUERY, GET_ME_QUERY
} from "./xmc";

describe("XmcClient", () => {
  it("getCurrentUser calls XMC with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        data: { me: { name: "Ada", email: "a@x.com" } }
      }),
      { status: 200 }
    ));
    const c = createXmcClient({
      baseUrl: "https://xmc.example.com",
      token: "t",
      fetch: fetchMock
    });
    const me = await c.getCurrentUser();
    expect(me).toEqual({ name: "Ada", email: "a@x.com" });
    const [, init] =
      fetchMock.mock.calls[0]! as [string, RequestInit];
    expect((init.headers as Record<string, string>)
      .Authorization).toBe("Bearer t");
    const parsed = JSON.parse(init.body as string) as {
      query: string;
    };
    expect(parsed.query).toBe(GET_ME_QUERY);
  });

  it("getDatasourceFields returns name→value map",
     async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        data: { item: {
          fields: [
            { name: "Title", value: "Welcome" },
            { name: "Body", value: "Hello" }
          ]
        } }
      }),
      { status: 200 }
    ));
    const c = createXmcClient({
      baseUrl: "https://xmc.example.com",
      token: "t", fetch: fetchMock
    });
    const fields = await c.getDatasourceFields("uid", "en");
    expect(fields).toEqual({
      Title: "Welcome", Body: "Hello"
    });
  });

  it("returns null map on upstream error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("nope", { status: 500 })
    );
    const c = createXmcClient({
      baseUrl: "https://xmc.example.com",
      token: "t", fetch: fetchMock
    });
    await expect(c.getDatasourceFields("uid", "en"))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/services/sitecore/xmc.ts`**

```ts
export const GET_ME_QUERY = `query Me {
  me { name email }
}`;

export const GET_ITEM_QUERY = `query Item($id: String!, $lang: String!) {
  item(path: $id, language: $lang) {
    fields(ownFields: true) { name value }
  }
}`;

export type XmcClientOptions = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
};

export type XmcClient = {
  getCurrentUser: () =>
    Promise<{ name: string; email: string }>;
  getDatasourceFields: (
    itemId: string, language: string
  ) => Promise<Record<string, string>>;
};

export function createXmcClient(
  opts: XmcClientOptions
): XmcClient {
  const f = opts.fetch ?? fetch;
  const endpoint = `${opts.baseUrl.replace(/\/$/, "")}` +
    `/sitecore/api/authoring/graphql/v1`;

  async function gql<T>(
    query: string, variables?: Record<string, unknown>
  ): Promise<T> {
    const res = await f(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`
      },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
      throw new Error(`XMC HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      data?: T; errors?: unknown[];
    };
    if (body.errors && body.errors.length > 0) {
      throw new Error(`XMC GraphQL errors`);
    }
    if (!body.data) throw new Error("XMC empty data");
    return body.data;
  }

  return {
    async getCurrentUser() {
      const data = await gql<{
        me: { name: string; email: string };
      }>(GET_ME_QUERY);
      return data.me;
    },
    async getDatasourceFields(itemId, language) {
      const data = await gql<{
        item: { fields: Array<{ name: string; value: string }> };
      }>(GET_ITEM_QUERY, { id: itemId, lang: language });
      return Object.fromEntries(
        data.item.fields.map((f) => [f.name, f.value])
      );
    }
  };
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add XMC Authoring GraphQL client"
```

---

### Task 11: `services/sitecore/context.ts` — SDK wrapper

**Files:**

- Create: `src/services/sitecore/context.ts`
- Test: `src/services/sitecore/context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/sitecore/context.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import {
  initSitecoreContext, getPagesContext,
  subscribeToLayoutChanges
} from "./context";

type SdkStub = {
  query: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

describe("sitecore context", () => {
  let sdk: SdkStub;
  beforeEach(() => {
    sdk = {
      query: vi.fn().mockResolvedValue({
        data: {
          page: { id: "P", path: "/en", title: "Home",
                  language: "en" },
          site: { name: "main" }
        }
      }),
      subscribe: vi.fn().mockReturnValue(() => {})
    };
    initSitecoreContext(sdk as never);
  });

  it("getPagesContext returns cached page + site", async () => {
    const ctx = await getPagesContext();
    expect(ctx.page.id).toBe("P");
    expect(ctx.site.name).toBe("main");
  });

  it("subscribeToLayoutChanges forwards events", () => {
    const cb = vi.fn();
    const off = subscribeToLayoutChanges(cb);
    expect(sdk.subscribe).toHaveBeenCalled();
    expect(typeof off).toBe("function");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/services/sitecore/context.ts`**

```ts
export type PagesContext = {
  page: {
    id: string;
    path: string;
    title: string;
    language: string;
  };
  site: { name: string };
  rendering?: {
    instanceId: string;
    renderingId: string;
    name: string;
    templateName: string;
  } | null;
};

export type LayoutChangeEvent = {
  type: "page-layout" | "field-layout";
  renderingInstanceId?: string;
};

export interface MarketplaceSdkLike {
  query(name: string): Promise<{ data: unknown }>;
  subscribe(
    topic: string, handler: (evt: unknown) => void
  ): () => void;
}

let sdkRef: MarketplaceSdkLike | null = null;

export function initSitecoreContext(
  sdk: MarketplaceSdkLike
): void {
  sdkRef = sdk;
}

export async function getPagesContext(): Promise<PagesContext> {
  if (!sdkRef) throw new Error("sdk-not-initialised");
  const res = await sdkRef.query("pages.context");
  return res.data as PagesContext;
}

export function subscribeToLayoutChanges(
  cb: (evt: LayoutChangeEvent) => void
): () => void {
  if (!sdkRef) throw new Error("sdk-not-initialised");
  return sdkRef.subscribe("pages.layout", (e) =>
    cb(e as LayoutChangeEvent)
  );
}

export function getSelectedRendering(
  ctx: PagesContext
): PagesContext["rendering"] {
  return ctx.rendering ?? null;
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add Sitecore SDK context wrapper"
```

---

## Phase 3 — API route handlers

All routes in this phase run on the server, verify the SDK
session, and return either a success JSON or
`{ error: PluginError }` with the appropriate HTTP status.

### Task 12: `/api/health` — smoke-check endpoint

**Files:**

- Create: `src/app/api/health/route.ts`
- Test: `src/app/api/health/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/health/route.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns ok true with flags", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean; jiraConfigured: boolean;
      settingsLoaded: boolean;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.jiraConfigured).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/app/api/health/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSettingsStore } from "@/lib/settings-store";

export async function GET() {
  let settingsLoaded = false;
  try {
    await getSettingsStore().get();
    settingsLoaded = true;
  } catch {}
  return NextResponse.json({
    ok: true,
    jiraConfigured: Boolean(
      process.env.JIRA_BASE_URL && process.env.JIRA_API_TOKEN
    ),
    settingsLoaded,
    at: new Date().toISOString()
  });
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(jira-reporter): add health endpoint"
```

---

### Task 13: `/api/settings` — GET + PUT

**Files:**

- Create: `src/app/api/settings/route.ts`
- Test: `src/app/api/settings/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/settings/route.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET, PUT } from "./route";

const withToken = (
  body?: unknown, method = "GET"
): Request =>
  new Request("http://x/api/settings", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Sdk-Token": "stub-valid"
    },
    body: body ? JSON.stringify(body) : undefined
  });

describe("/api/settings", () => {
  beforeEach(() => {
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "dev@local");
  });

  it("GET returns defaults", async () => {
    const res = await GET(withToken());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectKey).toBe("CLD");
  });

  it("GET 401 without session", async () => {
    const res = await GET(new Request("http://x/api/settings"));
    expect(res.status).toBe(401);
  });

  it("PUT forbids non-admin", async () => {
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "other@x");
    const res = await PUT(withToken({
      projectKey: "X",
      defaultIssueType: "Bug",
      defaultLabels: [],
      defaultAssigneeAccountId: null
    }, "PUT"));
    expect(res.status).toBe(403);
  });

  it("PUT admin writes settings", async () => {
    const res = await PUT(withToken({
      projectKey: "OPS",
      defaultIssueType: "Task",
      defaultLabels: ["x"],
      defaultAssigneeAccountId: null
    }, "PUT"));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.projectKey).toBe("OPS");
  });

  it("PUT 400 on bad body", async () => {
    const res = await PUT(withToken(
      { projectKey: "" }, "PUT"
    ));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/app/api/settings/route.ts`**

```ts
import { NextResponse } from "next/server";
import { verifySdkSession, isAdminEmail } from "@/lib/auth";
import {
  getSettingsStore, SettingsSchema
} from "@/lib/settings-store";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return json401();
  const settings = await getSettingsStore().get();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return json401();
  if (!isAdminEmail(s.session.email)) {
    return NextResponse.json(
      { error: {
          category: "permission",
          userMessage: "Admin access required",
          logCode: "settings.put.not-admin"
      } },
      { status: 403 }
    );
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return json400("invalid-json"); }
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) return json400("invalid-shape");
  await getSettingsStore().put(parsed.data);
  return NextResponse.json(parsed.data);
}

function json401() {
  return NextResponse.json(
    { error: {
        category: "permission",
        userMessage: "Sign-in required",
        logCode: "settings.auth.missing"
    } },
    { status: 401 }
  );
}

function json400(code: string) {
  return NextResponse.json(
    { error: {
        category: "unknown",
        userMessage: "Invalid settings payload",
        logCode: `settings.put.${code}`
    } },
    { status: 400 }
  );
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add settings GET/PUT endpoint"
```

---

### Task 14: `/api/xmc/me` — resolve current Sitecore user

**Files:**

- Create: `src/app/api/xmc/me/route.ts`
- Test: `src/app/api/xmc/me/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/xmc/me/route.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET } from "./route";

const mkReq = () =>
  new Request("http://x/api/xmc/me", {
    headers: { "X-Sdk-Token": "stub-valid" }
  });

describe("GET /api/xmc/me", () => {
  beforeEach(() => {
    vi.stubEnv(
      "XMC_TENANT_URL",
      "https://xmc.example.com"
    );
  });

  it("returns the resolved user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: { me: { name: "Ada", email: "a@x.com" } }
      }), { status: 200 })
    ));
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("a@x.com");
  });

  it("401 without session", async () => {
    const res = await GET(new Request("http://x/api/xmc/me"));
    expect(res.status).toBe(401);
  });

  it("502 when upstream fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("nope", { status: 500 })
    ));
    const res = await GET(mkReq());
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/app/api/xmc/me/route.ts`**

```ts
import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import { createXmcClient } from "@/services/sitecore/xmc";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return fail(401, "auth.missing");
  const baseUrl = process.env.XMC_TENANT_URL;
  if (!baseUrl) return fail(500, "xmc.not-configured");
  const token = req.headers.get("X-Sdk-Token") ?? "";
  try {
    const client = createXmcClient({ baseUrl, token });
    const me = await client.getCurrentUser();
    return NextResponse.json(me);
  } catch {
    return fail(502, "xmc.upstream");
  }
}

function fail(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category: status === 401 ? "permission" : "retryable",
        userMessage:
          status === 401 ? "Sign-in required" :
          "Could not identify user",
        logCode: code
    } },
    { status }
  );
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add /api/xmc/me endpoint"
```

---

### Task 15: `/api/xmc/datasource` — resolve field values

**Files:**

- Create: `src/app/api/xmc/datasource/route.ts`
- Test: `src/app/api/xmc/datasource/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/xmc/datasource/route.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET } from "./route";

const url = (params: string) =>
  new Request(`http://x/api/xmc/datasource?${params}`, {
    headers: { "X-Sdk-Token": "stub-valid" }
  });

describe("GET /api/xmc/datasource", () => {
  beforeEach(() => {
    vi.stubEnv("XMC_TENANT_URL", "https://xmc.example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: { item: { fields: [
          { name: "Title", value: "Welcome" }
        ] } }
      }), { status: 200 })
    ));
  });

  it("returns fields map", async () => {
    const res = await GET(url("itemId=abc&language=en"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields.Title).toBe("Welcome");
  });

  it("400 when params missing", async () => {
    const res = await GET(url(""));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement**
`src/app/api/xmc/datasource/route.ts`

```ts
import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import { createXmcClient } from "@/services/sitecore/xmc";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return err(401, "auth.missing");
  const url = new URL(req.url);
  const itemId = url.searchParams.get("itemId");
  const language = url.searchParams.get("language");
  if (!itemId || !language) return err(400, "params.missing");
  const baseUrl = process.env.XMC_TENANT_URL;
  if (!baseUrl) return err(500, "xmc.not-configured");
  const token = req.headers.get("X-Sdk-Token") ?? "";
  try {
    const client = createXmcClient({ baseUrl, token });
    const fields = await client.getDatasourceFields(
      itemId, language
    );
    return NextResponse.json({ fields });
  } catch {
    return err(502, "xmc.upstream");
  }
}

function err(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category: "retryable",
        userMessage: "Could not resolve datasource",
        logCode: code
    } },
    { status }
  );
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add /api/xmc/datasource endpoint"
```

---

### Task 16: `/api/jira/issue` — create issue

**Files:**

- Create: `src/app/api/jira/issue/route.ts`
- Test: `src/app/api/jira/issue/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/jira/issue/route.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { POST } from "./route";
import { resetJiraQueueForTests } from "@/lib/rate-limit";

const mkReq = (body: unknown) =>
  new Request("http://x/api/jira/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sdk-Token": "stub-valid"
    },
    body: JSON.stringify(body)
  });

const validBody = {
  summary: "test",
  descriptionText: "d",
  context: {
    page: { title: "T", url: "/", language: "en", site: "s" },
    rendering: null, datasource: null,
    reporter: { name: "A", email: "a@x" },
    browser: { userAgent: "UA", viewport: "1x1",
               timestamp: "t" }
  },
  attachmentCount: 0
};

describe("POST /api/jira/issue", () => {
  beforeEach(() => {
    resetJiraQueueForTests();
    vi.stubEnv("JIRA_BASE_URL", "https://j.example.com");
    vi.stubEnv("JIRA_SERVICE_EMAIL", "svc@x");
    vi.stubEnv("JIRA_API_TOKEN", "tok");
  });

  it("creates issue on 201", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        key: "CLD-1", id: "10", self: "http://j/CLD-1"
      }), { status: 201 })
    ));
    const res = await POST(mkReq(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toBe("CLD-1");
    expect(body.url).toContain("browse/CLD-1");
  });

  it("maps upstream 401 to config error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("bad", { status: 401 })
    ));
    const res = await POST(mkReq(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.category).toBe("config");
  });

  it("400 on missing summary", async () => {
    const bad = { ...validBody, summary: "" };
    const res = await POST(mkReq(bad));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `src/app/api/jira/issue/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySdkSession } from "@/lib/auth";
import { getSettingsStore } from "@/lib/settings-store";
import { getJiraQueue } from "@/lib/rate-limit";
import { mapJiraError } from "@/lib/jira-errors";
import { buildDescription } from "@/lib/adf";

const ContextSchema = z.object({
  page: z.object({
    title: z.string(), url: z.string(),
    language: z.string(), site: z.string()
  }).nullable(),
  rendering: z.object({
    name: z.string(), template: z.string(),
    instanceId: z.string()
  }).nullable(),
  datasource: z.object({
    fields: z.record(z.string())
  }).nullable(),
  reporter: z.object({
    name: z.string(), email: z.string()
  }).nullable(),
  browser: z.object({
    userAgent: z.string(), viewport: z.string(),
    timestamp: z.string()
  })
});

const BodySchema = z.object({
  summary: z.string().min(1).max(255),
  descriptionText: z.string().max(10_000),
  context: ContextSchema,
  attachmentCount: z.number().int().min(0)
});

export async function POST(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return respondError(401, {
    category: "permission",
    userMessage: "Sign-in required",
    logCode: "jira.issue.auth"
  });
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return respondError(400, {
      category: "unknown",
      userMessage: "Invalid request payload",
      logCode: "jira.issue.body"
    });
  }
  const settings = await getSettingsStore().get();
  const description = buildDescription({
    description: parsed.descriptionText,
    reporter: parsed.context.reporter,
    page: parsed.context.page && {
      title: parsed.context.page.title,
      url: parsed.context.page.url,
      language: parsed.context.page.language,
      site: parsed.context.page.site
    },
    rendering: parsed.context.rendering,
    datasource: parsed.context.datasource,
    browser: parsed.context.browser
  });
  const body = {
    fields: {
      project: { key: settings.projectKey },
      issuetype: { name: settings.defaultIssueType },
      summary: parsed.summary,
      description,
      labels: settings.defaultLabels,
      ...(settings.defaultAssigneeAccountId
        ? { assignee: {
            accountId: settings.defaultAssigneeAccountId
          } }
        : {})
    }
  };
  const authHeader = basicAuth(
    process.env.JIRA_SERVICE_EMAIL!,
    process.env.JIRA_API_TOKEN!
  );
  try {
    const upstream = await getJiraQueue().add(() => fetch(
      `${process.env.JIRA_BASE_URL}/rest/api/3/issue`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body: JSON.stringify(body)
      }
    ));
    if (!upstream.ok) {
      const retryAfter = Number(
        upstream.headers.get("Retry-After")
      );
      let upstreamBody: unknown = {};
      try { upstreamBody = await upstream.json(); } catch {}
      const err = mapJiraError({
        status: upstream.status,
        upstreamBody,
        retryAfterSeconds: Number.isFinite(retryAfter)
          ? retryAfter : undefined
      });
      return respondError(upstream.status, err);
    }
    const created = (await upstream.json()) as {
      key: string; id: string;
    };
    return NextResponse.json({
      key: created.key,
      url: `${process.env.JIRA_BASE_URL}/browse/${created.key}`
    }, { status: 201 });
  } catch {
    return respondError(502, {
      category: "retryable",
      userMessage: "JIRA is temporarily unavailable.",
      logCode: "jira.issue.network"
    });
  }
}

function basicAuth(user: string, pass: string): string {
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

function respondError(
  status: number,
  error: {
    category: string; userMessage: string; logCode: string;
  }
) {
  return NextResponse.json({ error }, { status });
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add JIRA issue create endpoint"
```

---

### Task 17: `/api/jira/attachment` — upload screenshot

**Files:**

- Create: `src/app/api/jira/attachment/route.ts`
- Test: `src/app/api/jira/attachment/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/jira/attachment/route.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { POST } from "./route";
import { resetJiraQueueForTests } from "@/lib/rate-limit";

const mkReq = () => {
  const fd = new FormData();
  fd.append("file",
    new Blob(["x"], { type: "image/png" }),
    "shot.png"
  );
  return new Request(
    "http://x/api/jira/attachment?issueKey=CLD-1",
    {
      method: "POST",
      headers: { "X-Sdk-Token": "stub-valid" },
      body: fd
    }
  );
};

describe("POST /api/jira/attachment", () => {
  beforeEach(() => {
    resetJiraQueueForTests();
    vi.stubEnv("JIRA_BASE_URL", "https://j.example.com");
    vi.stubEnv("JIRA_SERVICE_EMAIL", "svc@x");
    vi.stubEnv("JIRA_API_TOKEN", "tok");
  });

  it("forwards multipart and returns attachment id",
     async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "10100" }]),
                   { status: 200 })
    ));
    const res = await POST(mkReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("10100");
  });

  it("400 when issueKey query param missing", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "image/png" }));
    const res = await POST(new Request(
      "http://x/api/jira/attachment",
      { method: "POST",
        headers: { "X-Sdk-Token": "stub-valid" },
        body: fd }
    ));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement**
`src/app/api/jira/attachment/route.ts`

```ts
import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import { getJiraQueue } from "@/lib/rate-limit";
import { mapJiraError } from "@/lib/jira-errors";

export async function POST(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return err(401, "attach.auth");
  const url = new URL(req.url);
  const issueKey = url.searchParams.get("issueKey");
  if (!issueKey) return err(400, "attach.no-key");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return err(400, "attach.no-file");
  }
  const outbound = new FormData();
  outbound.append(
    "file", file,
    (file as File).name ?? `screenshot-${Date.now()}.png`
  );
  const auth = basicAuth(
    process.env.JIRA_SERVICE_EMAIL!,
    process.env.JIRA_API_TOKEN!
  );
  try {
    const upstream = await getJiraQueue().add(() => fetch(
      `${process.env.JIRA_BASE_URL}` +
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}` +
      `/attachments`,
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "X-Atlassian-Token": "no-check"
        },
        body: outbound
      }
    ));
    if (!upstream.ok) {
      let body: unknown = {};
      try { body = await upstream.json(); } catch {}
      const m = mapJiraError({
        status: upstream.status, upstreamBody: body
      });
      return NextResponse.json(
        { error: m }, { status: upstream.status }
      );
    }
    const arr = (await upstream.json()) as Array<{ id: string }>;
    const id = arr[0]?.id ?? "";
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return err(502, "attach.network");
  }
}

function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer
    .from(`${user}:${pass}`).toString("base64");
}

function err(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category: status === 401 ? "permission" : "retryable",
        userMessage:
          status === 400 ? "Invalid attachment request" :
          status === 401 ? "Sign-in required" :
          "JIRA is temporarily unavailable",
        logCode: code
    } },
    { status }
  );
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add JIRA attachment upload endpoint"
```

---

## Phase 4 — Feature layer (UI)

### Task 18: `features/report-bug/useAutoContext.ts`

**Files:**

- Create: `src/features/report-bug/useAutoContext.ts`
- Create: `src/features/report-bug/types.ts`
- Test: `src/features/report-bug/useAutoContext.test.ts`

- [ ] **Step 1: Create `types.ts` (shared types)**

```ts
// src/features/report-bug/types.ts
export type ReportContext = {
  page: {
    id: string; title: string;
    url: string; language: string; site: string;
  } | null;
  rendering: {
    instanceId: string; renderingId: string;
    name: string; templateName: string;
  } | null;
  datasource: {
    itemId: string; templateName: string;
    fields: Record<string, string>;
  } | null;
  reporter: { name: string; email: string } | null;
  browser: {
    userAgent: string; viewport: string; timestamp: string;
  };
};
```

- [ ] **Step 2: Write the failing test**

```ts
// src/features/report-bug/useAutoContext.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAutoContext } from "./useAutoContext";

vi.mock("@/services/sitecore/context", () => ({
  getPagesContext: vi.fn().mockResolvedValue({
    page: { id: "P", path: "/en",
            title: "Home", language: "en" },
    site: { name: "main" },
    rendering: {
      instanceId: "abc", renderingId: "r",
      name: "Hero", templateName: "Banner"
    }
  })
}));

describe("useAutoContext", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(
      (url: string) => {
        if (url.includes("/api/xmc/me")) {
          return Promise.resolve(new Response(
            JSON.stringify({ name: "Ada", email: "a@x.com" }),
            { status: 200 }
          ));
        }
        if (url.includes("/api/xmc/datasource")) {
          return Promise.resolve(new Response(
            JSON.stringify({ fields: { Title: "T" } }),
            { status: 200 }
          ));
        }
        return Promise.reject(new Error("unexpected"));
      }
    ));
  });

  it("populates all context fields on mount", async () => {
    const { result } = renderHook(() =>
      useAutoContext({ sdkToken: "stub-valid",
                       datasourceItemId: "uid" })
    );
    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );
    expect(result.current.context?.reporter?.email)
      .toBe("a@x.com");
    expect(result.current.context?.rendering?.name)
      .toBe("Hero");
    expect(result.current.context?.datasource?.fields.Title)
      .toBe("T");
  });
});
```

- [ ] **Step 3: Run test — expect fail**

- [ ] **Step 4: Implement `useAutoContext.ts`**

```ts
import { useEffect, useState } from "react";
import { getPagesContext } from "@/services/sitecore/context";
import type { ReportContext } from "./types";

export type UseAutoContextOpts = {
  sdkToken: string;
  datasourceItemId?: string;
};

export type UseAutoContextState = {
  loading: boolean;
  context: ReportContext | null;
  error: string | null;
};

export function useAutoContext(
  opts: UseAutoContextOpts
): UseAutoContextState {
  const [state, setState] = useState<UseAutoContextState>({
    loading: true, context: null, error: null
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pagesCtx, reporter, datasource] =
          await Promise.all([
            getPagesContext(),
            fetchMe(opts.sdkToken),
            opts.datasourceItemId
              ? fetchDatasource(
                  opts.sdkToken,
                  opts.datasourceItemId,
                  "en"
                )
              : Promise.resolve(null)
          ]);
        if (cancelled) return;
        const ctx: ReportContext = {
          page: {
            id: pagesCtx.page.id,
            title: pagesCtx.page.title,
            url: pagesCtx.page.path,
            language: pagesCtx.page.language,
            site: pagesCtx.site.name
          },
          rendering: pagesCtx.rendering ?? null,
          datasource: datasource
            ? { itemId: opts.datasourceItemId!,
                templateName: "",
                fields: datasource }
            : null,
          reporter,
          browser: {
            userAgent:
              typeof navigator !== "undefined"
                ? navigator.userAgent : "",
            viewport:
              typeof window !== "undefined"
                ? `${window.innerWidth}x${window.innerHeight}`
                : "",
            timestamp: new Date().toISOString()
          }
        };
        setState({ loading: false, context: ctx, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          loading: false,
          context: null,
          error: (e as Error).message
        });
      }
    })();
    return () => { cancelled = true; };
  }, [opts.sdkToken, opts.datasourceItemId]);

  return state;
}

async function fetchMe(sdkToken: string) {
  const res = await fetch("/api/xmc/me", {
    headers: { "X-Sdk-Token": sdkToken }
  });
  if (!res.ok) return null;
  return (await res.json()) as { name: string; email: string };
}

async function fetchDatasource(
  sdkToken: string, itemId: string, language: string
) {
  const q = new URLSearchParams({ itemId, language });
  const res = await fetch(`/api/xmc/datasource?${q}`, {
    headers: { "X-Sdk-Token": sdkToken }
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    fields: Record<string, string>;
  };
  return body.fields;
}
```

- [ ] **Step 5: Run test — expect pass**

- [ ] **Step 6: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add useAutoContext hook"
```

---

### Task 19: `features/report-bug/ReportBugButton.tsx`

**Files:**

- Create: `src/features/report-bug/ReportBugButton.tsx`
- Test: `src/features/report-bug/ReportBugButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/report-bug/ReportBugButton.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportBugButton } from "./ReportBugButton";

describe("ReportBugButton", () => {
  it("is disabled when no rendering selected", () => {
    render(<ReportBugButton
      disabled={true} onClick={() => {}} />);
    expect(screen.getByRole("button", {
      name: /report bug/i
    })).toBeDisabled();
  });

  it("invokes onClick when enabled", async () => {
    const onClick = vi.fn();
    render(<ReportBugButton
      disabled={false} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `ReportBugButton.tsx`**

```tsx
"use client";
import { FC } from "react";

export type ReportBugButtonProps = {
  disabled: boolean;
  onClick: () => void;
};

export const ReportBugButton: FC<ReportBugButtonProps> = (
  { disabled, onClick }
) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-label="Report bug to JIRA"
    title={disabled
      ? "Select a component to report"
      : "Report a bug for the selected component"}
    className="flex items-center gap-2 px-3 py-2 rounded-md
               border border-gray-300 text-sm font-medium
               disabled:opacity-50 disabled:cursor-not-allowed
               hover:bg-gray-50"
  >
    <span aria-hidden="true">🐞</span>
    Report bug
  </button>
);
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add ReportBugButton component"
```

---

### Task 20: `features/report-bug/ReportBugDialog.tsx`

**Files:**

- Create: `src/features/report-bug/ReportBugDialog.tsx`
- Test: `src/features/report-bug/ReportBugDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/report-bug/ReportBugDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportBugDialog } from "./ReportBugDialog";
import type { ReportContext } from "./types";

const ctx: ReportContext = {
  page: { id: "P", title: "Home", url: "/",
          language: "en", site: "main" },
  rendering: {
    instanceId: "a", renderingId: "r",
    name: "Hero", templateName: "Banner"
  },
  datasource: {
    itemId: "a", templateName: "Banner",
    fields: { Title: "Welcome" }
  },
  reporter: { name: "Ada", email: "a@x.com" },
  browser: { userAgent: "UA", viewport: "1x1",
             timestamp: "2026-04-14T00:00:00Z" }
};

describe("ReportBugDialog", () => {
  it("disables Submit until summary is typed", async () => {
    render(<ReportBugDialog
      context={ctx}
      submit={vi.fn()}
      uploadAttachment={vi.fn()}
      onClose={vi.fn()}
    />);
    const submit = screen.getByRole("button",
      { name: /submit/i });
    expect(submit).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/summary/i), "Broken"
    );
    expect(submit).toBeEnabled();
  });

  it("calls submit with summary + description", async () => {
    const submit = vi.fn().mockResolvedValue({
      key: "CLD-1", url: "http://j/CLD-1"
    });
    render(<ReportBugDialog
      context={ctx}
      submit={submit}
      uploadAttachment={vi.fn()}
      onClose={vi.fn()}
    />);
    await userEvent.type(
      screen.getByLabelText(/summary/i), "Broken"
    );
    await userEvent.type(
      screen.getByLabelText(/description/i), "details"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /submit/i })
    );
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Broken",
        descriptionText: "details"
      })
    );
    expect(await screen.findByText(/CLD-1/)).toBeInTheDocument();
  });

  it("shows banner + Retry on submit error", async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce({
        category: "retryable",
        userMessage: "JIRA is busy"
      })
      .mockResolvedValueOnce({
        key: "CLD-2", url: "http://j/CLD-2"
      });
    render(<ReportBugDialog
      context={ctx} submit={submit}
      uploadAttachment={vi.fn()} onClose={vi.fn()}
    />);
    await userEvent.type(
      screen.getByLabelText(/summary/i), "x"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /submit/i })
    );
    expect(await screen.findByText(/JIRA is busy/))
      .toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /retry/i })
    );
    expect(await screen.findByText(/CLD-2/))
      .toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `ReportBugDialog.tsx`**

```tsx
"use client";
import { FC, useState } from "react";
import type { ReportContext } from "./types";

type SubmitFn = (input: {
  summary: string;
  descriptionText: string;
  context: ReportContext;
  attachmentCount: number;
}) => Promise<{ key: string; url: string }>;

type UploadFn = (issueKey: string, blob: Blob) =>
  Promise<{ id: string }>;

type Attachment = {
  id: string; source: "capture" | "upload";
  blob: Blob; name: string;
};

export type ReportBugDialogProps = {
  context: ReportContext;
  submit: SubmitFn;
  uploadAttachment: UploadFn;
  onClose: () => void;
  captureScreen?: () => Promise<Blob | null>;
};

export const ReportBugDialog: FC<ReportBugDialogProps> = (
  { context, submit, uploadAttachment,
    onClose, captureScreen }
) => {
  const [summary, setSummary] = useState("");
  const [desc, setDesc] = useState("");
  const [attach, setAttach] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    key: string; url: string;
  } | null>(null);

  const canSubmit = summary.trim().length > 0 && !submitting;

  async function doSubmit() {
    setSubmitting(true); setErr(null);
    try {
      const result = await submit({
        summary: summary.trim(),
        descriptionText: desc,
        context,
        attachmentCount: attach.length
      });
      for (const a of attach) {
        try { await uploadAttachment(result.key, a.blob); }
        catch {}
      }
      setCreated(result);
    } catch (e) {
      const msg =
        (e as { userMessage?: string }).userMessage
        ?? "Failed to submit";
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function onCapture() {
    if (!captureScreen) return;
    const blob = await captureScreen();
    if (!blob) return;
    setAttach((prev) => [...prev, {
      id: crypto.randomUUID(),
      source: "capture",
      blob,
      name: `capture-${Date.now()}.png`
    }]);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttach((prev) => [...prev, {
      id: crypto.randomUUID(),
      source: "upload",
      blob: file,
      name: file.name
    }]);
    e.target.value = "";
  }

  if (created) {
    return (
      <div role="dialog" aria-label="Bug reported"
           className="p-4">
        <p>Bug reported as{" "}
          <a href={created.url} target="_blank"
             rel="noreferrer" className="underline">
            {created.key}
          </a>
        </p>
        <button onClick={onClose}
          className="mt-3 px-3 py-1 border rounded">
          Close
        </button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Report bug"
         className="p-4 flex flex-col gap-3">
      {err && (
        <div role="alert"
             className="bg-red-50 border border-red-200
                        text-red-900 p-2 rounded
                        flex items-center justify-between">
          <span>{err}</span>
          <button onClick={doSubmit}
            className="underline ml-2">Retry</button>
        </div>
      )}
      <label htmlFor="summary" className="text-sm font-medium">
        Summary
        <input id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="mt-1 w-full border rounded px-2 py-1" />
      </label>
      <label htmlFor="desc" className="text-sm font-medium">
        Description
        <textarea id="desc"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={5}
          className="mt-1 w-full border rounded px-2 py-1" />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer">
          Auto-captured context
        </summary>
        <pre className="text-xs bg-gray-50 p-2 rounded
                        overflow-auto max-h-40">
{JSON.stringify(context, null, 2)}
        </pre>
      </details>
      <div className="flex gap-2">
        <button type="button" onClick={onCapture}
          className="border rounded px-2 py-1">
          Capture screen
        </button>
        <label className="border rounded px-2 py-1
                          cursor-pointer">
          Upload image
          <input type="file" className="hidden"
            accept="image/png,image/jpeg,image/webp"
            onChange={onUpload} />
        </label>
      </div>
      {attach.length > 0 && (
        <ul className="text-xs flex flex-col gap-1">
          {attach.map((a) => (
            <li key={a.id}
                className="flex justify-between
                           bg-gray-50 px-2 py-1 rounded">
              <span>{a.name} ({a.source})</span>
              <button aria-label={`Remove ${a.name}`}
                onClick={() => setAttach(
                  (prev) => prev.filter((x) => x.id !== a.id)
                )}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="px-3 py-1">Cancel</button>
        <button type="button" onClick={doSubmit}
          disabled={!canSubmit}
          className="px-3 py-1 border rounded
                     disabled:opacity-50">
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add ReportBugDialog component"
```

---

### Task 21: `features/settings/SettingsView.tsx`

**Files:**

- Create: `src/features/settings/SettingsView.tsx`
- Test: `src/features/settings/SettingsView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/settings/SettingsView.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "./SettingsView";

describe("SettingsView", () => {
  it("loads current settings on mount", async () => {
    const load = vi.fn().mockResolvedValue({
      projectKey: "CLD",
      defaultIssueType: "Bug",
      defaultLabels: ["page-builder"],
      defaultAssigneeAccountId: null
    });
    render(<SettingsView load={load} save={vi.fn()} />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/project key/i) as HTMLInputElement)
          .value
      ).toBe("CLD")
    );
  });

  it("saves updated settings", async () => {
    const save = vi.fn().mockResolvedValue({
      projectKey: "OPS",
      defaultIssueType: "Bug",
      defaultLabels: [],
      defaultAssigneeAccountId: null
    });
    render(<SettingsView
      load={vi.fn().mockResolvedValue({
        projectKey: "CLD",
        defaultIssueType: "Bug",
        defaultLabels: [],
        defaultAssigneeAccountId: null
      })}
      save={save}
    />);
    const input = await screen.findByLabelText(/project key/i);
    await userEvent.clear(input);
    await userEvent.type(input, "OPS");
    await userEvent.click(
      screen.getByRole("button", { name: /save/i })
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ projectKey: "OPS" })
    );
    expect(await screen.findByText(/saved/i))
      .toBeInTheDocument();
  });

  it("shows error banner on 403", async () => {
    const save = vi.fn().mockRejectedValue({
      userMessage: "Admin access required"
    });
    render(<SettingsView
      load={vi.fn().mockResolvedValue({
        projectKey: "CLD",
        defaultIssueType: "Bug",
        defaultLabels: [],
        defaultAssigneeAccountId: null
      })}
      save={save}
    />);
    await screen.findByLabelText(/project key/i);
    await userEvent.click(
      screen.getByRole("button", { name: /save/i })
    );
    expect(await screen.findByText(/admin access required/i))
      .toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement `SettingsView.tsx`**

```tsx
"use client";
import { FC, useEffect, useState } from "react";

export type Settings = {
  projectKey: string;
  defaultIssueType: string;
  defaultLabels: string[];
  defaultAssigneeAccountId: string | null;
};

export type SettingsViewProps = {
  load: () => Promise<Settings>;
  save: (next: Settings) => Promise<Settings>;
};

export const SettingsView: FC<SettingsViewProps> = (
  { load, save }
) => {
  const [value, setValue] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load().then(setValue).catch(
      (e) => setErr(e?.userMessage ?? "Load failed")
    );
  }, [load]);

  if (!value) {
    return <div className="p-4">Loading…</div>;
  }

  async function onSave() {
    setErr(null); setSaved(false);
    try {
      const next = await save(value!);
      setValue(next);
      setSaved(true);
    } catch (e) {
      setErr(
        (e as { userMessage?: string }).userMessage
          ?? "Save failed"
      );
    }
  }

  function updateLabels(raw: string) {
    setValue({
      ...value!,
      defaultLabels: raw.split(",")
        .map((s) => s.trim()).filter(Boolean)
    });
  }

  return (
    <div className="p-4 flex flex-col gap-3"
         aria-label="Plugin settings">
      {err && (
        <div role="alert"
             className="bg-red-50 border border-red-200 p-2">
          {err}
        </div>
      )}
      {saved && <div role="status">Saved</div>}
      <label>
        Project key
        <input className="mt-1 block w-full border px-2 py-1"
          value={value.projectKey}
          onChange={(e) => setValue({
            ...value, projectKey: e.target.value
          })} />
      </label>
      <label>
        Default issue type
        <input className="mt-1 block w-full border px-2 py-1"
          value={value.defaultIssueType}
          onChange={(e) => setValue({
            ...value, defaultIssueType: e.target.value
          })} />
      </label>
      <label>
        Default labels (comma-separated)
        <input className="mt-1 block w-full border px-2 py-1"
          value={value.defaultLabels.join(", ")}
          onChange={(e) => updateLabels(e.target.value)} />
      </label>
      <label>
        Default assignee accountId (optional)
        <input className="mt-1 block w-full border px-2 py-1"
          value={value.defaultAssigneeAccountId ?? ""}
          onChange={(e) => setValue({
            ...value,
            defaultAssigneeAccountId: e.target.value || null
          })} />
      </label>
      <button type="button" onClick={onSave}
        className="self-end px-3 py-1 border rounded">
        Save
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add SettingsView component"
```

---

### Task 22: `features/settings/SettingsGear.tsx`

**Files:**

- Create: `src/features/settings/SettingsGear.tsx`
- Test: `src/features/settings/SettingsGear.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/settings/SettingsGear.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsGear } from "./SettingsGear";

describe("SettingsGear", () => {
  it("invokes onClick", async () => {
    const onClick = vi.fn();
    render(<SettingsGear onClick={onClick} />);
    await userEvent.click(
      screen.getByRole("button", { name: /settings/i })
    );
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement `SettingsGear.tsx`**

```tsx
"use client";
import { FC } from "react";

export const SettingsGear: FC<{ onClick: () => void }> = (
  { onClick }
) => (
  <button type="button" onClick={onClick}
    aria-label="Open settings"
    className="p-2 rounded hover:bg-gray-100"
    title="Settings">
    ⚙
  </button>
);
```

- [ ] **Step 3: Run test — expect pass**

- [ ] **Step 4: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add SettingsGear component"
```

---

## Phase 5 — Extension entries

### Task 23: `/extensions/pages-panel` — primary entry

**Files:**

- Create: `src/app/extensions/pages-panel/page.tsx`
- Create: `src/app/extensions/pages-panel/PagesPanel.tsx`
- Test: `src/app/extensions/pages-panel/PagesPanel.test.tsx`

- [ ] **Step 1: Write the failing test** (for the
shell component, which ties everything together)

```tsx
// src/app/extensions/pages-panel/PagesPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PagesPanel } from "./PagesPanel";

vi.mock("@/services/sitecore/context", () => ({
  initSitecoreContext: vi.fn(),
  getPagesContext: vi.fn().mockResolvedValue({
    page: { id: "P", path: "/en", title: "Home",
            language: "en" },
    site: { name: "main" },
    rendering: {
      instanceId: "abc", renderingId: "r",
      name: "Hero", templateName: "Banner"
    }
  }),
  subscribeToLayoutChanges: vi.fn((cb) => {
    cb({ type: "page-layout",
         renderingInstanceId: "abc" });
    return () => {};
  })
}));

describe("PagesPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(
      (url: string) => {
        if (url.includes("/api/xmc/me")) {
          return Promise.resolve(new Response(
            JSON.stringify({ name: "A", email: "a@x" }),
            { status: 200 }
          ));
        }
        if (url.includes("/api/xmc/datasource")) {
          return Promise.resolve(new Response(
            JSON.stringify({ fields: { T: "v" } }),
            { status: 200 }
          ));
        }
        if (url.includes("/api/jira/issue")) {
          return Promise.resolve(new Response(
            JSON.stringify({
              key: "CLD-9", url: "http://j/CLD-9"
            }),
            { status: 201 }
          ));
        }
        return Promise.reject(new Error("unexpected"));
      }
    ));
  });

  it("enables the report button once rendering selected",
     async () => {
    render(<PagesPanel sdkTokenForTests="stub-valid" />);
    await waitFor(() =>
      expect(screen.getByRole("button",
        { name: /report bug/i })).toBeEnabled()
    );
  });

  it("opens dialog on click and submits successfully",
     async () => {
    render(<PagesPanel sdkTokenForTests="stub-valid" />);
    await waitFor(() =>
      expect(screen.getByRole("button",
        { name: /report bug/i })).toBeEnabled()
    );
    await userEvent.click(
      screen.getByRole("button", { name: /report bug/i })
    );
    await userEvent.type(
      screen.getByLabelText(/summary/i), "broken"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /submit/i })
    );
    expect(await screen.findByText(/CLD-9/))
      .toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `PagesPanel.tsx`**

```tsx
"use client";
import { FC, useEffect, useState } from "react";
import {
  initSitecoreContext, getPagesContext,
  subscribeToLayoutChanges
} from "@/services/sitecore/context";
import { ReportBugButton } from
  "@/features/report-bug/ReportBugButton";
import { ReportBugDialog } from
  "@/features/report-bug/ReportBugDialog";
import { SettingsGear } from
  "@/features/settings/SettingsGear";
import { SettingsView, type Settings } from
  "@/features/settings/SettingsView";
import { useAutoContext } from
  "@/features/report-bug/useAutoContext";
import { JiraClient } from "@/services/jira/client";
import { captureVisibleTab } from
  "@/services/screenshot/capture";

export type PagesPanelProps = {
  sdkTokenForTests?: string;
};

export const PagesPanel: FC<PagesPanelProps> = (
  { sdkTokenForTests }
) => {
  const [sdkReady, setSdkReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [dsId, setDsId] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sdkToken, setSdkToken] = useState(
    sdkTokenForTests ?? ""
  );

  useEffect(() => {
    if (sdkTokenForTests) {
      const stub = {
        query: async () => ({
          data: await getPagesContext()
        }),
        subscribe: (_: string, cb: (e: unknown) => void) => {
          const off = subscribeToLayoutChanges(
            (e) => cb(e)
          );
          return off;
        }
      };
      initSitecoreContext(stub as never);
      setSdkReady(true);
      return;
    }
    (async () => {
      const mod = await import(
        "@sitecore-marketplace-sdk/client"
      );
      const sdk = await mod.createClient();
      initSitecoreContext(sdk as unknown as never);
      setSdkToken(await sdk.getSessionToken());
      setSdkReady(true);
    })();
  }, [sdkTokenForTests]);

  useEffect(() => {
    if (!sdkReady) return;
    const off = subscribeToLayoutChanges(async (evt) => {
      const ctx = await getPagesContext();
      setHasSelection(Boolean(ctx.rendering));
      setDsId(evt.renderingInstanceId);
    });
    return () => off();
  }, [sdkReady]);

  const autoCtx = useAutoContext({
    sdkToken,
    datasourceItemId: dsId
  });
  const jira = new JiraClient({ sdkToken });

  async function loadSettings(): Promise<Settings> {
    const res = await fetch("/api/settings", {
      headers: { "X-Sdk-Token": sdkToken }
    });
    if (!res.ok) throw await toErr(res);
    return (await res.json()) as Settings;
  }

  async function saveSettings(next: Settings) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Sdk-Token": sdkToken
      },
      body: JSON.stringify(next)
    });
    if (!res.ok) throw await toErr(res);
    return (await res.json()) as Settings;
  }

  async function toErr(res: Response) {
    try {
      const body = await res.json();
      return body.error ?? {};
    } catch { return {}; }
  }

  if (!sdkReady) {
    return <div className="p-4">Initialising…</div>;
  }

  return (
    <div className="flex flex-col gap-2 p-3"
         aria-label="JIRA reporter panel">
      <div className="flex items-center justify-between">
        <ReportBugButton
          disabled={!hasSelection}
          onClick={() => setOpen(true)} />
        <SettingsGear
          onClick={() => setSettingsOpen((x) => !x)} />
      </div>
      {settingsOpen && (
        <SettingsView
          load={loadSettings}
          save={saveSettings} />
      )}
      {open && autoCtx.context && (
        <ReportBugDialog
          context={autoCtx.context}
          submit={(p) => jira.createIssue(p)}
          uploadAttachment={(k, b) =>
            jira.uploadAttachment(k, b)}
          onClose={() => setOpen(false)}
          captureScreen={async () => {
            const r = await captureVisibleTab();
            return r.ok ? r.blob : null;
          }} />
      )}
    </div>
  );
};
```

- [ ] **Step 3: Create thin route shell
`src/app/extensions/pages-panel/page.tsx`**

```tsx
import { PagesPanel } from "./PagesPanel";
export default function Page() { return <PagesPanel />; }
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run src/app/extensions/pages-panel
```

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add Pages Context Panel extension entry"
```

---

### Task 24: `/extensions/full-screen` — portability harness

**Files:**

- Create: `src/app/extensions/full-screen/page.tsx`

- [ ] **Step 1: Implement the empty portability harness**

```tsx
// src/app/extensions/full-screen/page.tsx
import { PagesPanel } from "../pages-panel/PagesPanel";
export default function FullScreen() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-lg font-semibold mb-4">
        JIRA Reporter (Full Screen)
      </h1>
      <PagesPanel />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck + build**

```bash
npm run typecheck && npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -am \
  "feat(jira-reporter): add Full Screen extension harness"
```

---

## Phase 6 — Playwright E2E

### Task 25: Playwright bootstrap + dev-host harness

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/dev-host.html`
- Create: `tests/e2e/msw.init.ts`
- Create: `tests/e2e/fixtures/mock.png`

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3002",
    permissions: ["display-capture"],
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev",
    port: 3002,
    reuseExistingServer: !process.env.CI
  }
});
```

- [ ] **Step 2: Create `tests/e2e/dev-host.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dev host</title></head>
<body>
  <h1>Dev host shell</h1>
  <iframe id="plugin"
    src="http://localhost:3002/extensions/pages-panel"
    style="width: 420px; height: 600px; border: 1px solid #ccc;">
  </iframe>
  <script>
    window.addEventListener("message", (e) => {
      console.log("host received", e.data);
    });
    setTimeout(() => {
      const frame = document.getElementById("plugin");
      frame.contentWindow.postMessage({
        topic: "pages.layout",
        payload: {
          type: "page-layout",
          renderingInstanceId: "abc"
        }
      }, "*");
    }, 500);
  </script>
</body>
</html>
```

- [ ] **Step 3: Create `tests/e2e/msw.init.ts`** (reference
for scenarios; each test imports)

```ts
import { http, HttpResponse } from "msw";

export const handlers = {
  jiraIssueOk: http.post(
    "*://*/rest/api/3/issue",
    () => HttpResponse.json({
      key: "MOCK-1", id: "1",
      self: "http://jira/mock/MOCK-1"
    }, { status: 201 })
  ),
  jiraIssue429: http.post(
    "*://*/rest/api/3/issue",
    () => new HttpResponse(null, {
      status: 429, headers: { "Retry-After": "3" }
    })
  )
};
```

- [ ] **Step 4: Create a 1×1 PNG fixture**

```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\x0d\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' \
  > tests/e2e/fixtures/mock.png
```

- [ ] **Step 5: Commit**

```bash
git commit -am \
  "test(jira-reporter): add Playwright bootstrap + dev-host harness"
```

---

### Task 26: Happy path E2E

**Files:**

- Create: `tests/e2e/happy-path.spec.ts`

- [ ] **Step 1: Write the E2E**

```ts
import { test, expect } from "@playwright/test";
import { handlers } from "./msw.init";

test("happy path — submit with capture", async ({ page }) => {
  await page.route(
    "**/rest/api/3/issue", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ key: "MOCK-1", id: "1" })
      });
    }
  );
  await page.route(
    "**/rest/api/3/issue/*/attachments",
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "att-1" }])
    })
  );

  await page.goto("/extensions/pages-panel");
  await page.evaluate(() => {
    window.postMessage({
      topic: "pages.layout",
      payload: {
        type: "page-layout",
        renderingInstanceId: "abc"
      }
    }, "*");
  });

  await expect(page.getByRole("button",
    { name: /report bug/i })).toBeEnabled();
  await page.getByRole("button",
    { name: /report bug/i }).click();
  await page.getByLabel("Summary").fill("Hero alignment off");
  await page.getByLabel("Description")
    .fill("Hero banner shifts 2px right on Safari");
  await page.getByRole("button",
    { name: /submit/i }).click();
  await expect(page.getByText("MOCK-1")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

```bash
npx playwright test tests/e2e/happy-path.spec.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git commit -am \
  "test(jira-reporter): add happy-path E2E"
```

---

### Task 27: Screenshot declined + upload fallback E2E

**Files:**

- Create: `tests/e2e/screenshot-fallback.spec.ts`

- [ ] **Step 1: Write the E2E**

```ts
import { test, expect } from "@playwright/test";
import path from "node:path";

test("upload fallback when capture declined", async (
  { page, context }
) => {
  await context.clearPermissions();
  await page.route("**/rest/api/3/issue",
    (r) => r.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ key: "MOCK-2", id: "2" })
    }));
  await page.route("**/rest/api/3/issue/*/attachments",
    (r) => r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "att-9" }])
    }));

  await page.goto("/extensions/pages-panel");
  await page.evaluate(() => {
    window.postMessage({
      topic: "pages.layout",
      payload: {
        type: "page-layout",
        renderingInstanceId: "abc"
      }
    }, "*");
  });
  await page.getByRole("button",
    { name: /report bug/i }).click();
  await page.getByRole("button",
    { name: /capture screen/i }).click();
  await page.setInputFiles(
    'input[type="file"]',
    path.resolve(__dirname, "fixtures/mock.png")
  );
  await page.getByLabel("Summary").fill("Alt text missing");
  await page.getByRole("button",
    { name: /submit/i }).click();
  await expect(page.getByText("MOCK-2")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E** (expect pass)

- [ ] **Step 3: Commit**

```bash
git commit -am \
  "test(jira-reporter): add screenshot fallback E2E"
```

---

### Task 28: Rate-limit E2E

**Files:**

- Create: `tests/e2e/rate-limit.spec.ts`

- [ ] **Step 1: Write the E2E**

```ts
import { test, expect } from "@playwright/test";

test("rate-limit banner + retry", async ({ page }) => {
  let calls = 0;
  await page.route("**/rest/api/3/issue", (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({
        status: 429,
        headers: { "Retry-After": "3" },
        body: ""
      });
    }
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ key: "MOCK-3", id: "3" })
    });
  });

  await page.goto("/extensions/pages-panel");
  await page.evaluate(() => {
    window.postMessage({
      topic: "pages.layout",
      payload: {
        type: "page-layout",
        renderingInstanceId: "abc"
      }
    }, "*");
  });
  await page.getByRole("button",
    { name: /report bug/i }).click();
  await page.getByLabel("Summary").fill("Button colour wrong");
  await page.getByRole("button",
    { name: /submit/i }).click();
  await expect(page.getByText(/try again in/i))
    .toBeVisible();
  await page.getByRole("button",
    { name: /retry/i }).click();
  await expect(page.getByText("MOCK-3")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E** (expect pass)

- [ ] **Step 3: Commit**

```bash
git commit -am \
  "test(jira-reporter): add rate-limit E2E"
```

---

## Phase 7 — Docs, ops, registration

### Task 29: README + env + deploy instructions

**Files:**

- Update: `src/apps/jira-reporter-plugin/README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git commit -am \
  "docs(jira-reporter): add README"
```

---

### Task 30: Manual smoke checklist + release checklist

**Files:**

- Create:
  `src/apps/jira-reporter-plugin/docs/smoke-checklist.md`
- Create:
  `src/apps/jira-reporter-plugin/docs/release-checklist.md`

- [ ] **Step 1: Write `smoke-checklist.md`**

```markdown
# Manual smoke checklist

Run once per release in a dev Sitecore tenant (~10 min).

1. [ ] Plugin installs via Developer Studio; appears in the
   Pages Context Panel.
2. [ ] Report button disabled until a rendering is selected;
   enables on selection.
3. [ ] Submit creates an issue in the target JIRA project
   with every ADF section populated (Description, Reporter,
   Page, Rendering, Datasource fields, Browser).
4. [ ] Settings gear is visible; non-admin email sees 403 on
   save; admin email saves successfully.
5. [ ] `GET /api/health` returns `{ ok: true,
   jiraConfigured: true, settingsLoaded: true }`.
```

- [ ] **Step 2: Write `release-checklist.md`**

```markdown
# Release checklist

- [ ] `npm run typecheck && npm test && npm run e2e`
- [ ] Coverage ≥ 80%
- [ ] Changelog updated
- [ ] Env vars set in Vercel production project
- [ ] Smoke checklist passed
- [ ] Sitecore Marketplace SDK version pinned in
  `package.json` (re-verify changelog since last release)
- [ ] Plugin URL registered in Cloud Portal
```

- [ ] **Step 3: Commit**

```bash
git commit -am \
  "docs(jira-reporter): add smoke + release checklists"
```

---

### Task 31: Marketplace registration notes

**Files:**

- Create:
  `src/apps/jira-reporter-plugin/docs/marketplace-registration.md`

- [ ] **Step 1: Write `marketplace-registration.md`**

```markdown
# Sitecore Marketplace registration

## Extension points exposed

| Type | Route |
|---|---|
| Pages Context Panel | `/extensions/pages-panel` |
| Full Screen | `/extensions/full-screen` |

## Steps

1. Deploy to Vercel production. Note the URL (e.g.
   `https://sitecore-jira-reporter-plugin.vercel.app`).
2. In Cloud Portal → Developer Studio → Register custom app:
   - App name: `JIRA Reporter`
   - Short description: "Report Page Builder bugs to JIRA."
   - Icon: upload `public/icon-256.png`
3. For each extension point, add a route:
   - Pages Context Panel →
     `https://sitecore-jira-reporter-plugin.vercel.app/extensions/pages-panel`
   - Full Screen →
     `https://sitecore-jira-reporter-plugin.vercel.app/extensions/full-screen`
4. Permissions (SDK v0.3):
   - `xmc.authoring.read` (datasource fields + user)
   - `pages.context.read`
   - `pages.layout.read`
   - `clipboard.write` (for "Copy issue link")
5. Save and install into your tenant.

## Validation

Run the manual smoke checklist after registration.
```

- [ ] **Step 2: Commit**

```bash
git commit -am \
  "docs(jira-reporter): add Marketplace registration notes"
```

---

## Phase 8 — CI integration

### Task 32: Wire plugin CI into Azure DevOps

**Files:**

- Modify: `.azdo/build-templates/tasks-build.yml`
  (add a job step that runs the plugin's build + tests)

- [ ] **Step 1: Read the existing tasks-build template to
      understand the pattern for adding a job**

```bash
cat .azdo/build-templates/tasks-build.yml
```

- [ ] **Step 2: Append a job for the plugin app**

Add to `.azdo/build-templates/tasks-build.yml` (placement
must preserve existing indentation and stage ordering —
consult the file before writing):

```yaml
- script: |
    cd src/apps/jira-reporter-plugin
    npm ci
    npm run typecheck
    npm run test:coverage
    npm run build
  displayName: 'jira-reporter-plugin: build + test'
```

- [ ] **Step 3: Commit**

```bash
git commit -am \
  "ci(jira-reporter): add plugin build + test to pipeline"
```

---

## Self-review (done by the plan author before handoff)

Spec coverage check — every §2.1 goal maps to one or more
tasks:

- **One-click dialog with auto-context** → Tasks 18–20, 23
- **JIRA service-account auth, server-only** → Tasks 1, 16, 17
- **Screen Capture API + manual upload** → Tasks 7, 8, 20
- **Admin settings surface** → Tasks 6, 13, 21, 22
- **Structured ADF description** → Task 2
- **Marketplace-installable** → Tasks 23, 31

Placeholder scan: no `TBD`/`TODO`/"similar to" references.
The SDK-JWT-verifier follow-up is noted explicitly in Task 5
with a contract (pluggable `__SDK_VALIDATOR__`) so downstream
work does not block this plan.

Type consistency check: `ReportContext` shape in Task 18
matches what Task 20 destructures and what Task 16's server
schema validates; `Settings` in Task 6 is re-exported by
Task 21; `PluginError` in Task 3 is the shape thrown by
Task 9 and expected by Task 20.

Sequencing: Phase 1 (libs) has no inter-task deps and can
be dispatched in parallel. Phase 2 depends on Phase 1.
Phase 3 depends on Phases 1+2. Phase 4 depends on Phase 2.
Phase 5 depends on Phase 4. Phase 6 depends on Phase 5 and
a running dev server. Phases 7–8 are terminal.

---

**Plan complete.** Saved to
`JIRA/CLD-XXX-JIRA-Module-Reporter/doc/2026-04-14-jira-reporter-plan.md`.
