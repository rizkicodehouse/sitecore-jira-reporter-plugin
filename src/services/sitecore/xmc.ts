import {
  ITEM_BY_PATH_QUERY,
  CREATE_ITEM_MUTATION,
  UPDATE_ITEM_MUTATION,
  SEARCH_ITEMS_QUERY
} from "./xmc-mutations";

export const GET_ME_QUERY = `query Me {
  me { name email }
}`;

export type XmcClientOptions = {
  baseUrl: string;
  token: string;
  sitecoreContextId?: string;
  fetch?: typeof fetch;
};

export type SitecoreField = { name: string; value: string };

export type SitecoreItem = {
  itemId: string;
  name?: string;
  path: string;
  fields: Record<string, string>;
};

export type CreateItemArgs = {
  name: string;
  parent: string;
  templateId: string;
  language: string;
  fields: SitecoreField[];
};

export type UpdateItemArgs = {
  itemId: string;
  language: string;
  fields: SitecoreField[];
};

export type SearchArgs = {
  rootPath: string;
  templateId: string;
  first: number;
  after?: string;
};

export type SearchPage = {
  totalCount: number;
  endCursor: string | null;
  hasNext: boolean;
  items: SitecoreItem[];
};

export type XmcClient = {
  getCurrentUser: () =>
    Promise<{ name: string; email: string }>;
  itemByPath: (
    path: string, language?: string
  ) => Promise<SitecoreItem | null>;
  createItem: (args: CreateItemArgs) => Promise<SitecoreItem>;
  updateItem: (args: UpdateItemArgs) => Promise<SitecoreItem>;
  searchItems: (args: SearchArgs) => Promise<SearchPage>;
};

function fieldsToMap(
  nodes: Array<{ name: string; value: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of nodes ?? []) out[n.name] = n.value;
  return out;
}

export function createXmcClient(
  opts: XmcClientOptions
): XmcClient {
  const f = opts.fetch ?? fetch;
  const endpoint =
    `${opts.baseUrl.replace(/\/$/, "")}` +
    `/sitecore/api/authoring/graphql/v1`;

  async function gql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const res = await f(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`,
        ...(opts.sitecoreContextId
          ? { "sc-context-id": opts.sitecoreContextId }
          : {})
      },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) throw new Error(`XMC HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: T; errors?: Array<{ message?: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      const msg = body.errors
        .map((e) => e.message).filter(Boolean).join("; ");
      throw new Error(`XMC GraphQL: ${msg || "error"}`);
    }
    if (!body.data) throw new Error("XMC empty data");
    return body.data;
  }

  return {
    async getCurrentUser() {
      const data = await gql<{
        me: { name: string; email: string };
      }>(GET_ME_QUERY);
      return data.me;
    },

    async itemByPath(path, language) {
      const data = await gql<{
        item: null | {
          itemId: string; name?: string; path: string;
          fields: { nodes: SitecoreField[] };
        };
      }>(ITEM_BY_PATH_QUERY, { path, language });
      if (!data.item) return null;
      return {
        itemId: data.item.itemId,
        name: data.item.name,
        path: data.item.path,
        fields: fieldsToMap(data.item.fields.nodes)
      };
    },

    async createItem(args) {
      const data = await gql<{
        createItem: { item: {
          itemId: string; path: string;
          fields: { nodes: SitecoreField[] };
        } };
      }>(CREATE_ITEM_MUTATION, { input: args });
      const item = data.createItem.item;
      return {
        itemId: item.itemId,
        path: item.path,
        fields: fieldsToMap(item.fields.nodes)
      };
    },

    async updateItem(args) {
      const data = await gql<{
        updateItem: { item: {
          itemId: string; path: string;
          fields: { nodes: SitecoreField[] };
        } };
      }>(UPDATE_ITEM_MUTATION, { input: args });
      const item = data.updateItem.item;
      return {
        itemId: item.itemId,
        path: item.path,
        fields: fieldsToMap(item.fields.nodes)
      };
    },

    async searchItems(args) {
      const data = await gql<{
        search: {
          totalCount: number;
          pageInfo: { endCursor: string | null; hasNext: boolean };
          results: Array<{ innerItem: {
            itemId: string; path: string;
            fields: { nodes: SitecoreField[] };
          } }>;
        };
      }>(SEARCH_ITEMS_QUERY, {
        rootItem: args.rootPath,
        templates: args.templateId,
        first: args.first,
        after: args.after ?? null
      });
      return {
        totalCount: data.search.totalCount,
        endCursor: data.search.pageInfo.endCursor,
        hasNext: data.search.pageInfo.hasNext,
        items: data.search.results.map((r) => ({
          itemId: r.innerItem.itemId,
          path: r.innerItem.path,
          fields: fieldsToMap(r.innerItem.fields.nodes)
        }))
      };
    }
  };
}
