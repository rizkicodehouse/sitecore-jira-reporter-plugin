// src/lib/settings-store.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import {
  SettingsStore, SettingsSchema
} from "./settings-store";

describe("SettingsSchema", () => {
  it("accepts a valid settings object", () => {
    const parsed = SettingsSchema.parse({
      projectKey: "CLD",
      defaultIssueType: "Bug",
      defaultLabels: ["page-builder"],
      defaultAssigneeAccountId: null
    });
    expect(parsed.projectKey).toBe("CLD");
  });

  it("rejects empty projectKey", () => {
    expect(() => SettingsSchema.parse({
      projectKey: "",
      defaultIssueType: "Bug",
      defaultLabels: [],
      defaultAssigneeAccountId: null
    })).toThrow();
  });
});

describe("SettingsStore (in-memory driver)", () => {
  let store: SettingsStore;
  beforeEach(() => {
    store = new SettingsStore({
      driver: "memory", cacheMs: 10
    });
  });

  it("returns defaults when nothing stored", async () => {
    const s = await store.get();
    expect(s.projectKey).toBe("CLD");
  });

  it("round-trips settings through put", async () => {
    await store.put({
      projectKey: "OPS",
      defaultIssueType: "Task",
      defaultLabels: ["x"],
      defaultAssigneeAccountId: null
    });
    const s = await store.get();
    expect(s.projectKey).toBe("OPS");
    expect(s.defaultIssueType).toBe("Task");
  });

  it("caches reads for cacheMs then refreshes", async () => {
    const driver = { reads: 0 };
    const s = new SettingsStore({
      driver: "memory", cacheMs: 20,
      onRead: () => { driver.reads += 1; }
    });
    await s.get();
    await s.get();
    expect(driver.reads).toBe(1);
    await new Promise((r) => setTimeout(r, 25));
    await s.get();
    expect(driver.reads).toBe(2);
  });
});
