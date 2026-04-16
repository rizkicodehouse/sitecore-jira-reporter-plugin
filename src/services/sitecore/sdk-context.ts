import type { MarketplaceSdkLike } from "./context";

export type SdkContext = {
  tenant: string;
  site: string;
  contextId: string;
  authToken: string;
};

type ApplicationContextShape = {
  resourceAccess?: Array<{
    tenantId?: string;
    context?: {
      preview?: string;
      live?: string;
    };
    accessToken?: string;
  }>;
};

export async function readSdkContext(
  sdk: MarketplaceSdkLike,
  siteName: string
): Promise<SdkContext | null> {
  try {
    const res = await sdk.query("application.context");
    const app = res.data as ApplicationContextShape;
    const access = app.resourceAccess?.[0];
    const contextId =
      access?.context?.preview ?? access?.context?.live;
    const token = access?.accessToken;
    const tenant = access?.tenantId;
    if (!contextId || !token || !tenant) return null;
    return {
      tenant, site: siteName,
      contextId, authToken: token
    };
  } catch {
    return null;
  }
}
