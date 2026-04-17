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
    // ClientSDK.mutate wraps the GraphQL envelope inside the
    // hey-api fetch-client result shape. Mirror that here so
    // the adapter's unwrapping is exercised.
    mutate: vi.fn(async (_key, opts) => ({
      data: handler(
        opts.params.body.query,
        opts.params.body.variables
      )
    }))
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

  it("resolves the parent path to a Guid before calling createItem", async () => {
    const captures: Array<Record<string, unknown> | undefined> = [];
    // createItem first runs ITEM_BY_PATH_QUERY to turn the
    // parent path into a Guid (XMC Authoring's
    // CreateItemInput.parent is typed as Guid). The second
    // call is the actual mutation — that's what we assert
    // against.
    const client = createSdkXmcClient(mutatorWith((q, v) => {
      captures.push(v);
      if (q.includes("ItemByPath")) {
        return { data: { item: {
          itemId: "parent-guid", path: "/sitecore/x",
          fields: { nodes: [] }
        } } };
      }
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
    const createCapture = captures[1];
    expect(createCapture).toEqual({ input: {
      name: "Config", parent: "parent-guid",
      templateId: "tpl", language: "en",
      fields: [{ name: "Title", value: "t" }]
    } });
  });

  it("searchItems returns an empty page (stub pending real Authoring schema)", async () => {
    const client = createSdkXmcClient(mutatorWith(() => ({
      data: {}
    })));
    const page = await client.searchItems({
      rootPath: "/x", templateId: "tpl", first: 10
    });
    expect(page.totalCount).toBe(0);
    expect(page.hasNext).toBe(false);
    expect(page.items).toEqual([]);
  });
});
