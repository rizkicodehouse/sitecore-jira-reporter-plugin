import { createCipheriv, createDecipheriv, randomBytes }
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
  __jpDekMem?: Map<string, Buffer>;
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
// Random 32 bytes per tenant. Wrapped by the KEK.
// Stored in Redis when Upstash is configured, else in a
// process-local Map (dev).

type WrappedDek = { iv: string; tag: string; ct: string };

const dekMem =
  G.__jpDekMem ??
  (G.__jpDekMem = new Map<string, Buffer>());
const dekCache =
  G.__jpDekCache ??
  (G.__jpDekCache = new Map<string, Buffer>());

function dekRedisKey(tenantId: string): string {
  return `plugin:dek:${tenantId}`;
}

async function wrapDek(
  kek: Buffer, dek: Buffer
): Promise<WrappedDek> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, kek, iv);
  const ct = Buffer.concat([
    cipher.update(dek), cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64")
  };
}

async function unwrapDek(
  kek: Buffer, wrapped: WrappedDek
): Promise<Buffer> {
  const iv = Buffer.from(wrapped.iv, "base64");
  const tag = Buffer.from(wrapped.tag, "base64");
  const ct = Buffer.from(wrapped.ct, "base64");
  const decipher = createDecipheriv(ALGO, kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ct), decipher.final()
  ]);
}

async function readWrappedDekFromStore(
  tenantId: string
): Promise<WrappedDek | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    const raw = await r.get<WrappedDek>(
      dekRedisKey(tenantId)
    );
    if (!raw || !raw.iv || !raw.tag || !raw.ct) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

async function writeWrappedDekToStore(
  tenantId: string, wrapped: WrappedDek
): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    await r.set(dekRedisKey(tenantId), wrapped);
  } catch {
    /* best effort */
  }
}

async function getOrCreateDek(
  tenantId: string
): Promise<Buffer> {
  assertTenantId(tenantId);
  const cached = dekCache.get(tenantId);
  if (cached) return cached;

  const kek = await resolveKek();
  const wrapped = await readWrappedDekFromStore(tenantId);
  if (wrapped) {
    const dek = await unwrapDek(kek, wrapped);
    dekCache.set(tenantId, dek);
    return dek;
  }

  // Redis-less dev path: in-memory Map by tenantId
  const memDek = dekMem.get(tenantId);
  if (memDek) {
    dekCache.set(tenantId, memDek);
    return memDek;
  }

  const fresh = randomBytes(KEY_BYTES);
  const freshWrapped = await wrapDek(kek, fresh);
  await writeWrappedDekToStore(tenantId, freshWrapped);
  dekMem.set(tenantId, fresh);
  dekCache.set(tenantId, fresh);
  return fresh;
}

// ─── Public API ───────────────────────────────────────

export async function encryptSecret(
  plaintext: string, tenantId: string
): Promise<string> {
  if (!plaintext) return "";
  const dek = await getOrCreateDek(tenantId);
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
  const dek = await getOrCreateDek(tenantId);
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

// Crypto-shred: deletes the tenant's DEK so their
// ciphertext becomes cryptographically unreadable. Use
// on uninstall / tenant-offboarding.
export async function destroyTenantKey(
  tenantId: string
): Promise<void> {
  assertTenantId(tenantId);
  dekCache.delete(tenantId);
  dekMem.delete(tenantId);
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    await r.del(dekRedisKey(tenantId));
  } catch {
    /* best effort */
  }
}

export function resetCryptoForTests(): void {
  G.__jpCachedKek = null;
  G.__jpWarnedEphemeral = false;
  dekMem.clear();
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
