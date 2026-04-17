import { NextResponse } from "next/server";
import { verifySdkSession, getTenantId } from "@/lib/auth";
import { getJiraQueue } from "@/lib/rate-limit";
import { mapJiraError } from "@/lib/jira-errors";
import {
  resolveJiraCredsFromRequest, basicAuthHeader
} from "@/lib/jira-creds";

export async function POST(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return err(401, "attach.auth");
  const url = new URL(req.url);
  const issueKey = url.searchParams.get("issueKey");
  if (!issueKey) return err(400, "attach.no-key");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return err(400, "attach.no-file");
  }
  const creds = await resolveJiraCredsFromRequest(req, getTenantId(req));
  if (creds.source === "none") {
    return err(412, "attach.not-configured");
  }
  const outbound = new FormData();
  outbound.append(
    "file", file,
    (file as File).name ?? `screenshot-${Date.now()}.png`
  );
  const auth = basicAuthHeader(
    creds.serviceEmail, creds.apiToken
  );
  try {
    const upstream = await getJiraQueue().add(() => fetch(
      `${creds.baseUrl}` +
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}` +
      `/attachments`,
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "X-Atlassian-Token": "no-check"
        },
        body: outbound
      }
    ));
    if (!upstream.ok) {
      let body: unknown = {};
      try { body = await upstream.json(); } catch {}
      const m = mapJiraError({
        status: upstream.status, upstreamBody: body
      });
      return NextResponse.json(
        { error: m }, { status: upstream.status }
      );
    }
    const arr = (await upstream.json()) as Array<{ id: string }>;
    const id = arr[0]?.id ?? "";
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return err(502, "attach.network");
  }
}

function err(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category:
          status === 401 ? "permission" :
          status === 412 ? "config" :
          "retryable",
        userMessage:
          status === 400 ? "Invalid attachment request" :
          status === 401 ? "Sign-in required" :
          status === 412
            ? "Jira is not configured. Open Settings first."
            : "Jira is temporarily unavailable",
        logCode: code
    } },
    { status }
  );
}
