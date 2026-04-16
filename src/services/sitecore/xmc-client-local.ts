// Local XmcClient implementation for dev-without-Sitecore
// workflows. Stores items + templates in a process-scoped
// tree hoisted onto globalThis (survives Next.js HMR). When
// NODE_ENV !== "test" the tree is also persisted to a JSON
// file on disk so settings + tickets survive `next dev`
// restarts and ngrok-facing sessions.
//
// Activated via the factory in xmc-client-factory.ts when
// XMC_LOCAL_MODE=true. Zero relation to Redis or any
// external service.

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  XmcClient, SitecoreItem, CreateItemArgs,
  UpdateItemArgs, SearchArgs, SearchPage
} from "./xmc";

type LocalItem = {
  itemId: string;
  templateId: string;
  parent: string;
  path: string;
  name: string;
  language: string;
  fields: Record<string, string>;
};

type LocalStore = {
  items: Map<string, LocalItem>;
  hydrated: boolean;
  writeChain: Promise<void>;
};

type LocalStoreGlobals = {
  __jpLocalXmcStore?: LocalStore;
};
const G = globalThis as unknown as LocalStoreGlobals;

const DEFAULT_STATE_DIR = ".xmc-local";
const DEFAULT_STATE_FILE = "state.json";

function stateFilePath(): string {
  if (process.env.XMC_LOCAL_STATE_FILE) {
    return process.env.XMC_LOCAL_STATE_FILE;
  }
  return path.join(
    process.cwd(), DEFAULT_STATE_DIR, DEFAULT_STATE_FILE
  );
}

function usesDiskPersistence(): boolean {
  // Tests must stay pure-memory so fixtures don't leak
  // between runs and CI doesn't accumulate state on disk.
  return process.env.NODE_ENV !== "test";
}

function rawStore(): LocalStore {
  if (!G.__jpLocalXmcStore) {
    G.__jpLocalXmcStore = {
      items: new Map(),
      hydrated: false,
      writeChain: Promise.resolve()
    };
  }
  return G.__jpLocalXmcStore;
}

async function hydrate(s: LocalStore): Promise<void> {
  if (s.hydrated) return;
  if (!usesDiskPersistence()) {
    seedRootTree(s);
    s.hydrated = true;
    return;
  }
  const file = stateFilePath();
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as {
      version: number;
      items: LocalItem[];
    };
    s.items.clear();
    for (const item of parsed.items ?? []) {
      s.items.set(item.path, item);
    }
    s.hydrated = true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      // Corrupt or unreadable state file — log but recover
      // by re-seeding. Never lose the ability to boot.
      // eslint-disable-next-line no-console
      console.warn(
        `[xmc-local] unable to read ${file}: ${(e as Error).message}. ` +
        `Re-seeding.`
      );
    }
    seedRootTree(s);
    s.hydrated = true;
    await persist(s);
  }
}

// Atomic write through a per-process promise chain so
// concurrent mutations from ngrok / localhost don't
// interleave half-written JSON.
async function persist(s: LocalStore): Promise<void> {
  if (!usesDiskPersistence()) return;
  s.writeChain = s.writeChain.then(() => doPersist(s));
  return s.writeChain;
}

async function doPersist(s: LocalStore): Promise<void> {
  const file = stateFilePath();
  const dir = path.dirname(file);
  await fs.promises.mkdir(dir, { recursive: true });
  const payload = {
    version: 1,
    items: Array.from(s.items.values())
  };
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(
    tmp, JSON.stringify(payload, null, 2), "utf8"
  );
  await fs.promises.rename(tmp, file);
}

async function store(): Promise<LocalStore> {
  const s = rawStore();
  await hydrate(s);
  return s;
}

// Seed only the scaffolding the installer expects to find:
// Sitecore roots, the Feature templates folder, and the
// demo site. Deliberately DO NOT pre-create Settings /
// Data subtrees or the plugin's Config + Bug Reports items
// — those must come from provisionPluginSite so the
// first-install CTA actually runs end-to-end in local
// mode, the same way it would against a real Sitecore
// tenant. The provisioner writes everything back through
// the local mock and persists it to state.json, so after
// the first install the state survives restarts.
function seedRootTree(s: LocalStore): void {
  const folderTpl =
    "{0437FEE2-44C9-46A6-ABE9-28858D9FEE8C}";
  const seedPaths = [
    "/sitecore",
    "/sitecore/templates",
    "/sitecore/templates/Feature",
    "/sitecore/content",
    "/sitecore/content/Demo",
    "/sitecore/content/Demo/dev-site"
  ];
  for (const itemPath of seedPaths) {
    s.items.set(itemPath, {
      itemId: fakeGuid(itemPath),
      templateId: folderTpl,
      parent: itemPath.substring(
        0, itemPath.lastIndexOf("/")
      ) || "/",
      path: itemPath,
      name: itemPath.substring(
        itemPath.lastIndexOf("/") + 1
      ) || "/",
      language: "en",
      fields: {}
    });
  }
}

