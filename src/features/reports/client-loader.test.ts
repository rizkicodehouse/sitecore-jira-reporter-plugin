import { describe, it, expect, vi } from "vitest";
import type { XmcClient } from "@/services/sitecore/xmc";
import { loadReportsFromXmc } from "./client-loader";
import { REPORT_FIELD } from "@/services/sitecore/templates";

function makeClient(
  handler: (args: {
    rootPath: string; templateId: string;
    first: number; after?: string;
  }) => {
    totalCount: number;
    endCursor: string | null;
    hasNext: boolean;
    items: Array<{
      itemId: string; path: string;
      fields: Record<string, string>;
    }>;
  }
): XmcClient {
  return {
    searchItems: vi.fn(async (a) => handler(a)),
    itemByPath: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    getCurrentUser: vi.fn(),
    graphql: vi.fn()
  } as unknown as XmcClient;
}

function recordFields(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    [REPORT_FIELD.ticketKey]: "CLD-1",
    [REPORT_FIELD.ticketUrl]: "https://x.atlassian.net/browse/CLD-1",
    [REPORT_FIELD.summary]: "Header broken",
    [REPORT_FIELD.issueType]: "Bug",
    [REPORT_FIELD.reporter]: "Alice <a@x>",
    [REPORT_FIELD.pagePath]: "/home",
    [REPORT_FIELD.pageTitle]: "Home",
    [REPORT_FIELD.createdAt]: "2026-04-17T00:00:00Z",
    ...overrides
  };
}

describe("loadReportsFromXmc", () => {
  it("searches under /sitecore/content and returns parsed records", async () => {
    const client = makeClient(() => ({
      totalCount: 1,
      endCursor: null,
      hasNext: false,
      items: [{
        itemId: "id-1", path: "/sitecore/content/x/y/z",
        fields: recordFields()
      }]
    }));
    const page = await loadReportsFromXmc(
      client, { offset: 0, limit: 50 }
    );
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.jiraKey).toBe("CLD-1");
    expect(page.items[0]?.reporter?.email).toBe("a@x");
    const call = (client.searchItems as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0];
    expect(call.rootPath).toBe("/sitecore/content");
  });

  it("slices by offset + limit across pages", async () => {
    const allItems = Array.from(
      { length: 150 },
      (_, i) => ({
        itemId: `id-${i}`,
        path: `/sitecore/content/x/y/z/${i}`,
        fields: recordFields({
          [REPORT_FIELD.ticketKey]: `CLD-${i}`
        })
      })
    );
    let callCount = 0;
    const client = makeClient(({ first, after }) => {
      const start = after ? Number(after) : 0;
      const slice = allItems.slice(start, start + first);
      const nextCursor =
        start + first < allItems.length
          ? String(start + first) : null;
      callCount += 1;
      return {
        totalCount: allItems.length,
        endCursor: nextCursor,
        hasNext: nextCursor !== null,
        items: slice
      };
    });
    const page = await loadReportsFromXmc(
      client, { offset: 100, limit: 20 }
    );
    expect(page.total).toBe(150);
    expect(page.items).toHaveLength(20);
    expect(page.items[0]?.jiraKey).toBe("CLD-100");
    expect(page.items[19]?.jiraKey).toBe("CLD-119");
    expect(callCount).toBeGreaterThan(1);
  });

  it("drops records that fail schema validation", async () => {
    const client = makeClient(() => ({
      totalCount: 2,
      endCursor: null,
      hasNext: false,
      items: [
        { itemId: "ok", path: "/a",
          fields: recordFields() },
        { itemId: "bad", path: "/b",
          fields: recordFields({
            [REPORT_FIELD.ticketKey]: ""
          }) }
      ]
    }));
    const page = await loadReportsFromXmc(
      client, { offset: 0, limit: 50 }
    );
    expect(page.items).toHaveLength(1);
  });
});
