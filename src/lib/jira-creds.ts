import { getSettingsStore } from "./settings-store";

export type JiraCreds = {
  baseUrl: string;
  serviceEmail: string;
  apiToken: string;
  source: "tenant" | "env" | "none";
};

export async function resolveJiraCreds(
  tenantId: string | null
): Promise<JiraCreds> {
  // If there's a tenant record, it is authoritative:
  // either fully configured (use it) or partially
  // configured (source = "none"; don't silently mix
  // with env). Env is only for the no-tenant case.
  if (tenantId) {
    const s = await getSettingsStore().get(tenantId);
    const tokenPlain = s.jiraApiTokenEnc
      ? await getSettingsStore()
          .getDecryptedApiToken(tenantId)
      : "";
    if (s.jiraBaseUrl && s.jiraServiceEmail && tokenPlain) {
      return {
        baseUrl: normalizeBaseUrl(s.jiraBaseUrl),
        serviceEmail: s.jiraServiceEmail,
        apiToken: tokenPlain,
        source: "tenant"
      };
    }
    return {
      baseUrl: "", serviceEmail: "", apiToken: "",
      source: "none"
    };
  }
  const envBase = process.env.JIRA_BASE_URL ?? "";
  const envEmail = process.env.JIRA_SERVICE_EMAIL ?? "";
  const envToken = process.env.JIRA_API_TOKEN ?? "";
  if (envBase && envEmail && envToken) {
    return {
      baseUrl: normalizeBaseUrl(envBase),
      serviceEmail: envEmail,
      apiToken: envToken,
      source: "env"
    };
  }
  return {
    baseUrl: "", serviceEmail: "", apiToken: "",
    source: "none"
  };
}

export function basicAuthHeader(
  email: string, apiToken: string
): string {
  return "Basic " + Buffer
    .from(`${email}:${apiToken}`).toString("base64");
}

function normalizeBaseUrl(u: string): string {
  return u.trim().replace(/\/+$/, "");
}
