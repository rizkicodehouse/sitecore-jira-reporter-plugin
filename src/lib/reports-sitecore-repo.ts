import type { XmcClient, SitecoreField } from
  "@/services/sitecore/xmc";
import {
  REPORT_FIELD, bugReportsRootPath,
  TEMPLATE_ID_BUG_REPORT
} from "@/services/sitecore/templates";
import {
  BUG_REPORT_TEMPLATE_PATH,
  PLUGIN_BUG_ICON
} from "@/services/sitecore/template-provision";
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
  // Cache the per-tenant template GUID for the lifetime of
  // the repo — it never changes once ensureFeatureTemplates
  // has run, so one itemByPath per repo is enough.
  let cachedTemplateId: string | null = null;

  return {
    async append(tenant, site, record) {
      const parsed = ReportRecordSchema.parse(record);
      if (!cachedTemplateId) {
        const tplItem = await client.itemByPath(
          BUG_REPORT_TEMPLATE_PATH, lang
        );
        cachedTemplateId = tplItem?.itemId
          ?? TEMPLATE_ID_BUG_REPORT;
      }
      const templateId = cachedTemplateId;
      try {
        await client.createItem({
          name: parsed.jiraKey,
          parent: bugReportsRootPath(tenant, site),
          templateId,
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
        templateName: "BugReport",
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
  const fields: SitecoreField[] = [
    { name: REPORT_FIELD.ticketKey, value: r.jiraKey },
    { name: REPORT_FIELD.ticketUrl, value: r.jiraUrl },
    { name: REPORT_FIELD.summary, value: r.summary },
    { name: REPORT_FIELD.issueType, value: r.issueType },
    { name: REPORT_FIELD.pageItemId,
      value: r.page ? "" : "" },
    { name: REPORT_FIELD.pagePath,
      value: r.page?.url ?? "" },
    { name: REPORT_FIELD.pageTitle,
      value: r.page?.title ?? "" },
    { name: REPORT_FIELD.renderingInstanceId,
      value: r.rendering?.instanceId ?? "" },
    { name: REPORT_FIELD.renderingName,
      value: r.rendering?.name ?? "" },
    { name: REPORT_FIELD.datasourceItemId,
      value: r.datasourceId ?? "" },
    { name: REPORT_FIELD.reporter, value: reporter },
    { name: REPORT_FIELD.createdAt,
      value: toSitecoreDatetime(r.createdAt) }
  ];

  // Ensure the created item explicitly marks itself as bucketable
  // and carries the plugin icon so it doesn't rely on timing of
  // template standard-values provisioning on the server.
  fields.push({ name: "__Bucketable", value: "1" });
  fields.push({ name: "__Icon", value: PLUGIN_BUG_ICON });

  return fields;
}

// Sitecore's Datetime field expects ISO-8601 *basic*
// (yyyyMMddTHHmmssZ), not extended (yyyy-MM-ddTHH:mm:ss.sssZ).
// Passing the extended form silently stores DateTime.MinValue,
// which surfaces as "1/1/0001 12:00 AM" in Content Editor.
function toSitecoreDatetime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // "2026-04-17T12:34:56.789Z" → "20260417T123456Z"
  return d.toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function fromSitecoreDatetime(raw: string): string {
  if (!raw) return "";
  // Accept either basic ("20260417T123456Z") or extended
  // ISO. Readers elsewhere in the codebase expect the
  // extended form, so normalise on the way out.
  const m = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/
  );
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T` +
      `${m[4]}:${m[5]}:${m[6]}.000Z`;
  }
  return raw;
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
    page: f[REPORT_FIELD.pagePath] || f[REPORT_FIELD.pageTitle]
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
    createdAt: fromSitecoreDatetime(
      f[REPORT_FIELD.createdAt] ?? ""
    )
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
