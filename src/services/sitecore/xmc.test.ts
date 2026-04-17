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

describe("createXmcClient — CRUD helpers", () => {
  it("itemByPath returns null when GraphQL reports no item", async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { item: null } })
    })) as unknown as typeof fetch;
    const client = createXmcClient({
      baseUrl: "https://xmc.example", token: "T", fetch: mock
    });
    const result = await client.itemByPath(
      "/sitecore/content/Demo"
    );
    expect(result).toBeNull();
  });

  it("itemByPath returns normalised field map", async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { item: {
          itemId: "abc",
          name: "Config",
          path: "/p",
          fields: { nodes: [
            { name: "projectKey", value: "SJP" }
          ] }
        } }
      })
    })) as unknown as typeof fetch;
    const client = createXmcClient({
      baseUrl: "https://xmc.example", token: "T", fetch: mock
    });
    const result = await client.itemByPath("/p");
    expect(result?.itemId).toBe("abc");
    expect(result?.fields.projectKey).toBe("SJP");
  });

  it("createItem posts CREATE_ITEM_MUTATION", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { createItem: { item: {
          itemId: "new", path: "/p/new",
          fields: { nodes: [] }
        } } }
      })
    })) as unknown as typeof fetch;
    const client = createXmcClient({
      baseUrl: "https://xmc.example", token: "T", fetch: spy
    });
    const out = await client.createItem({
      name: "SJP-1",
      parent: "/p",
      templateId: "{tpl}",
      language: "en",
      fields: [{ name: "Ticket Key", value: "SJP-1" }]
    });
    expect(out.itemId).toBe("new");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("searchItems returns totalCount + paths from the offset-based index", async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { search: {
          totalCount: 1,
          results: [{ itemId: "a", path: "/p/a" }]
        } }
      })
    })) as unknown as typeof fetch;
    const client = createXmcClient({
      baseUrl: "https://xmc.example", token: "T", fetch: mock
    });
    const page = await client.searchItems({
      rootPath: "/sitecore/content/Demo/Data/Bug Reports",
      templateName: "BugReport",
      first: 50
    });
    expect(page.totalCount).toBe(1);
    expect(page.items[0]?.itemId).toBe("a");
    expect(page.items[0]?.path).toBe("/p/a");
  });
});
