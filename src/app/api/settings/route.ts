import { NextResponse } from "next/server";
import {
  verifySdkSession, isAdminEmail, getTenantId
} from "@/lib/auth";
import {
  buildRequestSettingsStore,
  getSettingsStore,
  SettingsStore,
  SettingsUpdateSchema
} from "@/lib/settings-store";
import {
  getXmcClient, isLocalXmcMode
} from "@/services/sitecore/xmc-client-factory";
import {
  createSettingsSitecoreRepo
} from "@/lib/settings-sitecore-repo";
import {
  resolveJiraUserByEmail,
  looksLikeAccountId,
  looksLikeEmail,
  JiraUserLookupError
} from "@/lib/jira-user-search";

type SitecoreRequestContext = {
  tenant: string;
  site: string;
  contextId: string;
  token: string;
  baseUrl: string;
};

function readSitecoreContext(
  req: Request
): SitecoreRequestContext | null {
  const tenant = req.headers.get("x-sc-tenant") ?? "";
  const site = req.headers.get("x-sc-site") ?? "";
  const contextId =
    req.headers.get("x-sc-context-id") ?? "";
  const token = req.headers.get("x-sc-auth-token") ?? "";
  const baseUrl =
    process.env.SITECORE_AUTHORING_BASE_URL ?? "";
  if (isLocalXmcMode()) {
    return {
      tenant: tenant || "Demo",
      site: site || "dev-site",
      contextId, token, baseUrl
    };
  }
  if (!tenant || !site || !contextId || !token || !baseUrl) {
    return null;
  }
  return { tenant, site, contextId, token, baseUrl };
}

function resolveSettingsStore(req: Request): SettingsStore {
  if (process.env.NODE_ENV === "test") {
    return getSettingsStore();
  }
  const ctx = readSitecoreContext(req);
  if (!ctx) throw new Error("sitecore-context-missing");
  return buildRequestSettingsStore({
    tenant: ctx.tenant,
    site: ctx.site,
    getRepo: async () => createSettingsSitecoreRepo({
      client: getXmcClient({
        baseUrl: ctx.baseUrl,
        token: ctx.token,
        sitecoreContextId: ctx.contextId
      })
    })
  });
}

async function checkProvisioned(
  req: Request
): Promise<boolean> {
  // Tests bypass the Sitecore path entirely.
  if (process.env.NODE_ENV === "test") return true;
  const ctx = readSitecoreContext(req);
  if (!ctx) return false;
  const repo = createSettingsSitecoreRepo({
    client: getXmcClient({
      baseUrl: ctx.baseUrl,
      token: ctx.token,
      sitecoreContextId: ctx.contextId
    })
  });
  return repo.exists(ctx.tenant, ctx.site);
}

function resolveTenantId(req: Request): string | null {
  const scTenant = req.headers.get("x-sc-tenant");
  if (scTenant) return scTenant;
  return getTenantId(req);
}

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return json401();
  const tenantId = resolveTenantId(req);
  if (!tenantId) return json400("tenant-missing");
  const provisioned = await checkProvisioned(req);
  if (!provisioned) {
    return NextResponse.json(
      { error: "not-provisioned" },
      { status: 404 }
    );
  }
  const settings = await resolveSettingsStore(req)
    .getPublic(tenantId);
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return json401();
  const tenantId = resolveTenantId(req);
  if (!tenantId) return json400("tenant-missing");
  const store = resolveSettingsStore(req);
  const current = await store.get(tenantId);
  const isBootstrap = current.adminEmails.length === 0;
  if (!isBootstrap &&
      !isAdminEmail(s.session.email, current.adminEmails)) {
    return NextResponse.json(
      { error: {
          category: "permission",
          userMessage: "Admin access required",
          logCode: "settings.put.not-admin"
      } },
      { status: 403 }
    );
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return json400("invalid-json"); }
  const parsed = SettingsUpdateSchema.safeParse(body);
  if (!parsed.success) return json400("invalid-shape");
  const update = { ...parsed.data };
  const rawAssignee =
    update.defaultAssigneeAccountId?.trim() ?? "";
  if (rawAssignee && !looksLikeAccountId(rawAssignee)) {
    if (!looksLikeEmail(rawAssignee)) {
      return json400("assignee-bad-format");
    }
    const effectiveBase = update.jiraBaseUrl
      || current.jiraBaseUrl;
    const effectiveEmail = update.jiraServiceEmail
      || current.jiraServiceEmail;
    const effectiveToken =
      update.jiraApiToken
      || (current.jiraApiTokenEnc
            ? await store.getDecryptedApiToken(tenantId)
            : "");
    try {
      const user = await resolveJiraUserByEmail(
        effectiveBase,
        effectiveEmail,
        effectiveToken,
        rawAssignee
      );
      update.defaultAssigneeAccountId = user.accountId;
    } catch (e) {
      if (e instanceof JiraUserLookupError) {
        return NextResponse.json(
          { error: {
              category:
                e.reason === "auth" ? "permission"
                  : e.reason === "not-found" ||
                    e.reason === "bad-creds" ||
                    e.reason === "ambiguous"
                    ? "config"
                    : "retryable",
              userMessage: e.message,
              logCode: `settings.put.assignee.${e.reason}`
          } },
          { status: e.reason === "auth" ? 401 : 400 }
        );
      }
      throw e;
    }
  } else if (rawAssignee === "") {
    update.defaultAssigneeAccountId = null;
  }
  try {
    const saved = await store.put(tenantId, update);
    return NextResponse.json(saved);
  } catch (e) {
    return NextResponse.json(
      { error: {
          category: "unknown",
          userMessage:
            (e as Error).message ?? "Save failed",
          logCode: "settings.put.store-error"
      } },
      { status: 500 }
    );
  }
}

function json401() {
  return NextResponse.json(
    { error: {
        category: "permission",
        userMessage: "Sign-in required",
        logCode: "settings.auth.missing"
    } },
    { status: 401 }
  );
}

function json400(code: string) {
  return NextResponse.json(
    { error: {
        category: "unknown",
        userMessage: "Invalid settings payload",
        logCode: `settings.put.${code}`
    } },
    { status: 400 }
  );
}