function fakeGuid(seed: string): string {
  // Deterministic pseudo-GUID so existing items keep stable
  // IDs across restarts.
  let h = 0;
  for (const ch of seed) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  return `${hex}-${hex.slice(0, 4)}-${hex.slice(0, 4)}-` +
    `${hex.slice(0, 4)}-${hex}${hex.slice(0, 4)}`
      .toUpperCase();
}

export function createLocalXmcClient(): XmcClient {
  return {
    async getCurrentUser() {
      return { name: "Local Dev", email: "dev@local" };
    },

    async itemByPath(
      itemPath: string
    ): Promise<SitecoreItem | null> {
      const s = await store();
      const item = s.items.get(itemPath);
      if (!item) return null;
      return toSitecoreItem(item);
    },

    async createItem(
      args: CreateItemArgs
    ): Promise<SitecoreItem> {
      const s = await store();
      const itemPath = `${args.parent}/${args.name}`;
      const existing = s.items.get(itemPath);
      if (existing) {
        throw new Error(
          `XMC GraphQL: Item name is not unique at ${itemPath}`
        );
      }
      const fields: Record<string, string> = {};
      for (const f of args.fields) fields[f.name] = f.value;
      const item: LocalItem = {
        itemId: fakeGuid(itemPath),
        templateId: args.templateId,
        parent: args.parent,
        path: itemPath,
        name: args.name,
        language: args.language,
        fields
      };
      s.items.set(itemPath, item);
      await persist(s);
      return toSitecoreItem(item);
    },

    async updateItem(
      args: UpdateItemArgs
    ): Promise<SitecoreItem> {
      const s = await store();
      const target = Array.from(s.items.values())
        .find((it) => it.itemId === args.itemId);
      if (!target) {
        throw new Error(
          `XMC GraphQL: item ${args.itemId} not found`
        );
      }
      for (const f of args.fields) {
        target.fields[f.name] = f.value;
      }
      await persist(s);
      return toSitecoreItem(target);
    },

    async searchItems(
      args: SearchArgs
    ): Promise<SearchPage> {
      const s = await store();
      const rootPrefix = args.rootPath.endsWith("/")
        ? args.rootPath : `${args.rootPath}/`;
      const matches = Array.from(s.items.values())
        .filter((it) =>
          it.path.startsWith(rootPrefix) &&
          normaliseTemplateId(it.templateId)
            === normaliseTemplateId(args.templateId))
        .sort((a, b) =>
          (b.fields["Created At"] ?? "")
            .localeCompare(a.fields["Created At"] ?? ""));
      const start = args.after
        ? Number.parseInt(args.after, 10) || 0 : 0;
      const page = matches.slice(start, start + args.first);
      const endIndex = start + page.length;
      return {
        totalCount: matches.length,
        endCursor: endIndex >= matches.length
          ? null : String(endIndex),
        hasNext: endIndex < matches.length,
        items: page.map(toSitecoreItem)
      };
    },

    async graphql<T = unknown>(
      query: string,
      variables?: Record<string, unknown>
    ): Promise<T> {
      // Minimal mock: only supports createItemTemplate (used
      // by template-provision on first bootstrap). Other
      // arbitrary GraphQL isn't needed for local workflows.
      if (query.includes("createItemTemplate")) {
        const input = (variables as {
          input?: { name: string; parent: string };
        })?.input;
        if (!input) throw new Error("mock: missing input");
        const s = await store();
        const itemPath = `${input.parent}/${input.name}`;
        const item: LocalItem = {
          itemId: fakeGuid(itemPath),
          templateId:
            "{TEMPLATE-TEMPLATE-BCDE-1111-222233334444}",
          parent: input.parent,
          path: itemPath,
          name: input.name,
          language: "en",
          fields: { __Template: "true" }
        };
        s.items.set(itemPath, item);
        await persist(s);
        return {
          createItemTemplate: {
            itemTemplate: {
              templateId: item.itemId,
              name: item.name
            }
          }
        } as unknown as T;
      }
      throw new Error(
        `local XMC mock: unsupported graphql query`
      );
    }
  };
}

function toSitecoreItem(it: LocalItem): SitecoreItem {
  return {
    itemId: it.itemId,
    name: it.name,
    path: it.path,
    fields: { ...it.fields }
  };
}

function normaliseTemplateId(id: string): string {
  return id.replace(/[{}]/g, "").toUpperCase();
}

export function resetLocalXmcStoreForTests(): void {
  G.__jpLocalXmcStore = undefined;
}
