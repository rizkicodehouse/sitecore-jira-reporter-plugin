import { z } from "zod";
import { selectDriver } from "./storage-guard";

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
  driver: "memory" | "upstash";
  maxRecords: number;
  onRead?: () => void;
  onWrite?: () => void;
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
    if (this.opts.driver === "memory") {
      const list = this.mem.get(tenantId) ?? [];
      list.unshift(parsed);
      if (list.length > this.opts.maxRecords) {
        list.length = this.opts.maxRecords;
      }
      this.mem.set(tenantId, list);
      return;
    }
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    const key = this.keyOf(tenantId);
    await r.lpush(key, JSON.stringify(parsed));
    await r.ltrim(key, 0, this.opts.maxRecords - 1);
  }

  async list(
    tenantId: string,
    { offset = 0, limit = 50 }: {
      offset?: number; limit?: number;
    } = {}
  ): Promise<ListPage> {
    assertTenantId(tenantId);
    this.opts.onRead?.();
    if (this.opts.driver === "memory") {
      const list = this.mem.get(tenantId) ?? [];
      return {
        items: list.slice(offset, offset + limit),
        total: list.length,
        offset,
        limit
      };
    }
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    const key = this.keyOf(tenantId);
    const total = await r.llen(key);
    const end = offset + limit - 1;
    const raw = await r.lrange<string>(key, offset, end);
    const items: ReportRecord[] = [];
    for (const entry of raw) {
      const parsed = safeParseRecord(entry);
      if (parsed) items.push(parsed);
    }
    return { items, total, offset, limit };
  }

  private keyOf(tenantId: string): string {
    return `plugin:reports:${tenantId}`;
  }
}

function safeParseRecord(
  entry: string | ReportRecord | null | undefined
): ReportRecord | null {
  if (!entry) return null;
  try {
    const obj = typeof entry === "string"
      ? JSON.parse(entry) : entry;
    const r = ReportRecordSchema.safeParse(obj);
    return r.success ? r.data : null;
  } catch {
    return null;
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
    const driver = selectDriver({
      source: "reports-store"
    });
    sg.__jiraPluginReportsSingleton = new ReportsStore({
      driver, maxRecords: 500
    });
  }
  return sg.__jiraPluginReportsSingleton;
}

export function resetReportsStoreForTests() {
  sg.__jiraPluginReportsSingleton = null;
  SHARED_MEM.clear();
}
