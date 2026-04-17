// Pulls the sitecoreContextId out of the Marketplace SDK's
// `application.context` response. The XMC edge platform
// uses this id as a query-string router key — requests
// without it return 404 at /v1/authoring/graphql.

import type { MarketplaceSdkLike } from "./context";

type ApplicationContextShape = {
  resourceAccess?: Array<{
    context?: {
      preview?: string;
      live?: string;
    };
  }>;
};

export async function readSitecoreContextId(
  sdk: MarketplaceSdkLike
): Promise<string | undefined> {
  try {
    const res = await sdk.query("application.context");
    const app = res.data as ApplicationContextShape;
    const access = app.resourceAccess?.[0];
    return access?.context?.preview ?? access?.context?.live;
  } catch {
    return undefined;
  }
}
