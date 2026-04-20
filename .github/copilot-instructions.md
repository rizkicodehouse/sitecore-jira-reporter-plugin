# Copilot instructions for sitecore-jira-reporter-plugin

Purpose: provide Copilot sessions actionable repo-level info (build/test/lint commands, architecture summary, and repo-specific conventions).

1) Build / test / lint (concrete commands)

- Install: npm install
- Dev server: npm run dev  (Next.js, port 3002)
- Build: npm run build
- Start (prod): npm start
- Lint: npm run lint
  - Lint a single file: npm run lint -- --file src/path/to/file.tsx
- Unit tests (Vitest): npm test  -> runs `vitest run`
  - Run a single test file: npx vitest run tests/path/to/file.spec.ts
  - Run a single test by name: npx vitest -t "partial test name"
  - Watch mode: npm run test:watch
  - Coverage gate: npm run test:coverage (thresholds enforced at 80%)
- E2E (Playwright): npm run e2e  (playwright test)
  - Run a single E2E file: npx playwright test tests/e2e/happy-path.spec.ts
  - Run a single E2E test by title: npx playwright test -g "test title"
- Typecheck: npm run typecheck  (tsc --noEmit)

2) High-level architecture (big picture)

- Next.js app (app router) implemented in src/ using TypeScript and strict compiler options.
- Embeddable plugin for Sitecore XM Cloud Pages Portal: UI components under src/ (app, components, features); plugin exposes UI and API endpoints consumed when embedded in the Sitecore host.
- Auth: Auth0 integration (@auth0/nextjs-auth0). Third-party Sitecore SDKs used via @sitecore-marketplace-sdk packages.
- Server/API surface: Next API routes handle Jira calls and optional KV-backed persistence. KV is optional; falls back to in-memory when not configured.
- Security config: next.config.mjs enforces CORS and CSP (frame-ancestors) using ALLOWED_PLUGIN_ORIGIN — production requires this env var.
- Tests: Vitest for unit/jsdom tests (setup in src/test/setup.ts), Playwright for E2E under tests/e2e. Playwright launches the dev server (npm run dev) on port 3002 when running tests.

3) Key repo conventions

- Path alias: `@/*` -> `src/*` (tsconfig + vitest aliases). Use `@/` for imports within the project.
- Tests:
  - Unit tests live alongside source under src/ and are excluded from coverage `include`/`exclude` per vitest.config.ts.
  - E2E tests live under tests/e2e and include a `dev-host.html` used to simulate a Sitecore host for local debugging.
- Coverage: enforced 80% (lines/functions/branches/statements). Adjust only with explicit PR-level rationale.
- Dev server port: 3002 is canonical for local development and tests; Playwright/webServer expects this default.
- Environment files: copy `.env.example` -> `.env.local` for local work. Required envs: JIRA_BASE_URL, JIRA_SERVICE_EMAIL, JIRA_API_TOKEN, XMC_TENANT_URL, ALLOWED_PLUGIN_ORIGIN, PLUGIN_ADMIN_EMAILS. KV optional vars: KV_REST_API_URL, KV_REST_API_TOKEN.
- Node engine: project targets Node >=22.14.0 (package.json engines).
- CSP/CORS nuance: next.config.mjs expects ALLOWED_PLUGIN_ORIGIN as a space-separated list; the first entry is used for CORS (Access-Control-Allow-Origin) while frame-ancestors uses the full list.

4) Useful file pointers (for Copilot code actions)

- Entry: src/app (app router pages & layouts)
- API and server logic: src/services and src/lib
- Test setup & utilities: src/test/setup.ts, tests/e2e/*
- E2E host shim: tests/e2e/dev-host.html
- Configuration: vitest.config.ts, playwright.config.ts, next.config.mjs, tsconfig.json

5) When modifying tests or CI

- Keep coverage thresholds in place unless an explicit change is coordinated.
- Playwright expects `npm run dev` on port 3002; if changing ports or webServer behavior, update playwright.config.ts accordingly.

---

If this file already exists in the repo, prefer updating the sections above rather than replacing them wholesale.
