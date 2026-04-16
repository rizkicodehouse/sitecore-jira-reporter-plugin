import {
  describe, it, expect, beforeEach, afterEach
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createLocalXmcClient,
  resetLocalXmcStoreForTests
} from "./xmc-client-local";

describe("xmc-client-local — disk persistence", () => {
  let tmpDir: string;
  let stateFile: string;
  let originalEnv: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "xmc-local-")
    );
    stateFile = path.join(tmpDir, "state.json");
    originalEnv = process.env.XMC_LOCAL_STATE_FILE;
    originalNodeEnv = process.env.NODE_ENV;
    process.env.XMC_LOCAL_STATE_FILE = stateFile;
    // Persistence is gated on NODE_ENV !== "test". Unset so
    // the file-backed path activates.
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    resetLocalXmcStoreForTests();
  });

  afterEach(() => {
    resetLocalXmcStoreForTests();
    if (originalEnv === undefined) {
      delete process.env.XMC_LOCAL_STATE_FILE;
    } else {
      process.env.XMC_LOCAL_STATE_FILE = originalEnv;
    }
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>)
        .NODE_ENV = originalNodeEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the state file with the seed tree on first use", async () => {
    const client = createLocalXmcClient();
    await client.itemByPath(
      "/sitecore/content/Demo/dev-site"
    );
    expect(fs.existsSync(stateFile)).toBe(true);
    const raw = JSON.parse(
      fs.readFileSync(stateFile, "utf8")
    );
    expect(raw.version).toBe(1);
    const paths = raw.items.map(
      (it: { path: string }) => it.path
    );
    expect(paths).toContain(
      "/sitecore/content/Demo/dev-site/Settings/Bug Reporter for Jira/Config"
    );
  });

  it("persists createItem and rehydrates after a reset", async () => {
    const first = createLocalXmcClient();
    await first.createItem({
      name: "SJP-7",
      parent:
        "/sitecore/content/Demo/dev-site/Data/Bug Reports",
      templateId: "{BUG-REPORT-TEMPLATE}",
      language: "en",
      fields: [
        { name: "Ticket Key", value: "SJP-7" },
        { name: "Summary", value: "Broken tile" }
      ]
    });
    // Simulate a process restart by clearing the in-memory
    // cache while leaving the state file on disk.
    resetLocalXmcStoreForTests();
    const second = createLocalXmcClient();
    const hydrated = await second.itemByPath(
      "/sitecore/content/Demo/dev-site/Data/Bug Reports/SJP-7"
    );
    expect(hydrated).not.toBeNull();
    expect(hydrated?.fields["Ticket Key"]).toBe("SJP-7");
    expect(hydrated?.fields["Summary"]).toBe("Broken tile");
  });

  it("persists updateItem changes", async () => {
    const client = createLocalXmcClient();
    const created = await client.createItem({
      name: "Item-1",
      parent: "/sitecore/content/Demo/dev-site/Data/Bug Reports",
      templateId: "{T}",
      language: "en",
      fields: [{ name: "Summary", value: "original" }]
    });
    await client.updateItem({
      itemId: created.itemId,
      language: "en",
      fields: [{ name: "Summary", value: "updated" }]
    });
    resetLocalXmcStoreForTests();
    const reread = createLocalXmcClient();
    const hydrated = await reread.itemByPath(
      "/sitecore/content/Demo/dev-site/Data/Bug Reports/Item-1"
    );
    expect(hydrated?.fields["Summary"]).toBe("updated");
  });

  it("recovers from a corrupt state file by re-seeding", async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(stateFile, "{ not json", "utf8");
    const client = createLocalXmcClient();
    const root = await client.itemByPath(
      "/sitecore/content/Demo/dev-site"
    );
    expect(root).not.toBeNull();
    // File rewritten with valid JSON after recovery.
    const raw = JSON.parse(
      fs.readFileSync(stateFile, "utf8")
    );
    expect(raw.version).toBe(1);
  });
});

describe("xmc-client-local — test mode stays pure-memory", () => {
  beforeEach(() => {
    resetLocalXmcStoreForTests();
    (process.env as Record<string, string | undefined>)
      .NODE_ENV = "test";
  });

  afterEach(() => {
    resetLocalXmcStoreForTests();
  });

  it("does not write a state file under NODE_ENV=test", async () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "xmc-test-")
    );
    const stateFile = path.join(tmp, "state.json");
    const prevEnv = process.env.XMC_LOCAL_STATE_FILE;
    process.env.XMC_LOCAL_STATE_FILE = stateFile;
    try {
      const client = createLocalXmcClient();
      await client.itemByPath(
        "/sitecore/content/Demo/dev-site"
      );
      expect(fs.existsSync(stateFile)).toBe(false);
    } finally {
      if (prevEnv === undefined) {
        delete process.env.XMC_LOCAL_STATE_FILE;
      } else {
        process.env.XMC_LOCAL_STATE_FILE = prevEnv;
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
