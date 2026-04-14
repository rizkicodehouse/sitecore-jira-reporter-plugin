import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import { createXmcClient } from "@/services/sitecore/xmc";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return err(401, "auth.missing");
  const url = new URL(req.url);
  const itemId = url.searchParams.get("itemId");
  const language = url.searchParams.get("language");
  if (!itemId || !language) return err(400, "params.missing");
  const baseUrl = process.env.XMC_TENANT_URL;
  if (!baseUrl) return err(500, "xmc.not-configured");
  const token = req.headers.get("X-Sdk-Token") ?? "";
  try {
    const client = createXmcClient({ baseUrl, token });
    const fields = await client.getDatasourceFields(
      itemId, language
    );
    return NextResponse.json({ fields });
  } catch {
    return err(502, "xmc.upstream");
  }
}

function err(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category: "retryable",
        userMessage: "Could not resolve datasource",
        logCode: code
    } },
    { status }
  );
}
