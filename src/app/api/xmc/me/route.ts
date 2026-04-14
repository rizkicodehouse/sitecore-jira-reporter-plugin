import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import { createXmcClient } from "@/services/sitecore/xmc";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return fail(401, "auth.missing");
  const baseUrl = process.env.XMC_TENANT_URL;
  if (!baseUrl) return fail(500, "xmc.not-configured");
  const token = req.headers.get("X-Sdk-Token") ?? "";
  try {
    const client = createXmcClient({ baseUrl, token });
    const me = await client.getCurrentUser();
    return NextResponse.json(me);
  } catch {
    return fail(502, "xmc.upstream");
  }
}

function fail(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category: status === 401 ? "permission" : "retryable",
        userMessage:
          status === 401 ? "Sign-in required" :
          "Could not identify user",
        logCode: code
    } },
    { status }
  );
}
