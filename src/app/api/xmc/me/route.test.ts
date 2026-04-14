// src/app/api/xmc/me/route.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET } from "./route";

const mkReq = () =>
  new Request("http://x/api/xmc/me", {
    headers: { "X-Sdk-Token": "stub-valid" }
  });

describe("GET /api/xmc/me", () => {
  beforeEach(() => {
    vi.stubEnv(
      "XMC_TENANT_URL",
      "https://xmc.example.com"
    );
  });

  it("returns the resolved user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: { me: { name: "Ada", email: "a@x.com" } }
      }), { status: 200 })
    ));
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("a@x.com");
  });

  it("401 without session", async () => {
    const res = await GET(new Request("http://x/api/xmc/me"));
    expect(res.status).toBe(401);
  });

  it("502 when upstream fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("nope", { status: 500 })
    ));
    const res = await GET(mkReq());
    expect(res.status).toBe(502);
  });
});
