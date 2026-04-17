"use client";
import {
  FC, useEffect, useState, useCallback, useMemo
} from "react";
import { useXmcClient } from "@/hooks/useXmcClient";
import type {
  MarketplaceMutator
} from "@/services/sitecore/xmc-client-sdk";
import {
  readSitecoreContextId
} from "@/services/sitecore/context-id";

// Introspection helper — run ad-hoc against the embedded
// XMC Authoring endpoint to confirm the exact schema shape
// of `search`, `createItem`, `createItemTemplate`, etc.
// Load this page inside the Pages Panel or Fullscreen
// iframe (where the Marketplace SDK is available). Copy the
// JSON output into the chat so we can pin down the correct
// GraphQL queries.

const INTROSPECT_QUERIES: Record<string, string> = {
  "SearchQueryInput fields": `
    query {
      __type(name: "SearchQueryInput") {
        name kind
        inputFields {
          name
          type {
            kind name
            ofType {
              kind name
              ofType { kind name }
            }
          }
        }
      }
    }
  `,
  "Search result item shape": `
    query {
      searchResultItem: __type(name: "ItemSearchResultItem") {
        name kind
        fields { name type { kind name ofType { kind name } } }
      }
      searchResultFacet: __type(name: "SearchResultFacetCategory") {
        name kind
        fields { name type { kind name ofType { kind name } } }
      }
    }
  `,
  "FieldValueInput fields": `
    query {
      __type(name: "FieldValueInput") {
        name kind
        inputFields {
          name
          type { kind name ofType { kind name } }
        }
      }
    }
  `,
  "ItemTemplateSectionInput fields": `
    query {
      __type(name: "ItemTemplateSectionInput") {
        name kind
        inputFields {
          name
          type { kind name ofType { kind name } }
        }
      }
    }
  `,
  "ItemTemplateFieldInput fields": `
    query {
      __type(name: "ItemTemplateFieldInput") {
        name kind
        inputFields {
          name
          type { kind name ofType { kind name } }
        }
      }
    }
  `,
  "ItemConnection / edges shape": `
    query {
      connection: __type(name: "ItemConnection") {
        name kind
        fields {
          name
          type { kind name ofType { kind name } }
        }
      }
      edge: __type(name: "ItemEdge") {
        name kind
        fields {
          name
          type { kind name ofType { kind name } }
        }
      }
    }
  `,
  "SearchStatementInput fields": `
    query {
      __type(name: "SearchStatementInput") {
        name kind
        inputFields {
          name
          type {
            kind name
            ofType {
              kind name
              ofType { kind name }
            }
          }
        }
      }
    }
  `,
  "SearchCriteriaInput / SearchFieldCriteriaInput fields": `
    query {
      criteria: __type(name: "SearchCriteriaInput") {
        name kind
        inputFields {
          name
          type { kind name ofType { kind name } }
        }
      }
      fieldCriteria: __type(name: "SearchFieldCriteriaInput") {
        name kind
        inputFields {
          name
          type { kind name ofType { kind name } }
        }
      }
      statementCriteria: __type(name: "SearchStatementCriteriaInput") {
        name kind
        inputFields {
          name
          type { kind name ofType { kind name } }
        }
      }
      operator: __type(name: "SearchCriteriaOperator") {
        name kind
        enumValues { name }
      }
    }
  `,
  "SearchPagingInput fields": `
    query {
      __type(name: "SearchPagingInput") {
        name kind
        inputFields {
          name
          type { kind name ofType { kind name } }
        }
      }
    }
  `,
  "SearchOperator / SearchCriteriaType enum values": `
    query {
      searchOperator: __type(name: "SearchOperator") {
        name kind
        enumValues { name }
      }
      searchCriteriaType: __type(name: "SearchCriteriaType") {
        name kind
        enumValues { name }
      }
    }
  `,
  "Probe search — return actual result shape": `
    query {
      search(query: {
        paging: { pageIndex: 0, pageSize: 2 }
      }) {
        totalCount
        results {
          __typename
          itemId
          path
        }
      }
    }
  `,
  "SearchResultItem full shape": `
    query {
      __type(name: "SearchResultItem") {
        name kind
        fields {
          name
          args { name type { kind name } }
          type { kind name ofType { kind name } }
        }
      }
    }
  `,
  "Probe: find SJP-107 by _name (proves the index has it)": `
    query {
      search(query: {
        filterStatement: {
          criteria: [
            { field: "_name", value: "SJP-107" }
          ]
        }
        paging: { pageIndex: 0, pageSize: 5 }
      }) {
        totalCount
        results { itemId path }
      }
    }
  `,
  "Probe: find BugReport items by _templatename": `
    query {
      search(query: {
        filterStatement: {
          criteria: [
            { field: "_templatename", value: "BugReport" }
          ]
        }
        paging: { pageIndex: 0, pageSize: 5 }
      }) {
        totalCount
        results { itemId path }
      }
    }
  `,
  "Probe: find by _template (compact id)": `
    query {
      search(query: {
        filterStatement: {
          criteria: [
            { field: "_template",
              value: "0e304805fe904f7ba331c6858ee830ca" }
          ]
        }
        paging: { pageIndex: 0, pageSize: 5 }
      }) {
        totalCount
        results { itemId path }
      }
    }
  `,
  "Probe: find by _template (dashed id)": `
    query {
      search(query: {
        filterStatement: {
          criteria: [
            { field: "_template",
              value: "0e304805-fe90-4f7b-a331-c6858ee830ca" }
          ]
        }
        paging: { pageIndex: 0, pageSize: 5 }
      }) {
        totalCount
        results { itemId path }
      }
    }
  `,
  "Probe: find by template (no underscore)": `
    query {
      search(query: {
        filterStatement: {
          criteria: [
            { field: "template",
              value: "0e304805fe904f7ba331c6858ee830ca" }
          ]
        }
        paging: { pageIndex: 0, pageSize: 5 }
      }) {
        totalCount
        results { itemId path }
      }
    }
  `,
  "Probe: find by _path (bug reports root)": `
    query {
      search(query: {
        filterStatement: {
          criteria: [
            { field: "_path",
              value: "ec89f5f71dcb4fa79c2c3d7e7ec9fc25" }
          ]
        }
        paging: { pageIndex: 0, pageSize: 5 }
      }) {
        totalCount
        results { itemId path }
      }
    }
  `
};

