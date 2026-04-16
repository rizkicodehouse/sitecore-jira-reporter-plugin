import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resetLocalXmcStoreForTests
} from "@/services/sitecore/xmc-client-local";

vi.mock("@/lib/auth", () => ({
  verifySdkSession: vi.fn(async () =>
    ({ ok: true, session: {
      email: "e@x", name: "E",
      issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER
    } })),
  getTenantId: vi.fn(() => "Demo"),
  isAdminEmail: vi.fn(() => true)
}));

import { POST } from "./route";

describe("POST /api/provision", () => {
  beforeEach(() => {
    // Every test starts with a fresh local-mock tree so
    // provisioning writes don't leak between cases.
    resetLocalXmcStoreForTests();
  });

  it("returns 200 after provisioning the demo site", async () => {
    const req = new Request(
      "http://localhost/api/provision",
      {
        method: "POST",
        headers: {
          "x-sc-tenant": "Demo",
          "x-sc-site": "dev-site"
        }
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("falls back to Demo/dev-site when SDK headers absent in local mode", async () => {
    const req = new Request(
      "http://localhost/api/provision",
      { method: "POST" }
    );
    const res = await POST(req);
    // Local mode (NODE_ENV=test in the factory) accepts
    // missing headers and provisions against the seed
    // tree. In production, the route returns 400 instead
    // because contextId/token/baseUrl are required.
    expect(res.status).toBe(200);
  });
});
