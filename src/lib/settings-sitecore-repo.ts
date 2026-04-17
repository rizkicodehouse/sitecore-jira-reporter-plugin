import type { XmcClient, SitecoreField } from
  "@/services/sitecore/xmc";
import {
  SETTINGS_FIELD, settingsConfigPath
} from "@/services/sitecore/templates";
import {
  DEFAULT_SETTINGS, type StoredSettings
} from "./settings-types";

export type SettingsSitecoreRepoOptions = {
  client: XmcClient;
  language?: string;
};

export type SettingsSitecoreRepo = {
  exists: (
    tenant: string, site: string
  ) => Promise<boolean>;
  read: (
    tenant: string, site: string
  ) => Promise<StoredSettings>;
  write: (
    tenant: string, site: string, value: StoredSettings
  ) => Promise<void>;
};

export class SettingsNotProvisionedError extends Error {
  constructor(path: string) {
    super(
      `Settings item not provisioned at ${path}. ` +
      `Run the initial-installation flow first.`
    );
    this.name = "SettingsNotProvisionedError";
  }
}

export function createSettingsSitecoreRepo(
  opts: SettingsSitecoreRepoOptions
): SettingsSitecoreRepo {
  const lang = opts.language ?? "en";
  const { client } = opts;

  return {
    async exists(tenant, site) {
      const path = settingsConfigPath(tenant, site);
      const item = await client.itemByPath(path, lang);
      return Boolean(item);
    },

    async read(tenant, site) {
      const path = settingsConfigPath(tenant, site);
      const item = await client.itemByPath(path, lang);
      if (!item) return DEFAULT_SETTINGS;
      return fromFields(item.fields);
    },

    async write(tenant, site, value) {
      const path = settingsConfigPath(tenant, site);
      const item = await client.itemByPath(path, lang);
      if (!item) throw new SettingsNotProvisionedError(path);
      await client.updateItem({
        itemId: item.itemId,
        language: lang,
        fields: toFields(value)
      });
    }
  };
}

function fromFields(
  f: Record<string, string>
): StoredSettings {
  const labels = (f[SETTINGS_FIELD.defaultLabels] ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const admins = (f[SETTINGS_FIELD.adminEmails] ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const boardRaw = f[SETTINGS_FIELD.boardId] ?? "";
  const board = boardRaw ? Number(boardRaw) : null;
  return {
    projectKey: f[SETTINGS_FIELD.projectKey]
      ?? DEFAULT_SETTINGS.projectKey,
    defaultIssueType: f[SETTINGS_FIELD.defaultIssueType]
      || DEFAULT_SETTINGS.defaultIssueType,
    defaultLabels: labels.length
      ? labels : DEFAULT_SETTINGS.defaultLabels,
    defaultBoardId:
      Number.isFinite(board) && (board as number) > 0
        ? (board as number) : null,
    jiraBaseUrl: f[SETTINGS_FIELD.jiraBaseUrl] ?? "",
    jiraServiceEmail: f[SETTINGS_FIELD.serviceEmail] ?? "",
    jiraApiTokenEnc: f[SETTINGS_FIELD.apiTokenEnc] || null,
    adminEmails: admins
  };
}

function toFields(v: StoredSettings): SitecoreField[] {
  return [
    { name: SETTINGS_FIELD.projectKey,
      value: v.projectKey },
    { name: SETTINGS_FIELD.defaultIssueType,
      value: v.defaultIssueType },
    { name: SETTINGS_FIELD.defaultLabels,
      value: v.defaultLabels.join(",") },
    { name: SETTINGS_FIELD.boardId,
      value: v.defaultBoardId == null
        ? "" : String(v.defaultBoardId) },
    { name: SETTINGS_FIELD.jiraBaseUrl,
      value: v.jiraBaseUrl },
    { name: SETTINGS_FIELD.serviceEmail,
      value: v.jiraServiceEmail },
    { name: SETTINGS_FIELD.apiTokenEnc,
      value: v.jiraApiTokenEnc ?? "" },
    { name: SETTINGS_FIELD.adminEmails,
      value: v.adminEmails.join(",") }
  ];
}
