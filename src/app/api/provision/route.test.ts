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
      // Stub the site root, the Feature template tree, and
      // the plugin templates so ensureFeatureTemplates
      // short-circuits without hitting graphql.
      const knownPaths: Record<string, unknown> = {
        "/sitecore/content/T/S": {
          itemId: "site", path, fields: {}
        },
        "/sitecore/content/T/S/Settings": {
          itemId: "settings-root", path, fields: {}
        },
        "/sitecore/content/T/S/Data": {
          itemId: "data-root", path, fields: {}
        },
        "/sitecore/templates/Feature": {
          itemId: "feature-root", path, fields: {}
        },
        "/sitecore/templates/Feature/BugReporterJira": {
          itemId: "plugin-root", path, fields: {}
        },
        "/sitecore/templates/Feature/BugReporterJira/BugReporterJiraSettings":
          {
            itemId: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
            path, fields: {}
          },
        "/sitecore/templates/Feature/BugReporterJira/BugReport":
          {
            itemId: "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB",
            path, fields: {}
          }
      };
      return knownPaths[path] ?? null;
    }),
    createItem: vi.fn(async () => ({
      itemId: "x", path: "/p/x", fields: {}
    })),
    updateItem: vi.fn(async () => ({
      itemId: "u", path: "/p/u", fields: {}
    })),
    searchItems: vi.fn(),
    graphql: vi.fn()
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
