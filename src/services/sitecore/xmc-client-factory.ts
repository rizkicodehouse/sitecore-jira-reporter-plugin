// Single entry point for obtaining an XmcClient. In
// production this returns the real Authoring-GraphQL
// client; set XMC_LOCAL_MODE=true to use an in-process
// mock that persists items on globalThis (dev-without-
// Sitecore workflows).

import {
  createXmcClient, type XmcClient, type XmcClientOptions
} from "./xmc";
import {
  createLocalXmcClient
} from "./xmc-client-local";

export type XmcContext = {
  baseUrl: string;
  token: string;
  sitecoreContextId: string;
};

export function isLocalXmcMode(): boolean {
  // Unit/integration tests always use the local mock so they
  // don't need SDK headers or a real Sitecore tenant.
  if (process.env.NODE_ENV === "test") return true;
  return process.env.XMC_LOCAL_MODE === "true";
}

export function getXmcClient(
  ctx: XmcContext
): XmcClient {
  if (isLocalXmcMode()) {
    return createLocalXmcClient();
  }
  const opts: XmcClientOptions = {
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    sitecoreContextId: ctx.sitecoreContextId
  };
  return createXmcClient(opts);
}
