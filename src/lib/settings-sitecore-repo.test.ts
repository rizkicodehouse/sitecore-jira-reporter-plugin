import { describe, it, expect, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./settings-store";
import {
  createSettingsSitecoreRepo
} from "./settings-sitecore-repo";
import type { XmcClient } from "@/services/sitecore/xmc";

// Helper: builds a minimal XmcClient stub. All methods
// default to throwing so tests have to opt into behaviour.

function fakeClient(
  overrides: Partial<XmcClient>
): XmcClient {
  return {
    getCurrentUser: vi.fn(),
    itemByPath: vi.fn(async () => null),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    searchItems: vi.fn(),
    ...overrides
  } as XmcClient;
}

describe("settings-sitecore-repo", () => {
  it("exists returns false when item is absent", async () => {
    const repo = createSettingsSitecoreRepo({
      client: fakeClient({})
    });
    expect(await repo.exists("T", "S")).toBe(false);
  });

  it("exists returns true when item is present", async () => {
    const repo = createSettingsSitecoreRepo({
      client: fakeClient({
        itemByPath: vi.fn(async () => ({
          itemId: "abc", path: "/p", fields: {}
        }))
      })
    });
    expect(await repo.exists("T", "S")).toBe(true);
  });

  it("read returns DEFAULT_SETTINGS when item missing", async () => {
    const repo = createSettingsSitecoreRepo({
      client: fakeClient({})
    });
    const out = await repo.read("T", "S");
    expect(out).toEqual(DEFAULT_SETTINGS);
  });

  it("read parses fields from the Config item", async () => {
    const repo = createSettingsSitecoreRepo({
      client: fakeClient({
        itemByPath: vi.fn(async () => ({
          itemId: "abc",
          path: "/sitecore/content/T/S/Settings/Bug Reporter for Jira/Config",
          fields: {
            "Project Key": "SJP",
            "Default Issue Type": "Bug",
            "Default Labels": "page-builder,urgent",
            "Default Assignee Account Id": "",
            "Target Board ID": "42",
            "Jira Base URL": "https://jira",
            "Service Account Email": "svc@x",
            "API Token (Encrypted)": "ENCBLOB",
            "Admin Emails": "a@x,b@x"
          }
        }))
      })
    });
    const out = await repo.read("T", "S");
    expect(out.projectKey).toBe("SJP");
    expect(out.defaultLabels).toEqual(
      ["page-builder", "urgent"]
    );
    expect(out.defaultBoardId).toBe(42);
    expect(out.jiraApiTokenEnc).toBe("ENCBLOB");
    expect(out.adminEmails).toEqual(["a@x", "b@x"]);
  });

  it("write calls updateItem when item exists", async () => {
    const updateItem: XmcClient["updateItem"] =
      vi.fn(async () => ({
        itemId: "abc", path: "/p", fields: {}
      }));
    const repo = createSettingsSitecoreRepo({
      client: fakeClient({
        itemByPath: vi.fn(async () => ({
          itemId: "abc", path: "/p", fields: {}
        })),
        updateItem
      })
    });
    await repo.write("T", "S", {
      ...DEFAULT_SETTINGS,
      projectKey: "SJP",
      jiraApiTokenEnc: "ENC"
    });
    expect(updateItem).toHaveBeenCalledOnce();
    const call = (updateItem as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(call?.itemId).toBe("abc");
    expect(call?.fields).toEqual(
      expect.arrayContaining([
        { name: "Project Key", value: "SJP" },
        { name: "API Token (Encrypted)", value: "ENC" }
      ])
    );
  });

  it("write throws ItemMissing when Config is absent", async () => {
    const repo = createSettingsSitecoreRepo({
      client: fakeClient({
        itemByPath: vi.fn(async () => null)
      })
    });
    await expect(
      repo.write("T", "S", DEFAULT_SETTINGS)
    ).rejects.toThrow(/not provisioned/);
  });
});
