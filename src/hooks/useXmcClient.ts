import { useMemo } from "react";
import {
  createSdkXmcClient,
  type MarketplaceMutator
} from "@/services/sitecore/xmc-client-sdk";
import type { XmcClient } from "@/services/sitecore/xmc";

// Wraps the Marketplace ClientSDK (with the XMC module
// registered) into the XmcClient shape that `sitecore-
// provision`, `settings-sitecore-repo`, and `reports-
// sitecore-repo` already consume. Returns `null` until the
// caller has a real SDK instance so components can render
// a pending state instead of guessing an empty client.
//
// `sitecoreContextId` is required in production: the XMC
// edge platform uses it as a query-string router key to
// reach the right tenant. Missing it → 404 on every call.
export function useXmcClient(
  client: MarketplaceMutator | null,
  sitecoreContextId?: string
): XmcClient | null {
  return useMemo(() => {
    if (!client) return null;
    return createSdkXmcClient(client, sitecoreContextId);
  }, [client, sitecoreContextId]);
}
