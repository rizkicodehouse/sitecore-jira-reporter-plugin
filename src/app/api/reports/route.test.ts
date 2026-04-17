import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { GET } from "./route";
import {
  getReportsStore, resetReportsStoreForTests,
  type ReportRecord
} from "@/lib/reports-store";
import { auth0 } from "@/lib/auth0";

vi.mock("@/lib/auth0", () => ({
  auth0: { getSession: vi.fn() }
}));

const getSessionMock = vi.mocked(auth0.getSession);

const baseRecord: ReportRecord = {
  jiraKey: "CLD-1",
  jiraUrl: "https://x.atlassian.net/browse/CLD-1",
  summary: "Broken hero",
  issueType: "Bug",
  reporter: { email: "a@b.com", name: "Alice" },
  page: {
    title: "Home", url: "/",
    language: "en", site: "default"
  },
  rendering: null,
  datasourceId: null,
  createdAt: "2026-04-16T00:00:00.000Z"
};

const mkReq = (qs: string = "") =>
  new Request(`http://x/api/reports${qs}`, {
    headers: { "X-Tenant-Id": "acme" }
  });

describe("GET /api/reports", () => {
  beforeEach(() => {
    resetReportsStoreForTests();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      user: { email: "dev@local", name: "Dev" }
    } as never);
  });

  it("401 without session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const res = await GET(
      new Request("http://x/api/reports")
    );
    expect(res.status).toBe(401);
  });

  it("400 without tenant", async () => {
    const res = await GET(
      new Request("http://x/api/reports")
    );
    expect(res.status).toBe(400);
  });

  it("returns empty list when no reports", async () => {
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns appended reports newest-first", async () => {
    const store = getReportsStore();
    await store.append("acme", {
      ...baseRecord, jiraKey: "CLD-1"
    });
    await store.append("acme", {
      ...baseRecord, jiraKey: "CLD-2"
    });
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((r: ReportRecord) => r.jiraKey))
      .toEqual(["CLD-2", "CLD-1"]);
    expect(body.total).toBe(2);
  });

  it("respects offset and limit query params",
     async () => {
    const store = getReportsStore();
    for (let i = 1; i <= 4; i++) {
      await store.append("acme", {
        ...baseRecord, jiraKey: `CLD-${i}`
      });
    }
    const res = await GET(mkReq("?offset=1&limit=2"));
    const body = await res.json();
    expect(body.items.map((r: ReportRecord) => r.jiraKey))
      .toEqual(["CLD-3", "CLD-2"]);
    expect(body.total).toBe(4);
    expect(body.offset).toBe(1);
    expect(body.limit).toBe(2);
  });

  it("clamps limit to max", async () => {
    const res = await GET(mkReq("?limit=9999"));
    const body = await res.json();
    expect(body.limit).toBe(100);
  });

  it("falls back to defaults on non-numeric params",
     async () => {
    const res = await GET(mkReq("?offset=abc&limit=xyz"));
    const body = await res.json();
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(50);
  });

  it("isolates tenants", async () => {
    const store = getReportsStore();
    await store.append("acme", {
      ...baseRecord, jiraKey: "A-1"
    });
    await store.append("globex", {
      ...baseRecord, jiraKey: "G-1"
    });
    const other = new Request(
      "http://x/api/reports",
      { headers: { "X-Tenant-Id": "globex" } }
    );
    const res = await GET(other);
    const body = await res.json();
    expect(body.items.map((r: ReportRecord) => r.jiraKey))
      .toEqual(["G-1"]);
  });
});
