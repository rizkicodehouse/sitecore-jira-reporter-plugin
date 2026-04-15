import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { POST } from "./route";
import { resetJiraQueueForTests } from "@/lib/rate-limit";

const mkReq = (body: unknown) =>
  new Request("http://x/api/jira/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sdk-Token": "stub-valid"
    },
    body: JSON.stringify(body)
  });

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
    vi.stubEnv("JIRA_BASE_URL", "https://j.example.com");
    vi.stubEnv("JIRA_SERVICE_EMAIL", "svc@x");
    vi.stubEnv("JIRA_API_TOKEN", "tok");
    vi.stubEnv("JIRA_DEFAULT_PROJECT_KEY", "CLD");
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
