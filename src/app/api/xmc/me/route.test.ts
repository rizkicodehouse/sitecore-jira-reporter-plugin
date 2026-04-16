import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET } from "./route";
import { auth0 } from "@/lib/auth0";

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: vi.fn() }
}));

const getSessionMock = vi.mocked(auth0.getSession);

describe("GET /api/xmc/me", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  it("returns the session user", async () => {
    getSessionMock.mockResolvedValue({
      user: { email: "a@x.com", name: "Ada" }
    } as never);
    const res = await GET(new Request("http://x/api/xmc/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("a@x.com");
    expect(body.name).toBe("Ada");
  });

  it("401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/xmc/me"));
    expect(res.status).toBe(401);
  });

  it("falls back to empty strings when session has no user fields",
     async () => {
    getSessionMock.mockResolvedValue({
      user: {}
    } as never);
    const res = await GET(new Request("http://x/api/xmc/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("");
    expect(body.name).toBe("");
  });
});
