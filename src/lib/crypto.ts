import { createCipheriv, createDecipheriv, hkdfSync, randomBytes }
  from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

// ─── KEK (key-encryption-key) ─────────────────────────
// Vendor-held. Lives in SETTINGS_ENCRYPTION_KEY env.
// In dev, auto-generates an ephemeral key.
//
// All state hoisted onto globalThis so Next.js HMR
// does not reset the key/DEKs on every file save.

type CryptoGlobals = {
  __jpCachedKek?: Buffer | null;
  __jpWarnedEphemeral?: boolean;
  __jpDekCache?: Map<string, Buffer>;
};
const G = globalThis as unknown as CryptoGlobals;

function parseEnvKek(): Buffer | null {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must decode to exactly " +
      KEY_BYTES + " bytes. Got " + key.length + " bytes."
    );
  }
  return key;
}

async function resolveKek(): Promise<Buffer> {
  if (G.__jpCachedKek) return G.__jpCachedKek;
  const env = parseEnvKek();
  if (env) {
    G.__jpCachedKek = env;
    return env;
  }
  if (!G.__jpWarnedEphemeral) {
    G.__jpWarnedEphemeral = true;
    console.warn(
      "[crypto] No SETTINGS_ENCRYPTION_KEY set. " +
      "Generating an ephemeral KEK for this process. " +
      "All encrypted tenant data will be unreadable " +
      "after a restart. Set SETTINGS_ENCRYPTION_KEY " +
      "(32 bytes, base64) in your env for persistence."
    );
  }
  G.__jpCachedKek = randomBytes(KEY_BYTES);
  return G.__jpCachedKek;
}

// ─── DEK (data-encryption-key) per tenant ─────────────
// Derived deterministically from the KEK via HKDF-SHA-256
// with tenantId as the salt. No persistence — every cold
// start recomputes from env.

const dekCache =
  G.__jpDekCache ??
  (G.__jpDekCache = new Map<string, Buffer>());

const HKDF_INFO = Buffer.from(
  "sitecore-jira-reporter:dek:v1",
  "utf8"
);

export async function deriveTenantDek(
  tenantId: string
): Promise<Buffer> {
  assertTenantId(tenantId);
  const cached = dekCache.get(tenantId);
  if (cached) return cached;
  const kek = await resolveKek();
  const salt = Buffer.from(tenantId, "utf8");
  const derived = Buffer.from(
    hkdfSync("sha256", kek, salt, HKDF_INFO, KEY_BYTES)
  );
  dekCache.set(tenantId, derived);
  return derived;
}

// ─── Public API ───────────────────────────────────────

export async function encryptSecret(
  plaintext: string, tenantId: string
): Promise<string> {
  if (!plaintext) return "";
  const dek = await deriveTenantDek(tenantId);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, dek, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"), cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export async function decryptSecret(
  packed: string, tenantId: string
): Promise<string> {
  if (!packed) return "";
  const buf = Buffer.from(packed, "base64");
  if (buf.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new Error("encrypted blob is too short");
  }
  const dek = await deriveTenantDek(tenantId);
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(
    IV_BYTES, IV_BYTES + AUTH_TAG_BYTES
  );
  const ct = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ct), decipher.final()
  ]).toString("utf8");
}

// Crypto-shred: clears the in-process cache for the tenant.
// With HKDF derivation there is no stored DEK to delete.
// True crypto-shred is performed by rotating
// SETTINGS_ENCRYPTION_KEY (see §5.1 rotation runbook).
export async function destroyTenantKey(
  tenantId: string
): Promise<void> {
  assertTenantId(tenantId);
  dekCache.delete(tenantId);
}

export function resetCryptoForTests(): void {
  G.__jpCachedKek = null;
  G.__jpWarnedEphemeral = false;
  dekCache.clear();
}

function assertTenantId(tenantId: string): void {
  if (!tenantId ||
      !/^[A-Za-z0-9_\-:.]+$/.test(tenantId)) {
    throw new Error(
      "invalid tenantId for crypto — must be non-empty, " +
      "alphanumeric plus _-:."
    );
  }
}
