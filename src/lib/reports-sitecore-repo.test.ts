import { describe, it, expect, vi } from "vitest";
import {
  createReportsSitecoreRepo
} from "./reports-sitecore-repo";
import type { XmcClient } from "@/services/sitecore/xmc";

const sample = {
  jiraKey: "SJP-7",
  jiraUrl: "https://jira/SJP-7",
  summary: "Broken tile",
  issueType: "Bug",
  reporter: { email: "r@x", name: "R" },
  page: {
    title: "Home", url: "https://s/", language: "en", site: "S"
  },
  rendering: {
    instanceId: "{11111111-1111-1111-1111-111111111111}",
    renderingId: "{22222222-2222-2222-2222-222222222222}",
    name: "Tile",
    templateName: "Tile",
    placeholderKey: "/main/tile"
  },
  datasourceId: "{33333333-3333-3333-3333-333333333333}",
  createdAt: "2026-04-16T12:00:00.000Z"
};

function fakeClient(
  overrides: Partial<XmcClient>
): XmcClient {
  return {
    getCurrentUser: vi.fn(),
    itemByPath: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    searchItems: vi.fn(),
    ...overrides
  } as XmcClient;
}

describe("reports-sitecore-repo", () => {
  it("append creates an item named after jiraKey", async () => {
    const createItem: XmcClient["createItem"] =
      vi.fn(async () => ({
        itemId: "x", path: "/p/x", fields: {}
      }));
    const repo = createReportsSitecoreRepo({
      client: fakeClient({ createItem })
    });
    await repo.append("T", "S", sample);
    expect(createItem).toHaveBeenCalledOnce();
    const call = (createItem as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(call?.name).toBe("SJP-7");
    expect(call?.parent).toBe(
      "/sitecore/content/T/S/Data/Bug Reports"
    );
    expect(call?.fields).toEqual(
      expect.arrayContaining([
        { name: "Ticket Key", value: "SJP-7" },
        { name: "Ticket URL",
          value: "https://jira/SJP-7" },
        { name: "Created At",
          value: "2026-04-16T12:00:00.000Z" }
      ])
    );
  });

  it("append treats duplicate-name errors as idempotent success", async () => {
    const createItem = vi.fn(async () => {
      throw new Error(
        "XMC GraphQL: Item name is not unique"
      );
    });
    const repo = createReportsSitecoreRepo({
      client: fakeClient({ createItem })
    });
    await expect(
      repo.append("T", "S", sample)
    ).resolves.toBeUndefined();
  });

  it("list maps search results to ReportRecord", async () => {
    const searchItems = vi.fn(async () => ({
      totalCount: 1,
      endCursor: null,
      hasNext: false,
      items: [{
        itemId: "x", path: "/p/x",
        fields: {
          "Ticket Key": "SJP-7",
          "Ticket URL": "https://jira/SJP-7",
          "Summary": "Broken tile",
          "Issue Type": "Bug",
          "Reporter": "R <r@x>",
          "Created At": "2026-04-16T12:00:00.000Z",
          "Page Item ID": "",
          "Page Path": "",
          "Rendering Instance ID": "",
          "Rendering Name": "",
          "Data Source Item ID": ""
        }
      }]
    }));
    const repo = createReportsSitecoreRepo({
      client: fakeClient({ searchItems })
    });
    const page = await repo.list("T", "S",
      { offset: 0, limit: 50 });
    expect(page.total).toBe(1);
    expect(page.items[0]?.jiraKey).toBe("SJP-7");
  });
});
