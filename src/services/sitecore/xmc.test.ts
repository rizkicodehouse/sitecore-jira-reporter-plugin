import { describe, it, expect, vi } from "vitest";
import { createXmcClient, GET_ME_QUERY } from "./xmc";

describe("XmcClient", () => {
  it("getCurrentUser calls XMC with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        data: { me: { name: "Ada", email: "a@x.com" } }
      }),
      { status: 200 }
    ));
    const c = createXmcClient({
      baseUrl: "https://xmc.example.com",
      token: "t",
      fetch: fetchMock
    });
    const me = await c.getCurrentUser();
    expect(me).toEqual({ name: "Ada", email: "a@x.com" });
    const [, init] =
      fetchMock.mock.calls[0]! as [string, RequestInit];
    expect((init.headers as Record<string, string>)
      .Authorization).toBe("Bearer t");
    const parsed = JSON.parse(init.body as string) as {
      query: string;
    };
    expect(parsed.query).toBe(GET_ME_QUERY);
  });

  it("throws on upstream error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("nope", { status: 500 })
    );
    const c = createXmcClient({
      baseUrl: "https://xmc.example.com",
      token: "t", fetch: fetchMock
    });
    await expect(c.getCurrentUser())
      .rejects.toThrow();
  });
});
