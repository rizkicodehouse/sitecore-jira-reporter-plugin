# Sitecore Datastore Migration Runbook

**Scope:** Moving the plugin's settings and bug-report persistence
from Upstash Redis to Sitecore items, accessed via the XM Cloud
Authoring GraphQL API.

**Design reference:** `docs/design/2026-04-16-sitecore-datastore-migration.md`

**Implementation plan:** `docs/superpowers/plans/2026-04-16-sitecore-datastore-migration.md`

**Feature flag:** `SITECORE_DATASTORE=true`

---

## Phase 0 — Prerequisites

- `SETTINGS_ENCRYPTION_KEY` is set in Vercel (32 base64-encoded
  bytes). Without it, every cold start derives a fresh KEK and
  existing ciphertext becomes unreadable.
- Pages Panel and Fullscreen iframes are loading the plugin
  inside Sitecore. The Marketplace SDK's `application.context`
  query must resolve — verify in devtools by calling
  `window.__scPluginDebug`.
- **No `SITECORE_AUTHORING_BASE_URL` needed.** As of the XMC
  client-side migration (2026-04-17), all XMC Authoring calls
  go through the Marketplace SDK's `xmc.authoring.graphql`
  mutation from the browser — the server no longer talks to
  Sitecore Authoring directly. The env var used to configure
  the server-side client and is now dead; remove it from
  Vercel if still set.

No Sitecore-side authoring is required. The plugin creates its
own Feature templates (`BugReporterJiraSettings`, `BugReport`)
and site-level folders (`Settings/Bug Reporter for Jira`,
`Data/Bug Reports`) on first settings-panel open — see
`src/lib/sitecore-provision.ts` and
`src/services/sitecore/template-provision.ts`.

## Phase 1 — Settings dual-read (staging)

1. Set `SITECORE_DATASTORE=true` in a **staging** Vercel
   environment only.
2. Open the plugin in Pages Panel on a staging site. The
   settings gear should render the **"Initial installation"**
   card because the Config item doesn't exist yet.
3. Click **Install on this site**. Verify in Sitecore Content
   Editor:
   - `/sitecore/templates/Feature/BugReporterJira/BugReporterJiraSettings`
     and `/BugReport` exist.
   - `/sitecore/content/{tenant}/{site}/Settings/Bug Reporter for Jira/Config`
     exists and is based on the settings template.
   - `/sitecore/content/{tenant}/{site}/Data/Bug Reports` exists
     with the `IsBucket` flag set.
4. Configure settings through the form (Jira URL, service
   email, API token, project key). Confirm the `API Token
   (Encrypted)` field on the Config item holds ciphertext, not
   cleartext.
5. Soak for 5–7 days: monitor for server errors tagged
   `settings-sitecore-repo` or `sitecore-context-missing`.

## Phase 2 — Reports dual-write (staging)

1. Create a Jira ticket through the plugin on a staging site.
2. Verify a new item appears under
   `/sitecore/content/{tenant}/{site}/Data/Bug Reports/yyyy/MM/dd/SJP-N`.
3. Open the Fullscreen view and confirm the new ticket renders
   at the top of the table.
4. Soak for 5–7 days, monitor error budget.

## Phase 3 — Production cutover

1. Confirm both Phase 1 and Phase 2 have been soaked for a
   cumulative two weeks with no Sitecore-side regressions.
2. Back up the Redis keyspace:

   ```bash
   redis-cli --scan --pattern 'plugin:*' > redis-backup.keys
   ```

3. Flip `SITECORE_DATASTORE=true` in **Production**.
4. Smoke:
   - Settings gear renders the form (not the install card) on
     a production site that had Redis-backed settings.
   - **Expected gap:** historical bug reports are in Redis; the
     Fullscreen table starts at zero until either (a) new
     tickets are created, or (b) the Phase-3 backfill script
     runs.

### Phase 3 backfill (optional)

Export `plugin:reports:*` from Upstash, transform each record
into a `createItem` mutation payload, and POST to the XMC
Authoring endpoint. A one-shot script lives in
`scripts/migrate-redis-reports-to-sitecore.ts` (TODO once
prod cutover window is confirmed — not on the critical path
for Phase 3).

## Phase 4 — Redis removal (code)

Performed by Track E2 (see implementation plan §Track E).
Removes `@upstash/redis` from `package.json`, deletes
`storage-guard.ts`, strips the `"upstash"` driver branches
from `settings-store.ts` and `reports-store.ts`, and drops
`UPSTASH_*` from `.env.example`.

**Gate:** this is only run after Phase 3 has been stable in
production for **two weeks**.

---

## Rotation runbook — `SETTINGS_ENCRYPTION_KEY`

The ciphertext envelope on every `BugReporterJiraSettings`
item carries a `v1` version byte. Rotating the root key
requires re-encrypting every settings item.

### Pre-flight

- Generate the new key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- Verify the new key decodes to exactly 32 bytes.

### Procedure

1. Put the plugin into **read-only mode**: set a feature flag
   (e.g. `SETTINGS_READ_ONLY=true`) so the PUT handler returns
   503 while the rotation runs. (Plugin does not ship this
   flag yet — add as a small Vercel env gate if needed.)
2. Run the rotation script:

   ```bash
   npx tsx scripts/rotate-settings-encryption-key.ts \
     --old=$OLD_KEY --new=$NEW_KEY
   ```

   The script:
   - Uses `searchItems` to enumerate every settings item
     across all tenants/sites.
   - For each item: read the `API Token (Encrypted)` field,
     decrypt with the old-key-derived DEK, re-encrypt with
     the new-key-derived DEK, write back.
3. Flip `SETTINGS_ENCRYPTION_KEY` in Vercel to the new key.
4. Clear the `SETTINGS_READ_ONLY` flag. Verify one editor can
   read + save settings end-to-end.

### Crypto-shred

Because DEKs are HKDF-derived, rotating `SETTINGS_ENCRYPTION_KEY`
**without** running the rotation script renders every existing
ciphertext unreadable — which is exactly the crypto-shred
property the security review wants for tenant-offboarding /
breach response. Document this in incident response playbooks.

---

## Rollback

- **Phase 1 / Phase 2 (staging):** flip `SITECORE_DATASTORE`
  back to `false`; the plugin reverts to the Redis path
  automatically.
- **Phase 3 (production):** same flag flip. Historic bug
  reports are still in Redis, and any tickets created *after*
  cutover will only exist in Sitecore — document this gap
  before rollback.
- **Phase 4 (Redis removal merged):** rollback requires
  reverting the code change. Re-adding `@upstash/redis` and
  `storage-guard.ts` is one revert commit; cutover-era
  Sitecore data is preserved but future-state Redis data is
  empty. Coordinate with ops before rolling back Phase 4.
