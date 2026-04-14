import { z } from "zod";

export const SettingsSchema = z.object({
  projectKey: z.string().min(1),
  defaultIssueType: z.string().min(1),
  defaultLabels: z.array(z.string()),
  defaultAssigneeAccountId: z.string().nullable()
});
export type Settings = z.infer<typeof SettingsSchema>;

const DEFAULTS: Settings = {
  projectKey: "CLD",
  defaultIssueType: "Bug",
  defaultLabels: ["page-builder"],
  defaultAssigneeAccountId: null
};

export type StoreOptions = {
  driver: "memory" | "vercel-kv";
  cacheMs: number;
  onRead?: () => void;
  onWrite?: () => void;
};

export class SettingsStore {
  private cache: { value: Settings; at: number } | null = null;
  private mem: Settings = DEFAULTS;
  constructor(private readonly opts: StoreOptions) {}

  async get(): Promise<Settings> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.opts.cacheMs) {
      return this.cache.value;
    }
    this.opts.onRead?.();
    const fresh = this.opts.driver === "memory"
      ? this.mem
      : await this.readKv();
    this.cache = { value: fresh, at: now };
    return fresh;
  }

  async put(next: Settings): Promise<void> {
    SettingsSchema.parse(next);
    this.opts.onWrite?.();
    if (this.opts.driver === "memory") {
      this.mem = next;
    } else {
      await this.writeKv(next);
    }
    this.cache = { value: next, at: Date.now() };
  }

  private async readKv(): Promise<Settings> {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    const raw = await r.get<Settings>("plugin:settings");
    return raw ? SettingsSchema.parse(raw) : DEFAULTS;
  }

  private async writeKv(value: Settings): Promise<void> {
    const { Redis } = await import("@upstash/redis");
    const r = Redis.fromEnv();
    await r.set("plugin:settings", value);
  }
}

let singleton: SettingsStore | null = null;
export function getSettingsStore(): SettingsStore {
  if (!singleton) {
    const driver = process.env.UPSTASH_REDIS_REST_URL
      ? "vercel-kv" : "memory";
    singleton = new SettingsStore({ driver, cacheMs: 30_000 });
  }
  return singleton;
}
