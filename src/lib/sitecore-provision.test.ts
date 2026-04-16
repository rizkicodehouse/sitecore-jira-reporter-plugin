import { describe, it, expect, vi } from "vitest";
import {
  provisionPluginSite
} from "./sitecore-provision";
import type { XmcClient } from "@/services/sitecore/xmc";

function client(
  itemsByPath: Record<string, unknown>,
  createItem = vi.fn(async () => ({
    itemId: "new", path: "/", fields: {}
  }))
): XmcClient {
  const itemByPath = vi.fn(async (p: string) =>
    (itemsByPath[p] as { itemId: string } | undefined) ?? null);
  return {
    getCurrentUser: vi.fn(),
    itemByPath, createItem,
    updateItem: vi.fn(),
    searchItems: vi.fn()
  } as unknown as XmcClient;
}

describe("sitecore-provision", () => {
  it("creates folder + Config + Data/Bug Reports when absent", async () => {
    const createItem = vi.fn(async (args: {
      name: string; parent: string;
    }) => ({
      itemId: "new-" + args.name,
      path: `${args.parent}/${args.name}`,
      fields: {}
    }));
    const c = client({
      "/sitecore/content/T/S/Settings": {
        itemId: "settings-root", path: "/p", fields: {}
      },
      "/sitecore/content/T/S/Data": {
        itemId: "data-root", path: "/p", fields: {}
      }
    }, createItem);
    await provisionPluginSite({
      client: c, tenant: "T", site: "S"
    });
    const names = createItem.mock.calls.map((c) => c[0].name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Bug Reporter for Jira",
        "Config",
        "Bug Reports"
      ])
    );
  });

  it("is idempotent when items already exist", async () => {
    const createItem = vi.fn();
    const c = client({
      "/sitecore/content/T/S/Settings":
        { itemId: "s" } as unknown,
      "/sitecore/content/T/S/Data":
        { itemId: "d" } as unknown,
      "/sitecore/content/T/S/Settings/Bug Reporter for Jira":
        { itemId: "f" } as unknown,
      "/sitecore/content/T/S/Settings/Bug Reporter for Jira/Config":
        { itemId: "cfg" } as unknown,
      "/sitecore/content/T/S/Data/Bug Reports":
        { itemId: "br" } as unknown
    }, createItem);
    await provisionPluginSite({
      client: c, tenant: "T", site: "S"
    });
    expect(createItem).not.toHaveBeenCalled();
  });

  it("throws MissingParent when site tree is absent", async () => {
    const c = client({});
    await expect(
      provisionPluginSite({
        client: c, tenant: "T", site: "S"
      })
    ).rejects.toThrow(/Settings.*not found/);
  });
});
