import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { randomBytes } from "node:crypto";
import { POST } from "./route";
import { resetJiraQueueForTests } from "@/lib/rate-limit";
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

  it("returns the Jira issueType so the client can mirror the record",
     async () => {
    await seedTenantCreds("acme");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        key: "CLD-42", id: "99", self: "http://j/CLD-42"
      }), { status: 201 })
    ));
    const res = await POST(mkReqForTenant("acme", {
      ...validBody,
      summary: "Hero broken"
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toBe("CLD-42");
    expect(body.issueType).toBe("Bug");
    expect(body.url).toContain("browse/CLD-42");
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

  it("forwards priority.id when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        key: "CLD-9", id: "12", self: "http://j/CLD-9"
      }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(mkReq({
      ...validBody,
      priority: { id: "3" }
    }));
    expect(res.status).toBe(201);
    const call = fetchMock.mock.calls[0]!;
    const body = JSON.parse(
      (call[1] as RequestInit).body as string
    );
    expect(body.fields.priority).toEqual({ id: "3" });
  });

  it("omits priority when null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        key: "CLD-10", id: "13", self: "http://j/CLD-10"
      }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(mkReq({
      ...validBody,
      priority: null
    }));
    expect(res.status).toBe(201);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit)
        .body as string
    );
    expect(body.fields.priority).toBeUndefined();
  });

  it("ignores client-supplied priority in customFields",
     async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        key: "CLD-11", id: "14", self: "http://j/CLD-11"
      }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(mkReq({
      ...validBody,
      customFields: { priority: { id: "999" } }
    }));
    expect(res.status).toBe(201);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit)
        .body as string
    );
    expect(body.fields.priority).toBeUndefined();
  });
});
