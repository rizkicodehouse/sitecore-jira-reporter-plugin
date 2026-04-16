import { z } from "zod";
import { isSitecoreDatastore } from "./datastore-mode";
import type {
  ReportsSitecoreRepo
} from "./reports-sitecore-repo";

export const ReportRecordSchema = z.object({
  jiraKey: z.string().min(1),
  jiraUrl: z.string(),
  summary: z.string(),
  issueType: z.string(),
  reporter: z.object({
    email: z.string(),
    name: z.string()
  }).nullable(),
  page: z.object({
    title: z.string(),
    url: z.string(),
    language: z.string(),
    site: z.string()
  }).nullable(),
  rendering: z.object({
    instanceId: z.string(),
    renderingId: z.string().optional(),
    name: z.string().optional(),
    templateName: z.string().optional(),
    placeholderKey: z.string().optional()
  }).nullable(),
  datasourceId: z.string().nullable(),
  sprintAssigned: z.boolean(),
  createdAt: z.string()
});
export type ReportRecord = z.infer<typeof ReportRecordSchema>;

export type StoreOptions = {
  driver: "memory" | "sitecore";
  maxRecords: number;
  onRead?: () => void;
  onWrite?: () => void;
  sitecore?: {
    tenant: string;
    site: string;
    getRepo: () => Promise<ReportsSitecoreRepo>;
  };
};

export type ListPage = {
  items: ReportRecord[];
  total: number;
  offset: number;
  limit: number;
};

type StoreGlobals = {
  __jiraPluginReportsMem?: Map<string, ReportRecord[]>;
};
const g = globalThis as unknown as StoreGlobals;
const SHARED_MEM =
  g.__jiraPluginReportsMem ??
  (g.__jiraPluginReportsMem = new Map());

export class ReportsStore {
  private mem = SHARED_MEM;
  constructor(private readonly opts: StoreOptions) {}

  async append(
    tenantId: string, record: ReportRecord
  ): Promise<void> {
    assertTenantId(tenantId);
    const parsed = ReportRecordSchema.parse(record);
    this.opts.onWrite?.();
    if (this.opts.driver === "sitecore") {
      const cfg = this.opts.sitecore;
      if (!cfg) throw new Error(
        "reports-store: sitecore driver missing options"
      );
      const repo = await cfg.getRepo();
      await repo.append(cfg.tenant, cfg.site, parsed);
      return;
    }
    const list = this.mem.get(tenantId) ?? [];
    list.unshift(parsed);
    if (list.length > this.opts.maxRecords) {
      list.length = this.opts.maxRecords;
    }
    this.mem.set(tenantId, list);
  }

  async list(
    tenantId: string,
    { offset = 0, limit = 50 }: {
      offset?: number; limit?: number;
    } = {}
  ): Promise<ListPage> {
    assertTenantId(tenantId);
    this.opts.onRead?.();
    if (this.opts.driver === "sitecore") {
      const cfg = this.opts.sitecore;
      if (!cfg) throw new Error(
        "reports-store: sitecore driver missing options"
      );
      const repo = await cfg.getRepo();
      return repo.list(cfg.tenant, cfg.site, { offset, limit });
    }
    const list = this.mem.get(tenantId) ?? [];
    return {
      items: list.slice(offset, offset + limit),
      total: list.length,
      offset,
      limit
    };
  }
}

function assertTenantId(tenantId: string) {
  if (!tenantId || !/^[A-Za-z0-9_\-:.]+$/.test(tenantId)) {
    throw new Error(
      "invalid tenantId — must be non-empty, " +
      "alphanumeric plus _-:.)"
    );
  }
}

type SingletonGlobals = {
  __jiraPluginReportsSingleton?: ReportsStore | null;
};
const sg = globalThis as unknown as SingletonGlobals;

export function getReportsStore(): ReportsStore {
  if (!sg.__jiraPluginReportsSingleton) {
    if (isSitecoreDatastore()) {
      sg.__jiraPluginReportsSingleton = new ReportsStore({
        driver: "sitecore", maxRecords: 500,
        // tenant/site/repo arrive per-request via
        // buildRequestReportsStore. The singleton is
        // retained for legacy callers that don't pass a
        // request; those paths will throw with a helpful
        // error if they hit the driver directly.
        sitecore: undefined
      });
      return sg.__jiraPluginReportsSingleton;
    }
    sg.__jiraPluginReportsSingleton = new ReportsStore({
      driver: "memory", maxRecords: 500
    });
  }
  return sg.__jiraPluginReportsSingleton;
}

export function buildRequestReportsStore(args: {
  tenant: string; site: string;
  getRepo: () => Promise<ReportsSitecoreRepo>;
  maxRecords?: number;
}): ReportsStore {
  return new ReportsStore({
    driver: "sitecore",
    maxRecords: args.maxRecords ?? 500,
    sitecore: {
      tenant: args.tenant, site: args.site,
      getRepo: args.getRepo
    }
  });
}

export function resetReportsStoreForTests() {
  sg.__jiraPluginReportsSingleton = null;
  SHARED_MEM.clear();
}
