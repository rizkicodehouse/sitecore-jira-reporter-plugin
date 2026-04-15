import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptSecret, decryptSecret,
  destroyTenantKey, resetCryptoForTests
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

  it("destroyTenantKey shreds the tenant's DEK " +
     "so existing ciphertext becomes unreadable",
     async () => {
    const ct = await encryptSecret("SECRET", "t-shred");
    await destroyTenantKey("t-shred");
    // After shred, a new DEK is generated on next call,
    // so the old ciphertext can no longer be decrypted.
    await expect(
      decryptSecret(ct, "t-shred")
    ).rejects.toThrow();
  });
});
