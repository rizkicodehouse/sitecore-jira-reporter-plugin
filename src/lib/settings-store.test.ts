// src/lib/settings-store.test.ts
import {
  describe, it, expect, beforeEach, beforeAll
} from "vitest";
import { randomBytes } from "node:crypto";
import {
  SettingsStore, SettingsUpdateSchema, DEFAULT_SETTINGS,
  resetSettingsStoreForTests
} from "./settings-store";
import { resetCryptoForTests } from "./crypto";

beforeAll(() => {
  // Test both paths in CI: explicit env key here; the
  // auto-ephemeral dev path is covered by
  // crypto.test.ts.
  process.env.SETTINGS_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
  resetCryptoForTests();
});

const baseUpdate = {
  projectKey: "OPS",
  defaultIssueType: "Task",
  defaultLabels: ["x"],
  defaultAssigneeAccountId: null,
  defaultBoardId: null,
  jiraBaseUrl: "https://example.atlassian.net",
  jiraServiceEmail: "svc@x.com",
  adminEmails: ["alice@co.com"]
};

describe("SettingsUpdateSchema", () => {
  it("accepts a valid update", () => {
    const parsed = SettingsUpdateSchema.parse({
      ...baseUpdate,
      jiraApiToken: "ATLASSIAN-SECRET"
    });
    expect(parsed.projectKey).toBe("OPS");
  });

  it("rejects empty projectKey", () => {
    expect(() => SettingsUpdateSchema.parse({
      ...baseUpdate, projectKey: ""
    })).toThrow();
  });

  it("rejects non-URL jiraBaseUrl", () => {
    expect(() => SettingsUpdateSchema.parse({
      ...baseUpdate, jiraBaseUrl: "not-a-url"
    })).toThrow();
  });
});

describe("SettingsStore (in-memory driver)", () => {
  let store: SettingsStore;
  beforeEach(() => {
    resetSettingsStoreForTests();
    store = new SettingsStore({
      driver: "memory", cacheMs: 10
    });
  });

  it("returns defaults for an unknown tenant", async () => {
    const s = await store.get("acme");
    expect(s.projectKey).toBe(DEFAULT_SETTINGS.projectKey);
    expect(s.jiraApiTokenEnc).toBeNull();
  });

  it("round-trips settings per tenant", async () => {
    await store.put("acme", {
      ...baseUpdate,
      jiraApiToken: "SECRET-1"
    });
    const pub = await store.getPublic("acme");
    expect(pub.projectKey).toBe("OPS");
    expect(pub.hasJiraApiToken).toBe(true);
    const other = await store.getPublic("globex");
    expect(other.projectKey).toBe(DEFAULT_SETTINGS.projectKey);
  });

  it("encrypted token survives round-trip decrypt", async () => {
    await store.put("acme", {
      ...baseUpdate,
      jiraApiToken: "SECRET-1"
    });
    const plain = await store
      .getDecryptedApiToken("acme");
    expect(plain).toBe("SECRET-1");
  });

  it("keeps existing token when update omits it",
     async () => {
    await store.put("acme", {
      ...baseUpdate, jiraApiToken: "SECRET-1"
    });
    await store.put("acme", {
      ...baseUpdate, projectKey: "NEW"
    });
    const plain = await store
      .getDecryptedApiToken("acme");
    expect(plain).toBe("SECRET-1");
  });

  it("rejects invalid tenantId", async () => {
    await expect(store.get("bad id!"))
      .rejects.toThrow(/invalid tenantId/);
  });

  it("caches reads for cacheMs then refreshes", async () => {
    const driver = { reads: 0 };
    const s = new SettingsStore({
      driver: "memory", cacheMs: 20,
      onRead: () => { driver.reads += 1; }
    });
    await s.get("acme");
    await s.get("acme");
    expect(driver.reads).toBe(1);
    await new Promise((r) => setTimeout(r, 25));
    await s.get("acme");
    expect(driver.reads).toBe(2);
  });
});
