import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ReportsStore, ReportRecordSchema,
  resetReportsStoreForTests,
  type ReportRecord
} from "./reports-store";

const baseRecord: ReportRecord = {
  jiraKey: "CLD-1",
  jiraUrl: "https://x.atlassian.net/browse/CLD-1",
  summary: "Hero banner broken",
  issueType: "Bug",
  reporter: { email: "alice@co.com", name: "Alice" },
  page: {
    title: "Home", url: "https://site.com/",
    language: "en", site: "default"
  },
  rendering: {
    instanceId: "r-1", renderingId: "rend-1",
    name: "HeroBanner", templateName: "Hero"
  },
  datasourceId: "{GUID}",
  createdAt: "2026-04-16T00:00:00.000Z"
};

describe("ReportRecordSchema", () => {
  it("accepts a valid record", () => {
    expect(() =>
      ReportRecordSchema.parse(baseRecord)
    ).not.toThrow();
  });

  it("rejects missing jiraKey", () => {
    expect(() => ReportRecordSchema.parse({
      ...baseRecord, jiraKey: ""
    })).toThrow();
  });

  it("allows null reporter/page/rendering", () => {
    const parsed = ReportRecordSchema.parse({
      ...baseRecord,
      reporter: null, page: null, rendering: null,
      datasourceId: null
    });
    expect(parsed.reporter).toBeNull();
  });
});

describe("ReportsStore (memory)", () => {
  let store: ReportsStore;
  beforeEach(() => {
    resetReportsStoreForTests();
    store = new ReportsStore({
      driver: "memory", maxRecords: 3
    });
  });

  it("returns empty list for unknown tenant", async () => {
    const page = await store.list("acme");
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("appends newest-first per tenant", async () => {
    await store.append("acme", {
      ...baseRecord, jiraKey: "CLD-1",
      createdAt: "2026-04-16T00:00:00.000Z"
    });
    await store.append("acme", {
      ...baseRecord, jiraKey: "CLD-2",
      createdAt: "2026-04-16T00:01:00.000Z"
    });
    const page = await store.list("acme");
    expect(page.items.map((r) => r.jiraKey))
      .toEqual(["CLD-2", "CLD-1"]);
    expect(page.total).toBe(2);
  });

  it("isolates tenants", async () => {
    await store.append("acme", {
      ...baseRecord, jiraKey: "A-1"
    });
    await store.append("globex", {
      ...baseRecord, jiraKey: "G-1"
    });
    const a = await store.list("acme");
    const g = await store.list("globex");
    expect(a.items.map((r) => r.jiraKey)).toEqual(["A-1"]);
    expect(g.items.map((r) => r.jiraKey)).toEqual(["G-1"]);
  });

  it("caps list at maxRecords", async () => {
    for (let i = 1; i <= 5; i++) {
      await store.append("acme", {
        ...baseRecord, jiraKey: `CLD-${i}`
      });
    }
    const page = await store.list("acme");
    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.jiraKey))
      .toEqual(["CLD-5", "CLD-4", "CLD-3"]);
  });

  it("paginates with offset and limit", async () => {
    for (let i = 1; i <= 3; i++) {
      await store.append("acme", {
        ...baseRecord, jiraKey: `CLD-${i}`
      });
    }
    const page = await store.list("acme",
      { offset: 1, limit: 1 });
    expect(page.items.map((r) => r.jiraKey))
      .toEqual(["CLD-2"]);
    expect(page.total).toBe(3);
    expect(page.offset).toBe(1);
    expect(page.limit).toBe(1);
  });

  it("rejects invalid tenantId on append", async () => {
    await expect(store.append("bad id!", baseRecord))
      .rejects.toThrow(/invalid tenantId/);
  });

  it("rejects invalid tenantId on list", async () => {
    await expect(store.list("bad id!"))
      .rejects.toThrow(/invalid tenantId/);
  });

  it("rejects schema-invalid record on append", async () => {
    await expect(store.append("acme", {
      ...baseRecord, jiraKey: ""
    } as ReportRecord)).rejects.toThrow();
  });

  it("invokes onWrite/onRead hooks", async () => {
    let reads = 0, writes = 0;
    const s = new ReportsStore({
      driver: "memory", maxRecords: 10,
      onRead: () => { reads += 1; },
      onWrite: () => { writes += 1; }
    });
    await s.append("acme", baseRecord);
    await s.list("acme");
    expect(writes).toBe(1);
    expect(reads).toBe(1);
  });
});

describe("ReportsStore — sitecore driver", () => {
  const rec: ReportRecord = {
    jiraKey: "SJP-1", jiraUrl: "u", summary: "s",
    issueType: "Bug",
    reporter: { email: "r@x", name: "R" },
    page: null, rendering: null, datasourceId: null,
    createdAt: "2026-04-16T00:00:00Z"
  };

  it("append delegates to the Sitecore repo", async () => {
    const repo = {
      append: vi.fn(),
      list: vi.fn()
    };
    const store = new ReportsStore({
      driver: "sitecore",
      maxRecords: 500,
      sitecore: {
        tenant: "T", site: "S",
        getRepo: async () => repo
      }
    });
    await store.append("T:S", rec);
    expect(repo.append).toHaveBeenCalledWith("T", "S", rec);
  });

  it("list delegates and returns the page", async () => {
    const repo = {
      append: vi.fn(),
      list: vi.fn(async () => ({
        items: [rec], total: 1, offset: 0, limit: 50
      }))
    };
    const store = new ReportsStore({
      driver: "sitecore",
      maxRecords: 500,
      sitecore: {
        tenant: "T", site: "S",
        getRepo: async () => repo
      }
    });
    const page = await store.list("T:S",
      { offset: 0, limit: 50 });
    expect(page.items).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith(
      "T", "S", { offset: 0, limit: 50 }
    );
  });
});
