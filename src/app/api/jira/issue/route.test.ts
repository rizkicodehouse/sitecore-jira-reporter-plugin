import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { randomBytes } from "node:crypto";
import { POST } from "./route";
import { resetJiraQueueForTests } from "@/lib/rate-limit";
import {
  getReportsStore, resetReportsStoreForTests
} from "@/lib/reports-store";
import {
  getSettingsStore, resetSettingsStoreForTests
} from "@/lib/settings-store";
import { resetCryptoForTests } from "@/lib/crypto";
import { auth0 } from "@/lib/auth0";

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: vi.fn() }
}));

const getSessionMock = vi.mocked(auth0.getSession);

const mkReq = (body: unknown) =>
  new Request("http://x/api/jira/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

const mkReqForTenant = (tenantId: string, body: unknown) =>
  new Request(
    `http://x/api/jira/issue?tenantId=${tenantId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId
      },
      body: JSON.stringify(body)
    }
  );

async function seedTenantCreds(tenantId: string) {
  await getSettingsStore().put(tenantId, {
    projectKey: "CLD",
    defaultIssueType: "Bug",
    defaultLabels: ["page-builder"],
    defaultAssigneeAccountId: null,
    defaultBoardId: null,
    jiraBaseUrl: "https://j.example.com",
    jiraServiceEmail: "svc@x",
    jiraApiToken: "tok",
    adminEmails: []
  });
}

const validBody = {
  summary: "test",
  descriptionText: "d",
  context: {
    page: { title: "T", url: "/", language: "en", site: "s" },
    rendering: null, datasource: null,
    reporter: { name: "A", email: "a@x" },
    browser: { userAgent: "UA", viewport: "1x1",
               timestamp: "t" }
  },
  attachmentCount: 0
};

describe("POST /api/jira/issue", () => {
  beforeEach(() => {
    resetJiraQueueForTests();
    resetReportsStoreForTests();
    resetSettingsStoreForTests();
    process.env.SETTINGS_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
    resetCryptoForTests();
    vi.stubEnv("JIRA_BASE_URL", "https://j.example.com");
    vi.stubEnv("JIRA_SERVICE_EMAIL", "svc@x");
    vi.stubEnv("JIRA_API_TOKEN", "tok");
    vi.stubEnv("JIRA_DEFAULT_PROJECT_KEY", "CLD");
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      user: { email: "dev@local", name: "Dev" }
    } as never);
  });

  it("creates issue on 201", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        key: "CLD-1", id: "10", self: "http://j/CLD-1"
      }), { status: 201 })
    ));
    const res = await POST(mkReq(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toBe("CLD-1");
    expect(body.url).toContain("browse/CLD-1");
  });

  it("persists report record after successful create",
     async () => {
    await seedTenantCreds("acme");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        key: "CLD-42", id: "99", self: "http://j/CLD-42"
      }), { status: 201 })
    ));
    const res = await POST(mkReqForTenant("acme", {
      ...validBody,
      summary: "Hero broken",
      context: {
        ...validBody.context,
        rendering: {
          instanceId: "i1", renderingId: "r1",
          name: "Hero", templateName: "T",
          dataSource: "/sitecore/content/ds"
        }
      }
    }));
    expect(res.status).toBe(201);
    const page = await getReportsStore().list("acme");
    expect(page.total).toBe(1);
    const first = page.items[0]!;
    expect(first.jiraKey).toBe("CLD-42");
    expect(first.summary).toBe("Hero broken");
    expect(first.rendering?.name).toBe("Hero");
    expect(first.datasourceId).toBe("/sitecore/content/ds");
    expect(first.sprintAssigned).toBe(false);
  });

  it("does not persist when JIRA create fails",
     async () => {
    await seedTenantCreds("acme");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("err", { status: 500 })
    ));
    await POST(mkReqForTenant("acme", validBody));
    const page = await getReportsStore().list("acme");
    expect(page.total).toBe(0);
  });

  it("maps upstream 401 to config error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("bad", { status: 401 })
    ));
    const res = await POST(mkReq(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.category).toBe("config");
  });

  it("400 on missing summary", async () => {
    const bad = { ...validBody, summary: "" };
    const res = await POST(mkReq(bad));
    expect(res.status).toBe(400);
  });
});
