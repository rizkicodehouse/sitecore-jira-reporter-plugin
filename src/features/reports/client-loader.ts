// Browser-side reports loader. Searches XMC for every item
// of the BugReport template under `/sitecore/content`, then
// slices to the requested offset/limit. Works from fullscreen
// (no pages.context available) because it doesn't require a
// tenant/site scope — reports are listed across the whole
// instance.

import type { XmcClient } from "@/services/sitecore/xmc";
import {
  TEMPLATE_ID_BUG_REPORT, REPORT_FIELD
} from "@/services/sitecore/templates";
import {
  ReportRecordSchema, type ReportRecord
} from "@/lib/reports-store";
import type { ReportsPage } from "./types";

export async function loadReportsFromXmc(
  client: XmcClient,
  { offset, limit }: { offset: number; limit: number }
): Promise<ReportsPage> {
  const batch = Math.max(limit, 50);
  let cursor: string | undefined = undefined;
  let total = 0;
  let skipped = 0;
  const collected: ReportRecord[] = [];
  while (true) {
    const page = await client.searchItems({
      rootPath: "/sitecore/content",
      templateId: TEMPLATE_ID_BUG_REPORT,
      first: batch,
      after: cursor
    });
    total = page.totalCount;
    for (const raw of page.items) {
      if (skipped < offset) { skipped += 1; continue; }
      if (collected.length >= limit) break;
      const parsed = fromFields(raw.fields);
      if (parsed) collected.push(parsed);
    }
    if (
      collected.length >= limit ||
      !page.hasNext ||
      !page.endCursor
    ) {
      break;
    }
    cursor = page.endCursor;
  }
  return { items: collected, total, offset, limit };
}

function fromFields(
  f: Record<string, string>
): ReportRecord | null {
  const reporterRaw = f[REPORT_FIELD.reporter] ?? "";
  const parsedReporter = parseReporter(reporterRaw);
  const candidate = {
    jiraKey: f[REPORT_FIELD.ticketKey] ?? "",
    jiraUrl: f[REPORT_FIELD.ticketUrl] ?? "",
    summary: f[REPORT_FIELD.summary] ?? "",
    issueType: f[REPORT_FIELD.issueType] ?? "",
    reporter: parsedReporter,
    page:
      f[REPORT_FIELD.pagePath] || f[REPORT_FIELD.pageTitle]
        ? {
            title: f[REPORT_FIELD.pageTitle] ?? "",
            url: f[REPORT_FIELD.pagePath] ?? "",
            language: "", site: ""
          }
        : null,
    rendering: f[REPORT_FIELD.renderingInstanceId]
      ? {
          instanceId:
            f[REPORT_FIELD.renderingInstanceId] ?? "",
          name: f[REPORT_FIELD.renderingName] || undefined
        }
      : null,
    datasourceId: f[REPORT_FIELD.datasourceItemId] || null,
    createdAt: f[REPORT_FIELD.createdAt] ?? ""
  };
  const result = ReportRecordSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

function parseReporter(raw: string) {
  if (!raw) return null;
  const m = raw.match(/^(.*)\s*<([^>]+)>$/);
  if (!m) return null;
  return {
    name: (m[1] ?? "").trim(),
    email: (m[2] ?? "").trim()
  };
}
