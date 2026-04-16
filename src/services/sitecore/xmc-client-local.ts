// In-memory local XmcClient implementation for dev-without-
// Sitecore workflows. Stores items + templates in a process-
// scoped tree on globalThis so they survive Next.js HMR.
// Activated via the factory in xmc-client-factory.ts when
// XMC_LOCAL_MODE=true. Zero relation to Redis or any external
// service.

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
  items: Map<string, LocalItem>; // keyed by path
};

type LocalStoreGlobals = {
  __jpLocalXmcStore?: LocalStore;
};
const G = globalThis as unknown as LocalStoreGlobals;

function store(): LocalStore {
  if (!G.__jpLocalXmcStore) {
    G.__jpLocalXmcStore = { items: new Map() };
    seedRootTree(G.__jpLocalXmcStore);
  }
  return G.__jpLocalXmcStore;
}

// Seed the Sitecore tree the plugin expects: Feature
// templates root, a demo tenant/site, Settings and Data
// folders, and the plugin's own Config + Bug Reports items
// so the datastore behaves as if it had already been
// through initial installation. Tests and local dev don't
// have to manually provision before using the settings or
// reports APIs.
function seedRootTree(s: LocalStore): void {
  const folderTpl =
    "{0437FEE2-44C9-46A6-ABE9-28858D9FEE8C}";
  const seedPaths = [
    "/sitecore",
    "/sitecore/templates",
    "/sitecore/templates/Feature",
    "/sitecore/content",
    "/sitecore/content/Demo",
    "/sitecore/content/Demo/dev-site",
    "/sitecore/content/Demo/dev-site/Settings",
    "/sitecore/content/Demo/dev-site/Settings/Bug Reporter for Jira",
    "/sitecore/content/Demo/dev-site/Settings/Bug Reporter for Jira/Config",
    "/sitecore/content/Demo/dev-site/Data",
    "/sitecore/content/Demo/dev-site/Data/Bug Reports"
  ];
  for (const path of seedPaths) {
    s.items.set(path, {
      itemId: fakeGuid(path),
      templateId: folderTpl,
      parent: path.substring(0, path.lastIndexOf("/")) || "/",
      path,
      name: path.substring(path.lastIndexOf("/") + 1) || "/",
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
      path: string
    ): Promise<SitecoreItem | null> {
      const item = store().items.get(path);
      if (!item) return null;
      return toSitecoreItem(item);
    },

    async createItem(
      args: CreateItemArgs
    ): Promise<SitecoreItem> {
      const path = `${args.parent}/${args.name}`;
      const existing = store().items.get(path);
      if (existing) {
        throw new Error(
          `XMC GraphQL: Item name is not unique at ${path}`
        );
      }
      const fields: Record<string, string> = {};
      for (const f of args.fields) fields[f.name] = f.value;
      const item: LocalItem = {
        itemId: fakeGuid(path),
        templateId: args.templateId,
        parent: args.parent,
        path,
        name: args.name,
        language: args.language,
        fields
      };
      store().items.set(path, item);
      return toSitecoreItem(item);
    },

    async updateItem(
      args: UpdateItemArgs
    ): Promise<SitecoreItem> {
      const target = Array.from(store().items.values())
        .find((it) => it.itemId === args.itemId);
      if (!target) {
        throw new Error(
          `XMC GraphQL: item ${args.itemId} not found`
        );
      }
      for (const f of args.fields) {
        target.fields[f.name] = f.value;
      }
      return toSitecoreItem(target);
    },

    async searchItems(
      args: SearchArgs
    ): Promise<SearchPage> {
      const rootPrefix = args.rootPath.endsWith("/")
        ? args.rootPath : `${args.rootPath}/`;
      const matches = Array.from(store().items.values())
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
        const path = `${input.parent}/${input.name}`;
        const item: LocalItem = {
          itemId: fakeGuid(path),
          templateId:
            "{TEMPLATE-TEMPLATE-BCDE-1111-222233334444}",
          parent: input.parent,
          path,
          name: input.name,
          language: "en",
          fields: { __Template: "true" }
        };
        store().items.set(path, item);
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
