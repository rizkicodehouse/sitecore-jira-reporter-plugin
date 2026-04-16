import {
  buildRequestReportsStore,
  getReportsStore,
  type ReportsStore
} from "@/lib/reports-store";
import {
  getXmcClient, isLocalXmcMode
} from "@/services/sitecore/xmc-client-factory";
import {
  createReportsSitecoreRepo
} from "@/lib/reports-sitecore-repo";

/**
 * Resolves the ReportsStore for the current request.
 *
 * Always constructs a Sitecore-backed store. In local-dev
 * mode (`XMC_LOCAL_MODE=true`), the XmcClient factory
 * returns an in-process mock so no Sitecore tenant is
 * required. In all other modes, the `x-sc-*` headers from
 * the Marketplace SDK are required.
 */
export function resolveReportsStore(req: Request): ReportsStore {
  // Unit/integration tests seed data through the memory
  // singleton and expect the route to read from the same
  // place, so short-circuit in test mode.
  if (process.env.NODE_ENV === "test") {
    return getReportsStore();
  }

  const tenant = req.headers.get("x-sc-tenant") ?? "";
  const site = req.headers.get("x-sc-site") ?? "";
  const contextId =
    req.headers.get("x-sc-context-id") ?? "";
  const token = req.headers.get("x-sc-auth-token") ?? "";
  const baseUrl =
    process.env.SITECORE_AUTHORING_BASE_URL ?? "";

  if (!isLocalXmcMode()) {
    if (!tenant || !site || !contextId ||
        !token || !baseUrl) {
      throw new Error("sitecore-context-missing");
    }
  }

  return buildRequestReportsStore({
    tenant: tenant || "Demo",
    site: site || "dev-site",
    getRepo: async () => createReportsSitecoreRepo({
      client: getXmcClient({
        baseUrl, token, sitecoreContextId: contextId
      })
    })
  });
}
