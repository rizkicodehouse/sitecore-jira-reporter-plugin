import { NextResponse } from "next/server";
import { verifySdkSession, getTenantId } from "@/lib/auth";
import { resolveJiraCreds } from "@/lib/jira-creds";
import {
  fetchCreateMetaFields
} from "@/lib/jira-create-meta";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return fail(401, "auth.missing");
  const url = new URL(req.url);
  const projectKey =
    url.searchParams.get("project") ?? "";
  const issueType =
    url.searchParams.get("issueType") ?? "";
  if (!projectKey || !issueType) {
    return fail(400, "meta.missing-params");
  }
  const tenantId = getTenantId(req);
  const creds = await resolveJiraCreds(tenantId);
  if (creds.source === "none") {
    return fail(412, "meta.not-configured");
  }
  try {
    const fields = await fetchCreateMetaFields(
      creds.baseUrl,
      creds.serviceEmail,
      creds.apiToken,
      projectKey,
      issueType
    );
    return NextResponse.json({ fields });
  } catch (e) {
    return fail(
      502,
      "meta.upstream",
      (e as Error).message
    );
  }
}

function fail(
  status: number, code: string, detail?: string
) {
  return NextResponse.json(
    { error: {
        category:
          status === 401 ? "permission" :
          status === 412 ? "config" :
          status === 400 ? "unknown" :
          "retryable",
        userMessage:
          status === 401 ? "Sign-in required"
          : status === 412 ? "Jira not configured"
          : status === 400 ? "Missing project or issueType"
          : detail ?? "Could not fetch Jira field schema",
        logCode: code
    } },
    { status }
  );
}
