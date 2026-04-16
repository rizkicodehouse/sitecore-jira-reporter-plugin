import {
  describe, it, expect, beforeEach, beforeAll, vi
} from "vitest";
import { randomBytes } from "node:crypto";
import { GET, PUT } from "./route";
import { resetSettingsStoreForTests }
  from "@/lib/settings-store";
import { auth0 } from "@/lib/auth0";

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: vi.fn() }
}));

const getSessionMock = vi.mocked(auth0.getSession);

beforeAll(() => {
  process.env.SETTINGS_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
});

const mkReq = (
  body?: unknown,
  method = "GET",
  tenantId: string | null = "t-1"
): Request => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (tenantId) headers["X-Tenant-Id"] = tenantId;
  return new Request("http://x/api/settings", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
};

const validUpdate = {
  projectKey: "OPS",
  defaultIssueType: "Task",
  defaultLabels: ["x"],
  defaultAssigneeAccountId: null,
  defaultBoardId: null,
  jiraBaseUrl: "https://x.atlassian.net",
  jiraServiceEmail: "svc@x.com",
  adminEmails: []
};

describe("/api/settings", () => {
  beforeEach(() => {
    resetSettingsStoreForTests();
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "dev@local");
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      user: { email: "dev@local", name: "Dev" }
    } as never);
  });

  it("GET returns defaults for a fresh tenant", async () => {
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectKey).toBe("");
    expect(body.hasJiraApiToken).toBe(false);
  });

  it("GET 401 without session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const res = await GET(mkReq());
    expect(res.status).toBe(401);
  });

  it("GET 400 without tenantId", async () => {
    const res = await GET(mkReq(undefined, "GET", null));
    expect(res.status).toBe(400);
  });

  it("PUT forbids non-admin once tenant has admins",
     async () => {
    const seed = await PUT(mkReq({
      ...validUpdate,
      adminEmails: ["other@x"]
    }, "PUT"));
    expect(seed.status).toBe(200);
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "");
    const res = await PUT(mkReq(validUpdate, "PUT"));
    expect(res.status).toBe(403);
  });

  it("PUT bootstrap allows first save on fresh tenant",
     async () => {
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "");
    const res = await PUT(mkReq(validUpdate, "PUT"));
    expect(res.status).toBe(200);
  });

  it("PUT admin writes settings", async () => {
    const res = await PUT(mkReq(validUpdate, "PUT"));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.projectKey).toBe("OPS");
    expect(saved.hasJiraApiToken).toBe(false);
  });

  it("PUT accepts api token, stores hasJiraApiToken=true",
     async () => {
    const res = await PUT(mkReq({
      ...validUpdate,
      jiraApiToken: "ATLAS-SECRET"
    }, "PUT"));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.hasJiraApiToken).toBe(true);
    expect(JSON.stringify(saved))
      .not.toContain("ATLAS-SECRET");
  });

  it("PUT 400 on bad body", async () => {
    const res = await PUT(mkReq(
      { projectKey: "" }, "PUT"
    ));
    expect(res.status).toBe(400);
  });
});
