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
  ITEM_BY_ID_QUERY,
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

// Search-index IDs are stored in compact form: no braces,
// no dashes, lowercase (confirmed via the probe search in
// /debug-xmc-schema, which returned items like
// "11111111111111111111111111111111"). Filter values must
// use this form or they match nothing.
function toIndexId(id: string): string {
  return id.replace(/[{}\-]/g, "").toLowerCase();
}

// XMC Authoring's ID scalar parses as a GUID and rejects
// Sitecore's braced form (e.g., "{A87A00B1-...}") with
// "Unable to convert type from String to Guid". Our
// template constants include braces because the REST/SIF
// conventions keep them; strip before every mutation.
function stripBraces(id: string): string {
  return id.replace(/^\{|\}$/g, "");
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

  // Internal helper so createItem can resolve the parent
  // path → Guid without going through the public surface.
  async function itemByPathInternal(
    path: string, language?: string
  ) {
    const data = await gql<{
      item: null | {
        itemId: string; name?: string; path: string;
        fields: { nodes: SitecoreField[] };
      };
    }>(ITEM_BY_PATH_QUERY, { path, language });
    return data.item;
  }

  return {
    async getCurrentUser() {
      const data = await gql<{
        me: { name: string; email: string };
      }>(GET_ME_QUERY);
      return data.me;
    },

    async itemByPath(path, language) {
      const item = await itemByPathInternal(path, language);
      if (!item) return null;
      return {
        itemId: item.itemId,
        name: item.name,
        path: item.path,
        fields: fieldsToMap(item.fields.nodes)
      };
    },

    async createItem(args) {
      // CreateItemInput.parent is typed as Guid in the XMC
      // Authoring schema. Our abstraction takes a path for
      // ergonomics, so resolve the parent's itemId here
      // before issuing the mutation — otherwise Authoring
      // returns "Unable to convert type from String to
      // Guid".
      const parentItem = await itemByPathInternal(
        args.parent, args.language
      );
      if (!parentItem) {
        throw new Error(
          `XMC createItem: parent item not found at ` +
          `${args.parent}. Check that the path exists in ` +
          `the requested language (${args.language}).`
        );
      }
      const data = await gql<{
        createItem?: { item?: {
          itemId: string; path: string;
          fields: { nodes: SitecoreField[] };
        } } | null;
      }>(CREATE_ITEM_MUTATION, {
        input: {
          name: args.name,
          parent: stripBraces(parentItem.itemId),
          templateId: stripBraces(args.templateId),
          language: args.language,
          fields: args.fields
        }
      });
      const item = data.createItem?.item;
      if (!item) {
        throw new Error(
          `XMC createItem("${args.name}" under ` +
          `${args.parent}): response missing ` +
          `createItem.item. The Marketplace app may not ` +
          `have permission to create items under this ` +
          `parent, or the template id is invalid.`
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
      // XMC Authoring's search is offset-based. Consumers
      // still pass `first` + optional `after` cursor, so
      // translate the cursor to a pageIndex for the server.
      const pageSize = args.first;
      const pageIndex = args.after
        ? Number.parseInt(args.after, 10) || 0
        : 0;
      const data = await gql<{
        search?: {
          totalCount?: number;
          results?: Array<{
            itemId?: string;
            path?: string;
          } | null> | null;
        } | null;
      }>(SEARCH_ITEMS_QUERY, {
        // Search-index storage format, not the ID-scalar
        // format used by mutations.
        templateId: toIndexId(args.templateId),
        pageIndex, pageSize
      });
      // args.rootPath is accepted for API compatibility
      // but not forwarded — see SEARCH_ITEMS_QUERY for why.
      void args.rootPath;
      const search = data.search;
      const totalCount = search?.totalCount ?? 0;
      const results = (search?.results ?? [])
        .filter((r): r is { itemId: string; path: string } =>
          Boolean(r?.itemId && r?.path)
        );
      // SearchResultItem only carries itemId + path in the
      // index — rehydrate full field values via the normal
      // item resolver so downstream repos still get the
      // shape they expect. Parallelised because the plugin
      // caps a reports page at 50 items.
      const items = await Promise.all(
        results.map(async (r) => {
          try {
            const hydrated = await gql<{
              item: null | {
                itemId: string; path: string;
                fields: { nodes: SitecoreField[] };
              };
            }>(ITEM_BY_ID_QUERY, { itemId: r.itemId });
            if (!hydrated.item) return null;
            return {
              itemId: hydrated.item.itemId,
              path: hydrated.item.path,
              fields: fieldsToMap(hydrated.item.fields.nodes)
            };
          } catch {
            return null;
          }
        })
      );
      const populated = items.filter(
        (i): i is NonNullable<typeof i> => Boolean(i)
      );
      const nextPageIndex = pageIndex + 1;
      const hasNext = populated.length === pageSize &&
        pageIndex * pageSize + populated.length < totalCount;
      return {
        totalCount,
        endCursor: hasNext ? String(nextPageIndex) : null,
        hasNext,
        items: populated
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