const DebugXmcSchemaPage: FC = () => {
  const [marketplaceClient, setMarketplaceClient] =
    useState<MarketplaceMutator | null>(null);
  const [sitecoreContextId, setSitecoreContextId] =
    useState<string | undefined>();
  const xmcClient = useXmcClient(
    marketplaceClient, sitecoreContextId
  );
  const [initError, setInitError] = useState<string | null>(
    null
  );
  const [results, setResults] = useState<Record<string, unknown>>(
    {}
  );
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) {
      setInitError(
        "This page must be loaded inside the Sitecore iframe " +
        "(embed it through Pages Panel or Fullscreen URLs)."
      );
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [clientMod, xmcMod] = await Promise.all([
          import("@sitecore-marketplace-sdk/client"),
          import("@sitecore-marketplace-sdk/xmc")
        ]);
        const real = await clientMod.ClientSDK.init({
          target: window.parent,
          modules: [xmcMod.XMC],
          ...(process.env
            .NEXT_PUBLIC_SITECORE_HOST_ORIGIN
            ? {
                origin:
                  process.env
                    .NEXT_PUBLIC_SITECORE_HOST_ORIGIN
              }
            : {})
        });
        const adapter = {
          query: async (name: string) => {
            const r = await real.query(
              name as "pages.context"
            );
            return { data: r.data };
          },
          subscribe: () => () => {}
        };
        if (cancelled) return;
        setMarketplaceClient(
          real as unknown as MarketplaceMutator
        );
        const ctxId = await readSitecoreContextId(adapter);
        if (!cancelled) setSitecoreContextId(ctxId);
      } catch (e) {
        if (cancelled) return;
        setInitError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const run = useCallback(async () => {
    if (!xmcClient) return;
    setRunning(true);
    setResults({});
    const next: Record<string, unknown> = {};
    for (const [label, query] of Object.entries(
      INTROSPECT_QUERIES
    )) {
      try {
        next[label] = await xmcClient.graphql(query);
      } catch (e) {
        next[label] = { error: (e as Error).message };
      }
    }
    setResults(next);
    setRunning(false);
  }, [xmcClient]);

  const copyText = useMemo(() => {
    if (Object.keys(results).length === 0) return "";
    return JSON.stringify(results, null, 2);
  }, [results]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            XMC Authoring Schema Debug
          </h1>
          <p className="text-sm text-gray-600">
            Runs GraphQL introspection against the live
            Authoring endpoint via the Marketplace SDK.
            Paste the output back in chat.
          </p>
        </div>
        {initError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {initError}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={!xmcClient || running}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {running
              ? "Running…"
              : xmcClient
                ? "Run introspection"
                : "Waiting for SDK…"}
          </button>
          {copyText && (
            <button
              onClick={() =>
                navigator.clipboard.writeText(copyText)
              }
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              Copy JSON
            </button>
          )}
        </div>
        {Object.entries(results).map(([label, data]) => (
          <details
            key={label}
            open
            className="rounded-lg border border-gray-200 bg-white"
          >
            <summary className="cursor-pointer p-3 text-sm font-medium text-gray-800">
              {label}
            </summary>
            <pre className="overflow-x-auto border-t border-gray-200 bg-gray-900 p-3 text-xs text-green-300">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
};

export default DebugXmcSchemaPage;
