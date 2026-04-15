import {
  describe, it, expect, beforeEach, beforeAll, vi
} from "vitest";
import { randomBytes } from "node:crypto";
import { GET, PUT } from "./route";
import { resetSettingsStoreForTests }
  from "@/lib/settings-store";

beforeAll(() => {
  process.env.SETTINGS_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
});

const withToken = (
  body?: unknown,
  method = "GET",
  tenantId = "t-1"
): Request =>
  new Request("http://x/api/settings", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Sdk-Token": "stub-valid",
      "X-Tenant-Id": tenantId
    },
    body: body ? JSON.stringify(body) : undefined
  });

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
  });

  it("GET returns defaults for a fresh tenant", async () => {
    const res = await GET(withToken());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectKey).toBe("");
    expect(body.hasJiraApiToken).toBe(false);
  });

  it("GET 401 without session", async () => {
    const res = await GET(new Request(
      "http://x/api/settings",
      { headers: { "X-Tenant-Id": "t-1" } }
    ));
    expect(res.status).toBe(401);
  });

  it("GET 400 without tenantId", async () => {
    const res = await GET(new Request(
      "http://x/api/settings",
      { headers: { "X-Sdk-Token": "stub-valid" } }
    ));
    expect(res.status).toBe(400);
  });

  it("PUT forbids non-admin once tenant has admins",
     async () => {
    // First save (bootstrap) — seeds tenant admin as
    // 'other@x', locking out 'dev@local' on subsequent
    // writes.
    const seed = await PUT(withToken({
      ...validUpdate,
      adminEmails: ["other@x"]
    }, "PUT"));
    expect(seed.status).toBe(200);
    // Second save as non-admin session — 'dev@local'
    // from the stub is not on the tenant's admin list.
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "");
    const res = await PUT(withToken(validUpdate, "PUT"));
    expect(res.status).toBe(403);
  });

  it("PUT bootstrap allows first save on fresh tenant",
     async () => {
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "");
    const res = await PUT(withToken(validUpdate, "PUT"));
    expect(res.status).toBe(200);
  });

  it("PUT admin writes settings", async () => {
    const res = await PUT(withToken(validUpdate, "PUT"));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.projectKey).toBe("OPS");
    expect(saved.hasJiraApiToken).toBe(false);
  });

  it("PUT accepts api token, stores hasJiraApiToken=true",
     async () => {
    const res = await PUT(withToken({
      ...validUpdate,
      jiraApiToken: "ATLAS-SECRET"
    }, "PUT"));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.hasJiraApiToken).toBe(true);
    // Token itself must NEVER be echoed back.
    expect(JSON.stringify(saved))
      .not.toContain("ATLAS-SECRET");
  });

  it("PUT 400 on bad body", async () => {
    const res = await PUT(withToken(
      { projectKey: "" }, "PUT"
    ));
    expect(res.status).toBe(400);
  });
});
