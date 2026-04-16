// @vitest-environment node
// Uses node env so that native FormData round-trips through Request
// for the multipart upload test (jsdom has no multipart-capable body).
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { POST } from "./route";
import { resetJiraQueueForTests } from "@/lib/rate-limit";
import { auth0 } from "@/lib/auth0";

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: vi.fn() }
}));

const getSessionMock = vi.mocked(auth0.getSession);

const mkReq = () => {
  const fd = new FormData();
  fd.append("file",
    new Blob(["x"], { type: "image/png" }),
    "shot.png"
  );
  return new Request(
    "http://x/api/jira/attachment?issueKey=CLD-1",
    {
      method: "POST",
      body: fd
    }
  );
};

describe("POST /api/jira/attachment", () => {
  beforeEach(() => {
    resetJiraQueueForTests();
    vi.stubEnv("JIRA_BASE_URL", "https://j.example.com");
    vi.stubEnv("JIRA_SERVICE_EMAIL", "svc@x");
    vi.stubEnv("JIRA_API_TOKEN", "tok");
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      user: { email: "dev@local", name: "Dev" }
    } as never);
  });

  it("forwards multipart and returns attachment id",
     async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "10100" }]),
                   { status: 200 })
    ));
    const res = await POST(mkReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("10100");
  });

  it("400 when issueKey query param missing", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "image/png" }));
    const res = await POST(new Request(
      "http://x/api/jira/attachment",
      { method: "POST", body: fd }
    ));
    expect(res.status).toBe(400);
  });
});
