import {
  getReportsStore, buildRequestReportsStore,
  type ReportsStore
} from "@/lib/reports-store";
import { isSitecoreDatastore } from "@/lib/datastore-mode";
import { createXmcClient } from "@/services/sitecore/xmc";
import {
  createReportsSitecoreRepo
} from "@/lib/reports-sitecore-repo";

/**
 * Resolves the correct ReportsStore for the current request.
 *
 * When `SITECORE_DATASTORE=true`, a per-request store is built
 * from `x-sc-tenant` / `x-sc-site` / `x-sc-context-id` /
 * `x-sc-auth-token` headers forwarded by the Marketplace SDK.
 * Otherwise the shared memory/upstash singleton is returned.
 */
export function resolveReportsStore(req: Request): ReportsStore {
  if (!isSitecoreDatastore()) return getReportsStore();
  const tenant = req.headers.get("x-sc-tenant") ?? "";
  const site = req.headers.get("x-sc-site") ?? "";
  const contextId =
    req.headers.get("x-sc-context-id") ?? "";
  const token = req.headers.get("x-sc-auth-token") ?? "";
  const baseUrl =
    process.env.SITECORE_AUTHORING_BASE_URL ?? "";
  if (!tenant || !site || !contextId || !token || !baseUrl) {
    throw new Error("sitecore-context-missing");
  }
  return buildRequestReportsStore({
    tenant, site,
    getRepo: async () => createReportsSitecoreRepo({
      client: createXmcClient({
        baseUrl, token, sitecoreContextId: contextId
      })
    })
  });
}
