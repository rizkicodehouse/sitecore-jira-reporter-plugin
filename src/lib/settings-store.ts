import { encryptSecret, decryptSecret } from "./crypto";
import type {
  SettingsSitecoreRepo
} from "./settings-sitecore-repo";
import {
  PublicSettingsSchema,
  SettingsUpdateSchema,
  DEFAULT_SETTINGS,
  type PublicSettings,
  type SettingsUpdate,
  type StoredSettings
} from "./settings-types";

export {
  PublicSettingsSchema,
  SettingsUpdateSchema,
  DEFAULT_SETTINGS
};
export type { PublicSettings, SettingsUpdate, StoredSettings };

export type StoreOptions = {
  driver: "memory" | "sitecore";
  cacheMs: number;
  onRead?: () => void;
  onWrite?: () => void;
  sitecore?: {
    tenant: string;
    site: string;
    getRepo: () => Promise<SettingsSitecoreRepo>;
  };
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
    const fresh = await this.readByDriver(tenantId);
    this.cache.set(tenantId, { value: fresh, at: now });
    return fresh;
  }

  private async readByDriver(
    tenantId: string
  ): Promise<StoredSettings> {
    if (this.opts.driver === "memory") {
      return this.mem.get(tenantId) ?? DEFAULT_SETTINGS;
    }
    const cfg = this.opts.sitecore;
    if (!cfg) {
      throw new Error(
        "settings-store: sitecore driver selected but " +
        "sitecore options are missing"
      );
    }
    const repo = await cfg.getRepo();
    return repo.read(cfg.tenant, cfg.site);
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
    await this.writeByDriver(tenantId, stored);
    this.cache.set(tenantId, {
      value: stored, at: Date.now()
    });
    return toPublic(stored);
  }

  private async writeByDriver(
    tenantId: string, value: StoredSettings
  ): Promise<void> {
    if (this.opts.driver === "memory") {
      this.mem.set(tenantId, value);
      return;
    }
    const cfg = this.opts.sitecore;
    if (!cfg) {
      throw new Error(
        "settings-store: sitecore driver selected but " +
        "sitecore options are missing"
      );
    }
    const repo = await cfg.getRepo();
    await repo.write(cfg.tenant, cfg.site, value);
  }
}

function toPublic(s: StoredSettings): PublicSettings {
  return {
    projectKey: s.projectKey,
    defaultIssueType: s.defaultIssueType,
    defaultLabels: s.defaultLabels,
    defaultBoardId: s.defaultBoardId ?? null,
    jiraBaseUrl: s.jiraBaseUrl,
    jiraServiceEmail: s.jiraServiceEmail,
    hasJiraApiToken: Boolean(s.jiraApiTokenEnc),
    adminEmails: s.adminEmails
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

/**
 * Returns a process-wide singleton SettingsStore. In practice
 * production code should call `buildRequestSettingsStore`
 * instead, since the Sitecore driver requires per-request
 * tenant/site/client wiring. This singleton is retained for
 * unit tests that only need the "memory" driver.
 */
export function getSettingsStore(): SettingsStore {
  if (!sg.__jiraPluginSettingsSingleton) {
    sg.__jiraPluginSettingsSingleton = new SettingsStore({
      driver: "memory", cacheMs: 30_000
    });
  }
  return sg.__jiraPluginSettingsSingleton;
}

export function buildRequestSettingsStore(args: {
  tenant: string;
  site: string;
  getRepo: () => Promise<SettingsSitecoreRepo>;
  cacheMs?: number;
}): SettingsStore {
  return new SettingsStore({
    driver: "sitecore",
    cacheMs: args.cacheMs ?? 0,
    sitecore: {
      tenant: args.tenant, site: args.site,
      getRepo: args.getRepo
    }
  });
}

export function resetSettingsStoreForTests() {
  sg.__jiraPluginSettingsSingleton = null;
  SHARED_MEM.clear();
  SHARED_CACHE.clear();
}
