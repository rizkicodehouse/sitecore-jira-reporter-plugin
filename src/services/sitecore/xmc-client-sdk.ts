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
  query?: {
    sitecoreContextId?: string;
  };
};

// Shape returned by ClientSDK.mutate: the hey-api fetch
// client's result envelope. `data` is the full GraphQL
// envelope `{ data, errors }` (yes, nested — don't conflate
// with the outer wrapper).
type XmcGraphqlEnvelope = {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
};

type HeyApiResult<T> = {
  data?: T;
  error?: unknown;
  request?: Request;
  response?: Response;
};

export type MarketplaceMutator = {
  mutate: (
    key: "xmc.authoring.graphql",
    options: { params: XmcGraphqlParams }
  ) => Promise<HeyApiResult<XmcGraphqlEnvelope>>;
};

function fieldsToMap(
  nodes: Array<{ name: string; value: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of nodes ?? []) out[n.name] = n.value;
  return out;
}

export function createSdkXmcClient(
  client: MarketplaceMutator,
  // Edge-platform GraphQL routes by the tenant's
  // sitecoreContextId passed as a query-string param. Without
  // it the request hits /v1/authoring/graphql at the global
  // edge and returns 404. Pulled from application.context.
  sitecoreContextId?: string
): XmcClient {
  async function gql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const res = await client.mutate(
      "xmc.authoring.graphql",
      { params: {
          body: { query, variables },
          ...(sitecoreContextId
            ? { query: { sitecoreContextId } }
            : {})
      } }
    );
    if (res.error) {
      throw new Error(
        `XMC transport error: ${describeTransportError(res.error)}`
      );
    }
    const envelope = res.data;
    if (!envelope) {
      throw new Error("XMC: no GraphQL envelope in response");
    }
    if (envelope.errors && envelope.errors.length > 0) {
      const msg = envelope.errors
        .map((e) => e.message).filter(Boolean).join("; ");
      throw new Error(`XMC GraphQL: ${msg || "error"}`);
    }
    if (!envelope.data) {
      throw new Error("XMC GraphQL: empty data");
    }
    return envelope.data as T;
  }

  function describeTransportError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try { return JSON.stringify(err); }
    catch { return String(err); }
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
        createItem?: { item?: {
          itemId: string; path: string;
          fields: { nodes: SitecoreField[] };
        } } | null;
      }>(CREATE_ITEM_MUTATION, { input: args });
      const item = data.createItem?.item;
      if (!item) {
        throw new Error(
          `XMC createItem("${args.name}" under ` +
          `${args.parent}): response missing ` +
          `createItem.item. The Marketplace app may not ` +
          `have permission to create items under this ` +
          `parent, or the parent path / template id is ` +
          `invalid.`
        );
      }
      return {
        itemId: item.itemId,
        path: item.path,
        fields: fieldsToMap(item.fields.nodes)
      };
    },

    async updateItem(args) {
      const data = await gql<{
        updateItem?: { item?: {
          itemId: string; path: string;
          fields: { nodes: SitecoreField[] };
        } } | null;
      }>(UPDATE_ITEM_MUTATION, { input: args });
      const item = data.updateItem?.item;
      if (!item) {
        throw new Error(
          `XMC updateItem(${args.itemId}): response ` +
          `missing updateItem.item. The Marketplace app ` +
          `may lack write permission on this item.`
        );
      }
      return {
        itemId: item.itemId,
        path: item.path,
        fields: fieldsToMap(item.fields.nodes)
      };
    },

    async searchItems(args) {
      const data = await gql<{
        search?: {
          totalCount?: number;
          pageInfo?: {
            endCursor?: string | null;
            hasNext?: boolean;
          };
          results?: Array<{ innerItem?: {
            itemId: string; path: string;
            fields: { nodes: SitecoreField[] };
          } }>;
        } | null;
      }>(SEARCH_ITEMS_QUERY, {
        rootItem: args.rootPath,
        templates: args.templateId,
        first: args.first,
        after: args.after ?? null
      });
      // Authoring GraphQL returns `search: null` when the
      // index has no matches (rather than an empty result
      // envelope). Treat that as an empty page instead of
      // letting a TypeError bubble up to the UI.
      const search = data.search;
      if (!search) {
        return {
          totalCount: 0, endCursor: null,
          hasNext: false, items: []
        };
      }
      const results = search.results ?? [];
      return {
        totalCount: search.totalCount ?? 0,
        endCursor: search.pageInfo?.endCursor ?? null,
        hasNext: search.pageInfo?.hasNext ?? false,
        items: results
          .map((r) => r.innerItem)
          .filter((i): i is NonNullable<typeof i> =>
            Boolean(i))
          .map((i) => ({
            itemId: i.itemId,
            path: i.path,
            fields: fieldsToMap(i.fields.nodes)
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
