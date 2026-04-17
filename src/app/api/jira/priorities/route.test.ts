import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET } from "./route";
import { resetJiraQueueForTests } from "@/lib/rate-limit";
import { auth0 } from "@/lib/auth0";

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: vi.fn() }
}));

const getSessionMock = vi.mocked(auth0.getSession);

const mkReq = () =>
  new Request("http://x/api/jira/priorities");

describe("GET /api/jira/priorities", () => {
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

  it("returns normalized priority list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        values: [
          {
            id: "1", name: "Highest",
            iconUrl: "http://j/high.png",
            statusColor: "#cd1317",
            isDefault: false,
            description: "Top"
          },
          {
            id: "3", name: "Medium",
            iconUrl: "http://j/med.png",
            statusColor: "#e2aa00",
            isDefault: true,
            description: ""
          }
        ]
      }), { status: 200 })
    ));
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.priorities).toHaveLength(2);
    expect(body.priorities[0]).toEqual({
      id: "1",
      name: "Highest",
      description: "Top",
      iconUrl: "http://j/high.png",
      statusColor: "#cd1317",
      isDefault: false
    });
    expect(body.priorities[1].isDefault).toBe(true);
  });

  it("drops entries missing id or name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        values: [
          { id: "1", name: "Highest" },
          { id: "2" },
          { name: "Orphan" }
        ]
      }), { status: 200 })
    ));
    const res = await GET(mkReq());
    const body = await res.json();
    expect(body.priorities).toHaveLength(1);
    expect(body.priorities[0].id).toBe("1");
  });

  it("401 when session missing", async () => {
    getSessionMock.mockResolvedValueOnce(null as never);
    const res = await GET(mkReq());
    expect(res.status).toBe(401);
  });

  it("maps upstream 401 to permission error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("bad", { status: 401 })
    ));
    const res = await GET(mkReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.category).toBe("permission");
  });
});
