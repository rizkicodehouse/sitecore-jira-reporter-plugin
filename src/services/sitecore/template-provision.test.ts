import { describe, it, expect, vi } from "vitest";
import {
  ensureFeatureTemplates,
  SETTINGS_TEMPLATE_PATH,
  BUG_REPORT_TEMPLATE_PATH,
  PLUGIN_TEMPLATES_FOLDER,
  FEATURE_TEMPLATES_ROOT
} from "./template-provision";
import type { XmcClient, SitecoreItem } from "./xmc";

function makeClient(opts: {
  itemsByPath: Record<string, SitecoreItem | null>;
  graphql?: XmcClient["graphql"];
  createItem?: XmcClient["createItem"];
}): XmcClient {
  return {
    getCurrentUser: vi.fn(),
    itemByPath: vi.fn(async (path: string) =>
      opts.itemsByPath[path] ?? null),
    createItem: opts.createItem ?? vi.fn(async () => ({
      itemId: "new", path: "/", fields: {}
    })),
    updateItem: vi.fn(),
    searchItems: vi.fn(),
    graphql: opts.graphql ?? vi.fn()
  };
}

describe("ensureFeatureTemplates", () => {
  it("returns existing template ids when both templates present", async () => {
    const graphql = vi.fn();
    const client = makeClient({
      itemsByPath: {
        [SETTINGS_TEMPLATE_PATH]: {
          itemId: "AAAA1111-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
          path: SETTINGS_TEMPLATE_PATH, fields: {}
        },
        [BUG_REPORT_TEMPLATE_PATH]: {
          itemId: "BBBB2222-BBBB-BBBB-BBBB-BBBBBBBBBBBB",
          path: BUG_REPORT_TEMPLATE_PATH, fields: {}
        }
      },
      graphql
    });
    const ids = await ensureFeatureTemplates({ client });
    expect(ids.settingsTemplateId).toBe(
      "{AAAA1111-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
    );
    expect(ids.bugReportTemplateId).toBe(
      "{BBBB2222-BBBB-BBBB-BBBB-BBBBBBBBBBBB}"
    );
    expect(graphql).not.toHaveBeenCalled();
  });

  it("creates both templates under the plugin folder when missing", async () => {
    const createItem = vi.fn(async () => ({
      itemId: "folder", path: "/", fields: {}
    }));
    const graphql = vi.fn(
      async () => ({
        createItemTemplate: {
          itemTemplate: {
            templateId:
              "CCCC3333-CCCC-CCCC-CCCC-CCCCCCCCCCCC",
            name: "x"
          }
        }
      })
    ) as unknown as XmcClient["graphql"];
    const client = makeClient({
      itemsByPath: {
        [PLUGIN_TEMPLATES_FOLDER]: {
          itemId: "plugin-folder-guid",
          path: PLUGIN_TEMPLATES_FOLDER,
          fields: {}
        }
      },
      graphql, createItem
    });
    const ids = await ensureFeatureTemplates({ client });
    // createTemplate resolves PLUGIN_TEMPLATES_FOLDER to
    // its itemId and passes that Guid as `parent`.
    const rawCalls = (graphql as unknown as {
      mock: { calls: Array<[string, { input: {
        parent: string; name: string;
      } }]> };
    }).mock.calls;
    expect(rawCalls).toHaveLength(2);
    for (const [, vars] of rawCalls) {
      expect(vars.input.parent).toBe("plugin-folder-guid");
    }
    const names = rawCalls.map(([, v]) => v.input.name);
    expect(names).toContain("BugReporterJiraSettings");
    expect(names).toContain("BugReport");
    expect(ids.settingsTemplateId).toBe(
      "{CCCC3333-CCCC-CCCC-CCCC-CCCCCCCCCCCC}"
    );
  });

  it("creates both templates via graphql mutation when absent", async () => {
    const createItem = vi.fn(async () => ({
      itemId: "folder", path: "/", fields: {}
    }));
    const graphql = vi.fn(
      async () => ({
        createItemTemplate: {
          itemTemplate: {
            templateId:
              "DDDD4444-DDDD-DDDD-DDDD-DDDDDDDDDDDD",
            name: "x"
          }
        }
      })
    ) as unknown as XmcClient["graphql"];
    const client = makeClient({
      itemsByPath: {
        [FEATURE_TEMPLATES_ROOT]: {
          itemId: "feature", path: FEATURE_TEMPLATES_ROOT,
          fields: {}
        },
        [PLUGIN_TEMPLATES_FOLDER]: {
          itemId: "plugin-folder",
          path: PLUGIN_TEMPLATES_FOLDER, fields: {}
        }
      },
      graphql, createItem
    });
    const ids = await ensureFeatureTemplates({ client });
    expect(graphql as unknown as ReturnType<typeof vi.fn>)
      .toHaveBeenCalledTimes(2);
    expect(ids.settingsTemplateId).toBe(
      "{DDDD4444-DDDD-DDDD-DDDD-DDDDDDDDDDDD}"
    );
    expect(ids.bugReportTemplateId).toBe(
      "{DDDD4444-DDDD-DDDD-DDDD-DDDDDDDDDDDD}"
    );
  });

  it("surfaces a clearer error when createItem reports a missing parent", async () => {
    const createItem = vi.fn(async () => {
      throw new Error("Parent item does not exist");
    });
    const client = makeClient({
      itemsByPath: {}, createItem
    });
    await expect(
      ensureFeatureTemplates({ client })
    ).rejects.toThrow(
      /Could not create .*BugReporterJira.*Verify/i
    );
  });
});
