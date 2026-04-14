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
