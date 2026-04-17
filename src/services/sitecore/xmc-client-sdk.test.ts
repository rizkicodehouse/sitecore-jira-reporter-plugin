import { describe, it, expect, vi } from "vitest";
import {
  createSdkXmcClient,
  type MarketplaceMutator
} from "./xmc-client-sdk";

function mutatorWith(
  handler: (q: string, v?: Record<string, unknown>) =>
    { data?: Record<string, unknown>; errors?: Array<{ message?: string }> }
): MarketplaceMutator {
  return {
    mutate: vi.fn(async (_key, opts) => {
      return handler(
        opts.params.body.query,
        opts.params.body.variables
      );
    })
  };
}

describe("createSdkXmcClient", () => {
  it("maps itemByPath field nodes into a flat record", async () => {
    const client = createSdkXmcClient(mutatorWith(() => ({
      data: { item: {
        itemId: "id-1", name: "Config", path: "/sitecore/x",
        fields: { nodes: [
          { name: "Project Key", value: "SJP" },
          { name: "Jira URL", value: "https://x.atlassian.net" }
        ] }
      } }
    })));
    const item = await client.itemByPath("/sitecore/x");
    expect(item?.fields).toEqual({
      "Project Key": "SJP",
      "Jira URL": "https://x.atlassian.net"
    });
  });

  it("returns null when the item is not present", async () => {
    const client = createSdkXmcClient(mutatorWith(() => ({
      data: { item: null }
    })));
    const item = await client.itemByPath("/missing");
    expect(item).toBeNull();
  });

  it("throws with the server's error messages joined", async () => {
    const client = createSdkXmcClient(mutatorWith(() => ({
      errors: [
        { message: "not found" }, { message: "retry later" }
      ]
    })));
    await expect(client.itemByPath("/x")).rejects.toThrow(
      "XMC GraphQL: not found; retry later"
    );
  });

  it("forwards createItem input unchanged", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = createSdkXmcClient(mutatorWith((_q, v) => {
      captured = v;
      return { data: { createItem: { item: {
        itemId: "new-id", path: "/a",
        fields: { nodes: [] }
      } } } };
    }));
    await client.createItem({
      name: "Config", parent: "/sitecore/x",
      templateId: "tpl", language: "en",
      fields: [{ name: "Title", value: "t" }]
    });
    expect(captured).toEqual({ input: {
      name: "Config", parent: "/sitecore/x",
      templateId: "tpl", language: "en",
      fields: [{ name: "Title", value: "t" }]
    } });
  });

  it("maps searchItems pageInfo + results", async () => {
    const client = createSdkXmcClient(mutatorWith(() => ({
      data: { search: {
        totalCount: 2,
        pageInfo: { endCursor: "c", hasNext: false },
        results: [
          { innerItem: {
            itemId: "a", path: "/x/a",
            fields: { nodes: [
              { name: "Title", value: "A" }
            ] }
          } },
          { innerItem: {
            itemId: "b", path: "/x/b",
            fields: { nodes: [] }
          } }
        ]
      } }
    })));
    const page = await client.searchItems({
      rootPath: "/x", templateId: "tpl", first: 10
    });
    expect(page.totalCount).toBe(2);
    expect(page.hasNext).toBe(false);
    expect(page.endCursor).toBe("c");
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.fields).toEqual({ Title: "A" });
  });
});
