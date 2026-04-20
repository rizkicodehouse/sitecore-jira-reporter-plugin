import { describe, it, expect, vi } from "vitest";
import {
  provisionPluginSite
} from "./sitecore-provision";
import type { XmcClient } from "@/services/sitecore/xmc";
import { TEMPLATE_ID_FOLDER } from "@/services/sitecore/templates";
import {
  SETTINGS_TEMPLATE_PATH,
  BUG_REPORT_TEMPLATE_PATH,
  PLUGIN_TEMPLATES_FOLDER,
  FEATURE_TEMPLATES_ROOT,
  BUCKETABLE_FOLDER_TEMPLATE_PATH
} from "@/services/sitecore/template-provision";

// Stable stub for the template tree so ensureFeatureTemplates
// short-circuits and doesn't try to hit GraphQL.
const TEMPLATE_STUBS: Record<string, unknown> = {
  [FEATURE_TEMPLATES_ROOT]: {
    itemId: "feature-root", path: FEATURE_TEMPLATES_ROOT,
    fields: {}
  },
  [PLUGIN_TEMPLATES_FOLDER]: {
    itemId: "plugin-root", path: PLUGIN_TEMPLATES_FOLDER,
    fields: {}
  },
  [SETTINGS_TEMPLATE_PATH]: {
    itemId: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
    path: SETTINGS_TEMPLATE_PATH, fields: {}
  },
  [BUG_REPORT_TEMPLATE_PATH]: {
    itemId: "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB",
    path: BUG_REPORT_TEMPLATE_PATH, fields: {}
  },
  [BUCKETABLE_FOLDER_TEMPLATE_PATH]: {
    itemId: "CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC",
    path: BUCKETABLE_FOLDER_TEMPLATE_PATH, fields: {}
  }
};

function client(
  itemsByPath: Record<string, unknown>,
  createItem = vi.fn(async () => ({
    itemId: "new", path: "/", fields: {}
  })),
  updateItem = vi.fn(async () => ({
    itemId: "x", path: "/", fields: {}
  }))
): XmcClient {
  const merged = { ...TEMPLATE_STUBS, ...itemsByPath };
  const itemByPath: XmcClient["itemByPath"] =
    vi.fn(async (p: string) => {
      const raw = merged[p] as {
        itemId: string; path?: string;
        fields?: Record<string, string>;
      } | undefined;
      if (!raw) return null;
      return {
        itemId: raw.itemId,
        path: raw.path ?? p,
        fields: raw.fields ?? {}
      };
    });
  return {
    getCurrentUser: vi.fn(),
    itemByPath, createItem,
    updateItem,
    searchItems: vi.fn(),
    graphql: vi.fn()
  };
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
      "/sitecore/content/T/S": {
        itemId: "site-root", path: "/p", fields: {}
      },
      "/sitecore/content/T/S/Settings": {
        itemId: "settings-root", path: "/p", fields: {}
      },
      "/sitecore/content/T/S/Data": {
        itemId: "data-root", path: "/p", fields: {}
      }
    }, createItem);
    const ids = await provisionPluginSite({
      client: c, tenant: "T", site: "S"
    });
    const names = createItem.mock.calls.map(
      (call) => (call[0] as { name: string }).name
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "Bug Reporter for Jira",
        "Config",
        "Bug Reports"
      ])
    );
    expect(ids.settingsTemplateId).toBe(
      "{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
    );
  });

  it("also creates Settings + Data root folders when absent", async () => {
    const createItem = vi.fn(async (args: {
      name: string;
    }) => ({
      itemId: "new-" + args.name, path: "/", fields: {}
    }));
    const c = client({
      "/sitecore/content/T/S": {
        itemId: "site-root", path: "/p", fields: {}
      }
      // Settings and Data are missing — bootstrapper must
      // create them before its own subfolders.
    }, createItem);
    await provisionPluginSite({
      client: c, tenant: "T", site: "S"
    });
    const names = createItem.mock.calls.map(
      (call) => (call[0] as { name: string }).name
    );
    expect(names).toEqual(
      expect.arrayContaining(["Settings", "Data"])
    );
  });

  it("is idempotent when items already exist", async () => {
    const createItem = vi.fn();
    const updateItem = vi.fn();
    const c = client({
      "/sitecore/content/T/S":
        { itemId: "site" } as unknown,
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
    }, createItem, updateItem);
    await provisionPluginSite({
      client: c, tenant: "T", site: "S"
    });
    expect(createItem).not.toHaveBeenCalled();
  });

  it("creates Bug Reports as a bucketable-folder template without setting IsBucket via GraphQL", async () => {
    const createItem = vi.fn(async (args: {
      name: string;
    }) => ({
      itemId: "new-" + args.name,
      path: "/p", fields: {}
    }));
    const updateItem = vi.fn(async () => ({
      itemId: "x", path: "/", fields: {}
    }));
    const c = client({
      "/sitecore/content/T/S": {
        itemId: "site", path: "/p", fields: {}
      },
      "/sitecore/content/T/S/Settings":
        { itemId: "s", path: "/p", fields: {} },
      "/sitecore/content/T/S/Data":
        { itemId: "d", path: "/p", fields: {} }
    }, createItem, updateItem);
    await provisionPluginSite({
      client: c, tenant: "T", site: "S"
    });

    // Ensure we did not call updateItem to set IsBucket
    expect(updateItem).not.toHaveBeenCalled();

    // Find the createItem call for Bug Reports and ensure
    // it used a bucketable template and did not include
    // an IsBucket field in the fields array.
    const bugCalls = createItem.mock.calls.filter((call) =>
      (call[0] as any).name === "Bug Reports");
    expect(bugCalls.length).toBeGreaterThan(0);
    if (bugCalls.length === 0) throw new Error("Bug Reports not created");
    const bugArgs = bugCalls[0]![0] as any;
    expect(bugArgs.templateId).toBeDefined();
    expect(bugArgs.templateId).not.toBe(TEMPLATE_ID_FOLDER);
    const hasIsBucket = (bugArgs.fields || []).some(
      (f: any) => f.name === "IsBucket");
    expect(hasIsBucket).toBe(false);
  });

  it("throws when the site root itself is absent", async () => {
    const c = client({});
    await expect(
      provisionPluginSite({
        client: c, tenant: "T", site: "S"
      })
    ).rejects.toThrow(/site tree must exist/);
  });
});
