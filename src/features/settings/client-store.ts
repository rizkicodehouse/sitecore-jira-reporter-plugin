// Browser-side settings load/save. Uses the shared
// SettingsSitecoreRepo (XmcClient-backed) for item I/O and
// calls /api/crypto/encrypt when a new Jira API token is
// provided. The server never touches Sitecore anymore; it
// only turns plaintext into ciphertext.

import type { XmcClient } from "@/services/sitecore/xmc";
import {
  createSettingsSitecoreRepo,
  SettingsNotProvisionedError
} from "@/lib/settings-sitecore-repo";
import {
  DEFAULT_SETTINGS,
  type PublicSettings,
  type SettingsUpdate,
  type StoredSettings
} from "@/lib/settings-store";

export type ClientSettingsContext = {
  xmcClient: XmcClient;
  tenant: string;
  site: string;
  tenantId: string;
  authHeaders: HeadersInit;
};

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

export async function loadClientSettings(
  ctx: ClientSettingsContext
): Promise<PublicSettings> {
  const repo = createSettingsSitecoreRepo({
    client: ctx.xmcClient
  });
  const provisioned = await repo.exists(ctx.tenant, ctx.site);
  if (!provisioned) {
    throw { category: "not-provisioned" };
  }
  const stored = await repo.read(ctx.tenant, ctx.site);
  return toPublic(stored);
}

export async function saveClientSettings(
  ctx: ClientSettingsContext, update: SettingsUpdate
): Promise<PublicSettings> {
  const repo = createSettingsSitecoreRepo({
    client: ctx.xmcClient
  });
  const existing = await repo.read(ctx.tenant, ctx.site)
    .catch(() => DEFAULT_SETTINGS);
  let nextTokenEnc = existing.jiraApiTokenEnc;
  if (update.jiraApiToken && update.jiraApiToken.length > 0) {
    nextTokenEnc = await encryptViaServer(
      ctx, update.jiraApiToken
    );
  }
  const stored: StoredSettings = {
    projectKey: update.projectKey,
    defaultIssueType: update.defaultIssueType,
    defaultLabels: update.defaultLabels,
    defaultBoardId: update.defaultBoardId,
    jiraBaseUrl: update.jiraBaseUrl,
    jiraServiceEmail: update.jiraServiceEmail,
    adminEmails: update.adminEmails,
    jiraApiTokenEnc: nextTokenEnc
  };
  try {
    await repo.write(ctx.tenant, ctx.site, stored);
  } catch (e) {
    if (e instanceof SettingsNotProvisionedError) {
      throw { category: "not-provisioned" };
    }
    throw e;
  }
  return toPublic(stored);
}

async function encryptViaServer(
  ctx: ClientSettingsContext, plaintext: string
): Promise<string> {
  const res = await fetch("/api/crypto/encrypt", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...ctx.authHeaders
    },
    body: JSON.stringify({ plaintext })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string"
        ? `encrypt failed: ${body.error}`
        : `encrypt failed: HTTP ${res.status}`
    );
  }
  const json = await res.json() as { ciphertext?: string };
  if (!json.ciphertext) {
    throw new Error("encrypt failed: missing ciphertext");
  }
  return json.ciphertext;
}
