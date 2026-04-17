import { NextResponse } from "next/server";
import { verifySdkSession, getTenantId } from "@/lib/auth";
import {
  resolveJiraCreds, basicAuthHeader
} from "@/lib/jira-creds";
import { getJiraQueue } from "@/lib/rate-limit";

const MAX_RESULTS = 10;

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return respondError(401, {
    category: "permission",
    userMessage: "Sign-in required",
    logCode: "jira.user-search.auth"
  });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }
  const tenantId = getTenantId(req);
  const creds = await resolveJiraCreds(tenantId);
  if (creds.source === "none") {
    return respondError(412, {
      category: "config",
      userMessage:
        "Jira is not configured. Open Settings and set " +
        "base URL, service email, and API token.",
      logCode: "jira.user-search.not-configured"
    });
  }
  const target =
    `${creds.baseUrl}/rest/api/3/user/search?` +
    `query=${encodeURIComponent(q)}&maxResults=${MAX_RESULTS}`;
  try {
    const upstream = await getJiraQueue().add(() =>
      fetch(target, {
        headers: {
          Accept: "application/json",
          Authorization: basicAuthHeader(
            creds.serviceEmail, creds.apiToken
          )
        }
      })
    );
    if (upstream.status === 401 || upstream.status === 403) {
      return respondError(upstream.status, {
        category: "permission",
        userMessage: "Jira rejected the service credentials.",
        logCode: "jira.user-search.auth-upstream"
      });
    }
    if (!upstream.ok) {
      return respondError(502, {
        category: "retryable",
        userMessage: "Jira is temporarily unavailable.",
        logCode: "jira.user-search.upstream"
      });
    }
    const raw = (await upstream.json()) as Array<{
      accountId?: string;
      displayName?: string;
      emailAddress?: string;
      active?: boolean;
      avatarUrls?: Record<string, string>;
    }>;
    const users = raw
      .filter((u) => u.active !== false && u.accountId)
      .slice(0, MAX_RESULTS)
      .map((u) => ({
        accountId: u.accountId!,
        displayName: u.displayName ?? "",
        emailAddress: u.emailAddress ?? "",
        avatarUrl: u.avatarUrls?.["24x24"] ?? null
      }));
    return NextResponse.json({ users });
  } catch {
    return respondError(502, {
      category: "retryable",
      userMessage: "Could not reach Jira to search users.",
      logCode: "jira.user-search.network"
    });
  }
}

function respondError(
  status: number,
  error: {
    category: string; userMessage: string; logCode: string;
  }
) {
  return NextResponse.json({ error }, { status });
}
