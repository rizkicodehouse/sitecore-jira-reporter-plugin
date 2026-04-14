import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";
import { getJiraQueue } from "@/lib/rate-limit";
import { mapJiraError } from "@/lib/jira-errors";

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
  const outbound = new FormData();
  outbound.append(
    "file", file,
    (file as File).name ?? `screenshot-${Date.now()}.png`
  );
  const auth = basicAuth(
    process.env.JIRA_SERVICE_EMAIL!,
    process.env.JIRA_API_TOKEN!
  );
  try {
    const upstream = await getJiraQueue().add(() => fetch(
      `${process.env.JIRA_BASE_URL}` +
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

function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer
    .from(`${user}:${pass}`).toString("base64");
}

function err(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category: status === 401 ? "permission" : "retryable",
        userMessage:
          status === 400 ? "Invalid attachment request" :
          status === 401 ? "Sign-in required" :
          "JIRA is temporarily unavailable",
        logCode: code
    } },
    { status }
  );
}
