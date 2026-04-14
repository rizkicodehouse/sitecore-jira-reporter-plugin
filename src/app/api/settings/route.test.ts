import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET, PUT } from "./route";

const withToken = (
  body?: unknown, method = "GET"
): Request =>
  new Request("http://x/api/settings", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Sdk-Token": "stub-valid"
    },
    body: body ? JSON.stringify(body) : undefined
  });

describe("/api/settings", () => {
  beforeEach(() => {
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "dev@local");
  });

  it("GET returns defaults", async () => {
    const res = await GET(withToken());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectKey).toBe("CLD");
  });

  it("GET 401 without session", async () => {
    const res = await GET(new Request("http://x/api/settings"));
    expect(res.status).toBe(401);
  });

  it("PUT forbids non-admin", async () => {
    vi.stubEnv("PLUGIN_ADMIN_EMAILS", "other@x");
    const res = await PUT(withToken({
      projectKey: "X",
      defaultIssueType: "Bug",
      defaultLabels: [],
      defaultAssigneeAccountId: null
    }, "PUT"));
    expect(res.status).toBe(403);
  });

  it("PUT admin writes settings", async () => {
    const res = await PUT(withToken({
      projectKey: "OPS",
      defaultIssueType: "Task",
      defaultLabels: ["x"],
      defaultAssigneeAccountId: null
    }, "PUT"));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.projectKey).toBe("OPS");
  });

  it("PUT 400 on bad body", async () => {
    const res = await PUT(withToken(
      { projectKey: "" }, "PUT"
    ));
    expect(res.status).toBe(400);
  });
});
