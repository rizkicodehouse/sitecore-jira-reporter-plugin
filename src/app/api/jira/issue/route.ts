import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySdkSession } from "@/lib/auth";
import { getSettingsStore } from "@/lib/settings-store";
import { getJiraQueue } from "@/lib/rate-limit";
import { mapJiraError } from "@/lib/jira-errors";
import { buildDescription } from "@/lib/adf";

const ContextSchema = z.object({
  page: z.object({
    title: z.string(), url: z.string(),
    language: z.string(), site: z.string()
  }).nullable(),
  rendering: z.object({
    name: z.string(), template: z.string(),
    instanceId: z.string()
  }).nullable(),
  datasource: z.object({
    fields: z.record(z.string())
  }).nullable(),
  reporter: z.object({
    name: z.string(), email: z.string()
  }).nullable(),
  browser: z.object({
    userAgent: z.string(), viewport: z.string(),
    timestamp: z.string()
  })
});

const BodySchema = z.object({
  summary: z.string().min(1).max(255),
  descriptionText: z.string().max(10_000),
  context: ContextSchema,
  attachmentCount: z.number().int().min(0)
});

export async function POST(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return respondError(401, {
    category: "permission",
    userMessage: "Sign-in required",
    logCode: "jira.issue.auth"
  });
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return respondError(400, {
      category: "unknown",
      userMessage: "Invalid request payload",
      logCode: "jira.issue.body"
    });
  }
  const settings = await getSettingsStore().get();
  const description = buildDescription({
    description: parsed.descriptionText,
    reporter: parsed.context.reporter,
    page: parsed.context.page && {
      title: parsed.context.page.title,
      url: parsed.context.page.url,
      language: parsed.context.page.language,
      site: parsed.context.page.site
    },
    rendering: parsed.context.rendering,
    datasource: parsed.context.datasource,
    browser: parsed.context.browser
  });
  const body = {
    fields: {
      project: { key: settings.projectKey },
      issuetype: { name: settings.defaultIssueType },
      summary: parsed.summary,
      description,
      labels: settings.defaultLabels,
      ...(settings.defaultAssigneeAccountId
        ? { assignee: {
            accountId: settings.defaultAssigneeAccountId
          } }
        : {})
    }
  };
  const authHeader = basicAuth(
    process.env.JIRA_SERVICE_EMAIL!,
    process.env.JIRA_API_TOKEN!
  );
  try {
    const upstream = await getJiraQueue().add(() => fetch(
      `${process.env.JIRA_BASE_URL}/rest/api/3/issue`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body: JSON.stringify(body)
      }
    ));
    if (!upstream.ok) {
      const retryAfter = Number(
        upstream.headers.get("Retry-After")
      );
      let upstreamBody: unknown = {};
      try { upstreamBody = await upstream.json(); } catch {}
      const err = mapJiraError({
        status: upstream.status,
        upstreamBody,
        retryAfterSeconds: Number.isFinite(retryAfter)
          ? retryAfter : undefined
      });
      return respondError(upstream.status, err);
    }
    const created = (await upstream.json()) as {
      key: string; id: string;
    };
    return NextResponse.json({
      key: created.key,
      url: `${process.env.JIRA_BASE_URL}/browse/${created.key}`
    }, { status: 201 });
  } catch {
    return respondError(502, {
      category: "retryable",
      userMessage: "JIRA is temporarily unavailable.",
      logCode: "jira.issue.network"
    });
  }
}

function basicAuth(user: string, pass: string): string {
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

function respondError(
  status: number,
  error: {
    category: string; userMessage: string; logCode: string;
  }
) {
  return NextResponse.json({ error }, { status });
}
