import { NextResponse } from "next/server";
import { verifySdkSession, getTenantId } from "@/lib/auth";
import {
  resolveJiraCreds, basicAuthHeader
} from "@/lib/jira-creds";
import { getJiraQueue } from "@/lib/rate-limit";

const MAX_RESULTS = 50;

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return respondError(401, {
    category: "permission",
    userMessage: "Sign-in required",
    logCode: "jira.priorities.auth"
  });
  const tenantId = getTenantId(req);
  const creds = await resolveJiraCreds(tenantId);
  if (creds.source === "none") {
    return respondError(412, {
      category: "config",
      userMessage:
        "Jira is not configured. Open Settings and set " +
        "base URL, service email, and API token.",
      logCode: "jira.priorities.not-configured"
    });
  }
  const target =
    `${creds.baseUrl}/rest/api/3/priority/search?` +
    `maxResults=${MAX_RESULTS}`;
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
        logCode: "jira.priorities.auth-upstream"
      });
    }
    if (!upstream.ok) {
      return respondError(502, {
        category: "retryable",
        userMessage: "Jira is temporarily unavailable.",
        logCode: "jira.priorities.upstream"
      });
    }
    const raw = (await upstream.json()) as {
      values?: Array<{
        id?: string;
        name?: string;
        description?: string;
        iconUrl?: string;
        statusColor?: string;
        isDefault?: boolean;
      }>;
    };
    const priorities = (raw.values ?? [])
      .filter((p) => p.id && p.name)
      .map((p) => ({
        id: p.id!,
        name: p.name!,
        description: p.description ?? "",
        iconUrl: p.iconUrl ?? null,
        statusColor: p.statusColor ?? null,
        isDefault: Boolean(p.isDefault)
      }));
    return NextResponse.json({ priorities });
  } catch {
    return respondError(502, {
      category: "retryable",
      userMessage: "Could not reach Jira to load priorities.",
      logCode: "jira.priorities.network"
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
