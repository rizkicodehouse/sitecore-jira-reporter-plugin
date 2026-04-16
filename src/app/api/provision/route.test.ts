import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  verifySdkSession: vi.fn(async () =>
    ({ ok: true, session: {
      email: "e@x", name: "E",
      issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER
    } })),
  getTenantId: vi.fn(() => "T"),
  isAdminEmail: vi.fn(() => true)
}));

vi.mock("@/services/sitecore/xmc", () => ({
  createXmcClient: vi.fn(() => ({
    getCurrentUser: vi.fn(),
    itemByPath: vi.fn(async (path: string) => {
      if (
        path === "/sitecore/content/T/S/Settings" ||
        path === "/sitecore/content/T/S/Data"
      ) {
        return {
          itemId: "root", path, fields: {}
        };
      }
      return null;
    }),
    createItem: vi.fn(async () => ({
      itemId: "x", path: "/p/x", fields: {}
    })),
    updateItem: vi.fn(),
    searchItems: vi.fn()
  }))
}));

import { POST } from "./route";

describe("POST /api/provision", () => {
  beforeEach(() => {
    process.env.SITECORE_DATASTORE = "true";
    process.env.SITECORE_AUTHORING_BASE_URL =
      "https://xmc.example";
  });

  it("returns 200 after provisioning", async () => {
    const req = new Request(
      "http://localhost/api/provision",
      {
        method: "POST",
        headers: {
          "x-sc-tenant": "T", "x-sc-site": "S",
          "x-sc-context-id": "ctx",
          "x-sc-auth-token": "tok"
        }
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 when context headers are missing", async () => {
    const req = new Request(
      "http://localhost/api/provision",
      { method: "POST" }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("sitecore-context-missing");
  });
});
