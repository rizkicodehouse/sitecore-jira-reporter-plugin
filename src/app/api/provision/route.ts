import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import {
  getXmcClient, isLocalXmcMode
} from "@/services/sitecore/xmc-client-factory";
import {
  provisionPluginSite
} from "@/lib/sitecore-provision";

export async function POST(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) {
    return NextResponse.json(
      { error: "unauthenticated" }, { status: 401 }
    );
  }
  const tenant = req.headers.get("x-sc-tenant") ?? "";
  const site = req.headers.get("x-sc-site") ?? "";
  const contextId =
    req.headers.get("x-sc-context-id") ?? "";
  const token = req.headers.get("x-sc-auth-token") ?? "";
  const baseUrl =
    process.env.SITECORE_AUTHORING_BASE_URL ?? "";

  // In local/dev mode the mock XmcClient ignores contextId,
  // token, and baseUrl — we only need tenant + site, and
  // both fall back to the seed tree when the Marketplace
  // SDK didn't forward headers.
  const effectiveTenant = tenant ||
    (isLocalXmcMode() ? "Demo" : "");
  const effectiveSite = site ||
    (isLocalXmcMode() ? "dev-site" : "");

  if (!effectiveTenant || !effectiveSite) {
    return NextResponse.json(
      { error: "sitecore-context-missing" },
      { status: 400 }
    );
  }
  if (!isLocalXmcMode() && (!contextId || !token || !baseUrl)) {
    return NextResponse.json(
      { error: "sitecore-context-missing" },
      { status: 400 }
    );
  }

  try {
    await provisionPluginSite({
      client: getXmcClient({
        baseUrl, token, sitecoreContextId: contextId
      }),
      tenant: effectiveTenant,
      site: effectiveSite
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
