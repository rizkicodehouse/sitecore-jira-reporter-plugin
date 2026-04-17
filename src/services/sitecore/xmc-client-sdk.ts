// Browser-side XmcClient backed by the Marketplace XMC SDK
// module. Routes every Authoring-GraphQL call through
// `client.mutate("xmc.authoring.graphql", ...)` so the iframe
// handles auth — no bearer token, no context-id header, no
// `SITECORE_AUTHORING_BASE_URL` on the server.
//
// Same shape as `createXmcClient` in `./xmc.ts` so downstream
// consumers (`sitecore-provision`, `settings-sitecore-repo`,
// `reports-sitecore-repo`) work unchanged when given an
// instance produced here.

import {
  ITEM_BY_PATH_QUERY,
  CREATE_ITEM_MUTATION,
  UPDATE_ITEM_MUTATION,
  SEARCH_ITEMS_QUERY
} from "./xmc-mutations";
import {
  GET_ME_QUERY,
  type XmcClient,
  type SitecoreField
} from "./xmc";

// The XMC module's mutation payload. Keep this local to
// avoid a type import from the SDK — the generated type is
// verbose and the shape is stable.
type XmcGraphqlParams = {
  body: {
    query: string;
    variables?: Record<string, unknown>;
  };
};

type XmcGraphqlResponse = {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
};

export type MarketplaceMutator = {
  mutate: (
    key: "xmc.authoring.graphql",
    options: { params: XmcGraphqlParams }
  ) => Promise<XmcGraphqlResponse>;
};

function fieldsToMap(
  nodes: Array<{ name: string; value: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of nodes ?? []) out[n.name] = n.value;
  return out;
}

export function createSdkXmcClient(
  client: MarketplaceMutator
): XmcClient {
  async function gql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const res = await client.mutate(
      "xmc.authoring.graphql",
      { params: { body: { query, variables } } }
    );
    if (res.errors && res.errors.length > 0) {
      const msg = res.errors
        .map((e) => e.message).filter(Boolean).join("; ");
      throw new Error(`XMC GraphQL: ${msg || "error"}`);
    }
    if (!res.data) throw new Error("XMC empty data");
    return res.data as T;
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
          pageInfo: {
            endCursor: string | null; hasNext: boolean;
          };
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
    },

    async graphql<T = unknown>(
      query: string,
      variables?: Record<string, unknown>
    ): Promise<T> {
      return gql<T>(query, variables);
    }
  };
}
