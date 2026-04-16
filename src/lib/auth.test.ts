import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { verifySdkSession, isAdminEmail } from "./auth";
import { auth0 } from "./auth0";

vi.mock("./auth0", () => ({
  auth0: { getSession: vi.fn() }
}));

const getSessionMock = vi.mocked(auth0.getSession);

describe("verifySdkSession", () => {
  beforeEach(() => getSessionMock.mockReset());

  it("rejects when no session cookie present", async () => {
    getSessionMock.mockResolvedValue(null);
    const req = new Request("http://x/api", { method: "GET" });
    const out = await verifySdkSession(req);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(401);
  });

  it("returns session user when Auth0 has one", async () => {
    getSessionMock.mockResolvedValue({
      user: { email: "ada@x.com", name: "Ada" }
    } as never);
    const req = new Request("http://x/api", {
      method: "GET",
      headers: { "X-Tenant-Id": "tenant-1" }
    });
    const out = await verifySdkSession(req);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.session.email).toBe("ada@x.com");
      expect(out.session.name).toBe("Ada");
      expect(out.session.tenantId).toBe("tenant-1");
    }
  });

  it("tenantId falls back to empty when header absent",
     async () => {
    getSessionMock.mockResolvedValue({
      user: { email: "a@x", name: "A" }
    } as never);
    const req = new Request("http://x/api");
    const out = await verifySdkSession(req);
    if (out.ok) expect(out.session.tenantId).toBe("");
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
