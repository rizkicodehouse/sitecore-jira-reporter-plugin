import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import { createXmcClient } from "@/services/sitecore/xmc";
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
  if (!tenant || !site || !contextId || !token || !baseUrl) {
    return NextResponse.json(
      { error: "sitecore-context-missing" },
      { status: 400 }
    );
  }
  try {
    await provisionPluginSite({
      client: createXmcClient({
        baseUrl, token, sitecoreContextId: contextId
      }),
      tenant, site
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
