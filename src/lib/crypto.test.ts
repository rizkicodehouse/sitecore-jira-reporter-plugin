import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptSecret, decryptSecret,
  deriveTenantDek, resetCryptoForTests
} from "./crypto";

describe("crypto — envelope encryption", () => {
  const originalEnv = process.env.SETTINGS_ENCRYPTION_KEY;

  beforeEach(() => {
    resetCryptoForTests();
    process.env.SETTINGS_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
    vi.spyOn(console, "warn")
      .mockImplementation(() => { /* silence */ });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.SETTINGS_ENCRYPTION_KEY = originalEnv;
    }
    resetCryptoForTests();
    vi.restoreAllMocks();
  });

  it("round-trips a secret for one tenant", async () => {
    const ct = await encryptSecret("HELLO", "t-1");
    expect(ct).not.toBe("HELLO");
    expect(await decryptSecret(ct, "t-1")).toBe("HELLO");
  });

  it("cross-tenant isolation: A's ciphertext " +
     "cannot be decrypted as B", async () => {
    const ctA = await encryptSecret("A-SECRET", "t-a");
    await expect(
      decryptSecret(ctA, "t-b")
    ).rejects.toThrow();
  });

  it("auto-ephemeral KEK without env key", async () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    resetCryptoForTests();
    const ct = await encryptSecret("SECRET", "t-x");
    expect(await decryptSecret(ct, "t-x")).toBe("SECRET");
  });

  it("rejects tampered ciphertext", async () => {
    const ct = await encryptSecret("SECRET", "t-1");
    const buf = Buffer.from(ct, "base64");
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff;
    await expect(
      decryptSecret(buf.toString("base64"), "t-1")
    ).rejects.toThrow();
  });

  it("rejects invalid tenantId", async () => {
    await expect(
      encryptSecret("x", "bad id!")
    ).rejects.toThrow(/invalid tenantId/);
  });

  it("rejects a malformed env KEK", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "not-base64-32b";
    resetCryptoForTests();
    await expect(
      encryptSecret("x", "t-1")
    ).rejects.toThrow(/32 bytes/);
  });

  it("returns empty string round-trip", async () => {
    expect(await encryptSecret("", "t-1")).toBe("");
    expect(await decryptSecret("", "t-1")).toBe("");
  });
});

describe("crypto — HKDF DEK derivation", () => {
  const originalEnv = process.env.SETTINGS_ENCRYPTION_KEY;

  beforeEach(() => {
    resetCryptoForTests();
    process.env.SETTINGS_ENCRYPTION_KEY =
      Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.SETTINGS_ENCRYPTION_KEY = originalEnv;
    }
    resetCryptoForTests();
  });

  it("derives the same DEK for the same tenantId", async () => {
    const a = await deriveTenantDek("tenant-1");
    const b = await deriveTenantDek("tenant-1");
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  it("derives different DEKs for different tenantIds", async () => {
    const a = await deriveTenantDek("tenant-1");
    const b = await deriveTenantDek("tenant-2");
    expect(a.equals(b)).toBe(false);
  });

  it("round-trips encryption with pure HKDF (no store)", async () => {
    const ct = await encryptSecret("hello", "tenant-1");
    const pt = await decryptSecret(ct, "tenant-1");
    expect(pt).toBe("hello");
  });

  it("rejects ciphertext under a different tenantId", async () => {
    const ct = await encryptSecret("hello", "tenant-1");
    await expect(
      decryptSecret(ct, "tenant-2")
    ).rejects.toThrow();
  });

  it("survives process restart (deterministic from env)", async () => {
    const ct = await encryptSecret("hello", "tenant-1");
    resetCryptoForTests();
    // Same env var, so derivation produces the same DEK.
    process.env.SETTINGS_ENCRYPTION_KEY =
      Buffer.alloc(32, 7).toString("base64");
    const pt = await decryptSecret(ct, "tenant-1");
    expect(pt).toBe("hello");
  });
});
