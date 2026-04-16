import type { XmcClient, SitecoreField } from
  "@/services/sitecore/xmc";
import {
  REPORT_FIELD, bugReportsRootPath,
  TEMPLATE_ID_BUG_REPORT
} from "@/services/sitecore/templates";
import {
  ReportRecordSchema, type ReportRecord, type ListPage
} from "./reports-store";

export type ReportsSitecoreRepoOptions = {
  client: XmcClient;
  language?: string;
};

export type ReportsSitecoreRepo = {
  append: (
    tenant: string, site: string, record: ReportRecord
  ) => Promise<void>;
  list: (
    tenant: string, site: string,
    opts: { offset: number; limit: number }
  ) => Promise<ListPage>;
};

const DUP_PATTERNS = [
  /item name is not unique/i,
  /already exists/i,
  /duplicate/i
];

export function createReportsSitecoreRepo(
  opts: ReportsSitecoreRepoOptions
): ReportsSitecoreRepo {
  const lang = opts.language ?? "en";
  const { client } = opts;

  return {
    async append(tenant, site, record) {
      const parsed = ReportRecordSchema.parse(record);
      try {
        await client.createItem({
          name: parsed.jiraKey,
          parent: bugReportsRootPath(tenant, site),
          templateId: TEMPLATE_ID_BUG_REPORT,
          language: lang,
          fields: toFields(parsed)
        });
      } catch (e) {
        if (isDuplicate(e)) return;
        throw e;
      }
    },

    async list(tenant, site, { offset, limit }) {
      // Sitecore bucket search is cursor-paginated but the
      // reports UI uses offset/limit. Translate by fetching
      // pages until we reach `offset`, then returning the
      // next slice. For the plugin's cap (500 records) this
      // is fine; revisit if totals outgrow that.
      const page = await fetchOffsetPage({
        client, tenant, site, offset, limit, lang
      });
      return { ...page, offset, limit };
    }
  };
}

async function fetchOffsetPage(args: {
  client: XmcClient;
  tenant: string;
  site: string;
  offset: number;
  limit: number;
  lang: string;
}): Promise<ListPage> {
  const batch = Math.max(args.limit, 50);
  let cursor: string | undefined = undefined;
  let total = 0;
  const collected: ReportRecord[] = [];
  let skipped = 0;

  while (true) {
    const page: import("@/services/sitecore/xmc").SearchPage =
      await args.client.searchItems({
        rootPath: bugReportsRootPath(args.tenant, args.site),
        templateId: TEMPLATE_ID_BUG_REPORT,
        first: batch,
        after: cursor
      });
    total = page.totalCount;
    for (const raw of page.items) {
      if (skipped < args.offset) { skipped += 1; continue; }
      if (collected.length >= args.limit) break;
      const parsed = fromFields(raw.fields);
      if (parsed) collected.push(parsed);
    }
    if (
      collected.length >= args.limit ||
      !page.hasNext ||
      !page.endCursor
    ) {
      break;
    }
    cursor = page.endCursor;
  }
  return {
    items: collected, total,
    offset: args.offset, limit: args.limit
  };
}

function isDuplicate(e: unknown): boolean {
  const msg = (e as Error)?.message ?? "";
  return DUP_PATTERNS.some((p) => p.test(msg));
}

function toFields(r: ReportRecord): SitecoreField[] {
  const reporter = r.reporter
    ? `${r.reporter.name} <${r.reporter.email}>` : "";
  return [
    { name: REPORT_FIELD.ticketKey, value: r.jiraKey },
    { name: REPORT_FIELD.ticketUrl, value: r.jiraUrl },
    { name: REPORT_FIELD.summary, value: r.summary },
    { name: REPORT_FIELD.issueType, value: r.issueType },
    { name: REPORT_FIELD.pageItemId,
      value: r.page ? "" : "" },
    { name: REPORT_FIELD.pagePath,
      value: r.page?.url ?? "" },
    { name: REPORT_FIELD.renderingInstanceId,
      value: r.rendering?.instanceId ?? "" },
    { name: REPORT_FIELD.renderingName,
      value: r.rendering?.name ?? "" },
    { name: REPORT_FIELD.datasourceItemId,
      value: r.datasourceId ?? "" },
    { name: REPORT_FIELD.reporter, value: reporter },
    { name: REPORT_FIELD.createdAt, value: r.createdAt },
    { name: REPORT_FIELD.sprint,
      value: r.sprintAssigned ? "yes" : "no" }
  ];
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
    page: f[REPORT_FIELD.pagePath]
      ? { title: "", url: f[REPORT_FIELD.pagePath] ?? "",
          language: "", site: "" }
      : null,
    rendering: f[REPORT_FIELD.renderingInstanceId]
      ? {
          instanceId:
            f[REPORT_FIELD.renderingInstanceId] ?? "",
          name: f[REPORT_FIELD.renderingName] || undefined
        }
      : null,
    datasourceId: f[REPORT_FIELD.datasourceItemId] || null,
    sprintAssigned:
      (f[REPORT_FIELD.sprint] ?? "").toLowerCase()
        === "yes",
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
