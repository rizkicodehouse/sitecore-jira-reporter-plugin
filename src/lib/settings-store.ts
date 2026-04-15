import { z } from "zod";
import { encryptSecret, decryptSecret } from "./crypto";

export const PublicSettingsSchema = z.object({
  projectKey: z.string().min(1),
  defaultIssueType: z.string().min(1),
  defaultLabels: z.array(z.string()),
  defaultAssigneeAccountId: z.string().nullable(),
  defaultBoardId: z.number().int().positive().nullable(),
  jiraBaseUrl: z.string(),
  jiraServiceEmail: z.string(),
  hasJiraApiToken: z.boolean(),
  adminEmails: z.array(z.string()),
  maxAttachmentMb: z.number().int().positive().optional()
});
export type PublicSettings = z.infer<typeof PublicSettingsSchema>;

export const SettingsUpdateSchema = z.object({
  projectKey: z.string().min(1),
  defaultIssueType: z.string().min(1),
  defaultLabels: z.array(z.string()),
  defaultAssigneeAccountId: z.string().nullable(),
  defaultBoardId: z.number().int().positive().nullable(),
  jiraBaseUrl: z.string().url().or(z.literal("")),
  jiraServiceEmail: z.string(),
  jiraApiToken: z.string().optional(),
  adminEmails: z.array(z.string()),
  maxAttachmentMb: z.number().int().positive().optional()
});
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

export type StoredSettings = Omit<
  SettingsUpdate, "jiraApiToken"
> & { jiraApiTokenEnc: string | null };

export const DEFAULT_SETTINGS: StoredSettings = {
  projectKey: "",
  defaultIssueType: "Bug",
  defaultLabels: ["page-builder"],
  defaultAssigneeAccountId: null,
  defaultBoardId: null,
  jiraBaseUrl: "",
  jiraServiceEmail: "",
  jiraApiTokenEnc: null,
  adminEmails: [],
  maxAttachmentMb: undefined
};

export type StoreOptions = {
  driver: "memory" | "upstash";
  cacheMs: number;
  onRead?: () => void;
  onWrite?: () => void;
};

type CacheEntry = { value: StoredSettings; at: number };

// Hoist stateful Maps onto globalThis so Next.js hot
// module reload doesn't wipe them on every file save
// during dev. In prod this is a no-op.
type StoreGlobals = {
  __jiraPluginSettingsMem?: Map<string, StoredSettings>;
  __jiraPluginSettingsCache?: Map<string, CacheEntry>;
};
const g = globalThis as unknown as StoreGlobals;
const SHARED_MEM =
  g.__jiraPluginSettingsMem ??
  (g.__jiraPluginSettingsMem = new Map());
const SHARED_CACHE =
  g.__jiraPluginSettingsCache ??
  (g.__jiraPluginSettingsCache = new Map());

export class SettingsStore {
  private cache = SHARED_CACHE;
  private mem = SHARED_MEM;
  constructor(private readonly opts: StoreOptions) {}

  async get(tenantId: string): Promise<StoredSettings> {
    assertTenantId(tenantId);
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && now - cached.at < this.opts.cacheMs) {
      return cached.value;
    }
    this.opts.onRead?.();
    const fresh = this.opts.driver === "memory"
      ? this.mem.get(tenantId) ?? DEFAULT_SETTINGS
      : await this.readKv(tenantId);
    this.cache.set(tenantId, { value: fresh, at: now });
    return fresh;
  }

  async getPublic(tenantId: string): Promise<PublicSettings> {
    const s = await this.get(tenantId);
    return toPublic(s);
  }

  async getDecryptedApiToken(
    tenantId: string
  ): Promise<string> {
    const s = await this.get(tenantId);
    if (!s.jiraApiTokenEnc) return "";
    return decryptSecret(s.jiraApiTokenEnc, tenantId);
  }

  async put(
    tenantId: string, update: SettingsUpdate
  ): Promise<PublicSettings> {
    assertTenantId(tenantId);
    const parsed = SettingsUpdateSchema.parse(update);
    const existing = await this.get(tenantId);
    const nextToken = parsed.jiraApiToken !== undefined
      && parsed.jiraApiToken !== ""
      ? await encryptSecret(parsed.jiraApiToken, tenantId)
      : existing.jiraApiTokenEnc;
    const { jiraApiToken: _drop, ...rest } = parsed;
    const stored: StoredSettings = {
      ...rest,
      jiraApiTokenEnc: nextToken
    };
    this.opts.onWrite?.();
    if (this.opts.driver === "memory") {
      this.mem.set(tenantId, stored);
    } else {
      await this.writeKv(tenantId, stored);
    }
    this.cache.set(tenantId, {
      value: stored, at: Date.now()
    });
    return toPublic(stored);
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }

  private keyOf(tenantId: string): string {
    return `plugin:settings:${tenantId}`;
  }

  private async readKv(
    tenantId: string
  ): Promise<StoredSettings> {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    const raw = await r.get<StoredSettings>(
      this.keyOf(tenantId)
    );
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...raw };
  }

  private async writeKv(
    tenantId: string, value: StoredSettings
  ): Promise<void> {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    await r.set(this.keyOf(tenantId), value);
  }
}

function toPublic(s: StoredSettings): PublicSettings {
  return {
    projectKey: s.projectKey,
    defaultIssueType: s.defaultIssueType,
    defaultLabels: s.defaultLabels,
    defaultAssigneeAccountId: s.defaultAssigneeAccountId,
    defaultBoardId: s.defaultBoardId ?? null,
    jiraBaseUrl: s.jiraBaseUrl,
    jiraServiceEmail: s.jiraServiceEmail,
    hasJiraApiToken: Boolean(s.jiraApiTokenEnc),
    adminEmails: s.adminEmails,
    maxAttachmentMb: s.maxAttachmentMb
  };
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
  __jiraPluginSettingsSingleton?: SettingsStore | null;
};
const sg = globalThis as unknown as SingletonGlobals;

export function getSettingsStore(): SettingsStore {
  if (!sg.__jiraPluginSettingsSingleton) {
    const driver = process.env.UPSTASH_REDIS_REST_URL
      ? "upstash" : "memory";
    sg.__jiraPluginSettingsSingleton = new SettingsStore({
      driver, cacheMs: 30_000
    });
  }
  return sg.__jiraPluginSettingsSingleton;
}

export function resetSettingsStoreForTests() {
  sg.__jiraPluginSettingsSingleton = null;
  SHARED_MEM.clear();
  SHARED_CACHE.clear();
}
