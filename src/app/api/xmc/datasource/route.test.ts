import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET } from "./route";

const url = (params: string) =>
  new Request(`http://x/api/xmc/datasource?${params}`, {
    headers: { "X-Sdk-Token": "stub-valid" }
  });

describe("GET /api/xmc/datasource", () => {
  beforeEach(() => {
    vi.stubEnv("XMC_TENANT_URL", "https://xmc.example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: { item: { fields: [
          { name: "Title", value: "Welcome" }
        ] } }
      }), { status: 200 })
    ));
  });

  it("returns fields map", async () => {
    const res = await GET(url("itemId=abc&language=en"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields.Title).toBe("Welcome");
  });

  it("400 when params missing", async () => {
    const res = await GET(url(""));
    expect(res.status).toBe(400);
  });
});
