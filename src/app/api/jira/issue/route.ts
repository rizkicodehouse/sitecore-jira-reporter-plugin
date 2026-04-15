import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySdkSession, getTenantId } from "@/lib/auth";
import { getSettingsStore } from "@/lib/settings-store";
import { getJiraQueue } from "@/lib/rate-limit";
import { mapJiraError } from "@/lib/jira-errors";
import { buildDescription } from "@/lib/adf";
import {
  resolveJiraCreds, basicAuthHeader
} from "@/lib/jira-creds";
import {
  getBoardSprintInfo, addIssueToSprint
} from "@/lib/jira-board";

const ContextSchema = z.object({
  page: z.object({
    title: z.string(), url: z.string(),
    language: z.string(), site: z.string()
  }).nullable(),
  rendering: z.object({
    instanceId: z.string(),
    renderingId: z.string().optional(),
    name: z.string().optional(),
    templateName: z.string().optional(),
    placeholderKey: z.string().optional(),
    dataSource: z.string().optional()
  }).nullable().optional(),
  renderings: z.array(z.unknown()).optional(),
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
  attachmentCount: z.number().int().min(0),
  customFields: z.record(z.unknown()).optional()
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
  const tenantId = getTenantId(req);
  const creds = await resolveJiraCreds(tenantId);
  if (creds.source === "none") {
    return respondError(412, {
      category: "config",
      userMessage:
        "JIRA is not configured. Open Settings and set " +
        "base URL, service email, and API token.",
      logCode: "jira.issue.not-configured"
    });
  }
  const settings = tenantId
    ? await getSettingsStore().get(tenantId)
    : null;
  // Tenant record is authoritative. Env is ONLY used
  // when there's no tenant at all (single-tenant dev
  // fallback). Mixing them hides tenant misconfiguration.
  const projectKey = settings
    ? settings.projectKey
    : process.env.JIRA_DEFAULT_PROJECT_KEY ?? "";
  if (!projectKey) {
    return respondError(412, {
      category: "config",
      userMessage:
        "Target JIRA project key is not set. Open " +
        "Settings and set the project key.",
      logCode: "jira.issue.no-project"
    });
  }
  const issueType = settings
    ? settings.defaultIssueType
    : process.env.JIRA_DEFAULT_ISSUE_TYPE ?? "Bug";
  const labels = settings
    ? settings.defaultLabels
    : ["page-builder"];
  const assignee = settings
    ? settings.defaultAssigneeAccountId
    : null;
  const description = buildDescription({
    description: parsed.descriptionText,
    reporter: parsed.context.reporter,
    page: parsed.context.page && {
      title: parsed.context.page.title,
      url: parsed.context.page.url,
      language: parsed.context.page.language,
      site: parsed.context.page.site
    },
    rendering: parsed.context.rendering ?? null,
    datasource: parsed.context.datasource,
    browser: parsed.context.browser
  });
  type JiraFields = Record<string, unknown>;
  const fields: JiraFields = {
    project: { key: projectKey },
    issuetype: { name: issueType },
    summary: parsed.summary,
    description,
    labels,
    ...(assignee
      ? { assignee: { accountId: assignee } }
      : {}),
    // Client-supplied custom fields (from the dynamic
    // form built from JIRA createmeta). These win over
    // our defaults if they collide.
    ...(parsed.customFields ?? {})
  };
  const authHeader = basicAuthHeader(
    creds.serviceEmail, creds.apiToken
  );
  const postIssue = (body: { fields: JiraFields }) =>
    getJiraQueue().add(() => fetch(
      `${creds.baseUrl}/rest/api/3/issue`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body: JSON.stringify(body)
      }
    ));
  const droppedFields: string[] = [];
  try {
    let upstream = await postIssue({ fields });
    if (upstream.status === 400) {
      // Parse JIRA's error body. Any field tagged with
      // "cannot be set" is a screen-config mismatch —
      // strip it and retry. Track what was dropped so
      // we can re-add via a comment afterwards.
      let errBody: unknown = {};
      try { errBody = await upstream.clone().json(); }
      catch {}
      const rejected = readRejectedFields(errBody);
      if (rejected.length > 0) {
        for (const k of rejected) {
          if (k in fields) {
            delete fields[k];
            droppedFields.push(k);
          }
        }
        if (droppedFields.length > 0) {
          upstream = await postIssue({ fields });
        }
      }
    }
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
    if (droppedFields.includes("description")) {
      // Fallback: post the full description as a comment
      // on the new issue. Always allowed by JIRA.
      try {
        await fetch(
          `${creds.baseUrl}/rest/api/3/issue/` +
          `${encodeURIComponent(created.key)}/comment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader
            },
            body: JSON.stringify({ body: description })
          }
        );
      } catch { /* non-fatal */ }
    }
    const boardId = settings?.defaultBoardId ?? null;
    let sprintAssigned = false;
    if (boardId) {
      try {
        const info = await getBoardSprintInfo(
          creds.baseUrl,
          creds.serviceEmail,
          creds.apiToken,
          boardId
        );
        if (info.activeSprintId) {
          sprintAssigned = await addIssueToSprint(
            creds.baseUrl,
            creds.serviceEmail,
            creds.apiToken,
            info.activeSprintId,
            created.key
          );
        }
      } catch {
        /* non-fatal: issue is created, just not in a sprint */
      }
    }
    return NextResponse.json({
      key: created.key,
      url: `${creds.baseUrl}/browse/${created.key}`,
      sprintAssigned
    }, { status: 201 });
  } catch {
    return respondError(502, {
      category: "retryable",
      userMessage: "JIRA is temporarily unavailable.",
      logCode: "jira.issue.network"
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

function readRejectedFields(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const errs = (body as {
    errors?: Record<string, string>;
  }).errors;
  if (!errs) return [];
  const rejected: string[] = [];
  for (const [field, msg] of Object.entries(errs)) {
    if (/cannot be set|unknown|not on the appropriate/i
        .test(msg)) {
      rejected.push(field);
    }
  }
  return rejected;
}
