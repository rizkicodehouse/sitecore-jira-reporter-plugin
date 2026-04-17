import { getSettingsStore } from "./settings-store";
import { decryptSecret } from "./crypto";
import { JIRA_CREDS_HEADER } from "./api-headers";

export type JiraCreds = {
  baseUrl: string;
  serviceEmail: string;
  apiToken: string;
  source: "tenant" | "env" | "request" | "none";
};

type JiraCredsHeaderPayload = {
  baseUrl: string;
  serviceEmail: string;
  apiTokenEnc: string;
};

function readCredsHeader(
  req: Request
): JiraCredsHeaderPayload | null {
  const raw = req.headers.get(JIRA_CREDS_HEADER);
  if (!raw) return null;
  try {
    const decoded = Buffer
      .from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as
      Partial<JiraCredsHeaderPayload>;
    if (!parsed.baseUrl || !parsed.serviceEmail ||
        !parsed.apiTokenEnc) {
      return null;
    }
    return {
      baseUrl: parsed.baseUrl,
      serviceEmail: parsed.serviceEmail,
      apiTokenEnc: parsed.apiTokenEnc
    };
  } catch {
    return null;
  }
}

export async function resolveJiraCredsFromRequest(
  req: Request, tenantId: string | null
): Promise<JiraCreds> {
  // 1. Prefer the client-forwarded header — this is the
  // only path that works in the client-side XMC mode.
  const header = readCredsHeader(req);
  if (header && tenantId) {
    try {
      const apiToken = await decryptSecret(
        header.apiTokenEnc, tenantId
      );
      if (apiToken) {
        return {
          baseUrl: normalizeBaseUrl(header.baseUrl),
          serviceEmail: header.serviceEmail,
          apiToken,
          source: "request"
        };
      }
    } catch { /* fall through to legacy paths */ }
  }
  return resolveJiraCreds(tenantId);
}

export async function resolveJiraCreds(
  tenantId: string | null
): Promise<JiraCreds> {
  // Legacy path — kept for env-only deployments. The in-
  // memory tenant-settings singleton is empty in the
  // client-side XMC mode, so this mostly serves as the
  // JIRA_* env-variable fallback for standalone dev.
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
