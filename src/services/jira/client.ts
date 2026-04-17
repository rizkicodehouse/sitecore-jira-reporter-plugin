import type { PluginError } from "@/lib/jira-errors";
import type { NormalizedField }
  from "@/lib/jira-create-meta";
import { buildAuthHeaders } from "@/lib/api-headers";
import type { XmcClient } from "@/services/sitecore/xmc";
import type { SiteScope } from "@/services/sitecore/site-scope";
import {
  createReportsSitecoreRepo
} from "@/lib/reports-sitecore-repo";

// Creds + project defaults that the server Jira routes
// need. The client reads them from the Sitecore settings
// item and passes them per-request; the server never reads
// Sitecore itself anymore (no bearer token from the iframe
// SDK).
export type JiraCredsForRequest = {
  baseUrl: string;
  serviceEmail: string;
  // Ciphertext produced by /api/crypto/encrypt. The server
  // decrypts in-process using the plugin's KEK.
  apiTokenEnc: string;
};

export type JiraSettingsForIssue = {
  projectKey: string;
  defaultIssueType: string;
  defaultLabels: string[];
  defaultBoardId: number | null;
};

const JIRA_CREDS_HEADER = "x-jira-creds";

function encodeCreds(
  creds: JiraCredsForRequest | null | undefined
): string | null {
  if (!creds?.baseUrl || !creds?.serviceEmail ||
      !creds?.apiTokenEnc) {
    return null;
  }
  // btoa is browser-safe for ASCII JSON; fields are URLs/
  // emails/base64 ciphertext so no unicode concerns.
  return btoa(JSON.stringify({
    baseUrl: creds.baseUrl,
    serviceEmail: creds.serviceEmail,
    apiTokenEnc: creds.apiTokenEnc
  }));
}

export type CreateIssuePayload = {
  summary: string;
  descriptionText: string;
  context: unknown;
  attachmentCount: number;
  customFields?: Record<string, unknown>;
  assignee?: { accountId: string } | null;
  priority?: { id: string } | null;
};

export type CreateIssueResult = { key: string; url: string };
export type AttachmentResult = { id: string };
export type CreateMetaResult = {
  fields: NormalizedField[];
};

export type JiraUserResult = {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl: string | null;
};

export type JiraPriority = {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  statusColor: string | null;
  isDefault: boolean;
};

export class JiraClient {
  constructor(
    private readonly opts: {
      tenantId?: string;
      userEmail?: string;
      userName?: string;
      xmcClient?: XmcClient | null;
      siteScope?: SiteScope | null;
      creds?: JiraCredsForRequest | null;
      settings?: JiraSettingsForIssue | null;
    } = {}
  ) {}

  private headers(
    extra: Record<string, string> = {}
  ): Record<string, string> {
    const base = buildAuthHeaders(this.opts, extra);
    const encoded = encodeCreds(this.opts.creds ?? null);
    if (encoded) {
      return { ...base, [JIRA_CREDS_HEADER]: encoded };
    }
    return base;
  }

  async createIssue(
    payload: CreateIssuePayload
  ): Promise<CreateIssueResult> {
    const body: CreateIssuePayload & {
      settings?: JiraSettingsForIssue;
    } = {
      summary: payload.summary,
      descriptionText: payload.descriptionText,
      context: payload.context,
      attachmentCount: payload.attachmentCount,
      ...(payload.customFields
        ? { customFields: payload.customFields } : {}),
      ...(payload.assignee !== undefined
        ? { assignee: payload.assignee } : {}),
      ...(payload.priority !== undefined
        ? { priority: payload.priority } : {}),
      ...(this.opts.settings
        ? { settings: this.opts.settings } : {})
    };
    const res = await fetch("/api/jira/issue", {
      method: "POST",
      credentials: "include",
      headers: this.headers({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw await this.asError(res);
    const created = (await res.json()) as CreateIssueResult
      & { issueType?: string };
    // Persist the Sitecore `BugReport` item from the
    // browser. The server used to do this when it had direct
    // XMC access, but the iframe SDK is now the only
    // authenticated Sitecore surface. Best-effort: Jira
    // issue is already real, so we don't fail the UI if the
    // mirror write fails — but DO log so the failure shows
    // up in browser devtools instead of disappearing.
    await this.writeReportItem(payload, created)
      .catch((e) => {
        console.warn(
          "[jira-reporter] BugReport item write failed " +
          `after creating ${created.key}. ` +
          "The Jira ticket is real; the fullscreen list " +
          "won't include this one until the mirror " +
          "succeeds on a later submission.",
          e
        );
      });
    return { key: created.key, url: created.url };
  }

  private async writeReportItem(
    payload: CreateIssuePayload,
    created: CreateIssueResult & { issueType?: string }
  ): Promise<void> {
    const client = this.opts.xmcClient ?? null;
    const scope = this.opts.siteScope ?? null;
    if (!client || !scope) return;
    const ctx = payload.context as {
      page?: {
        title?: string; url?: string;
        language?: string; site?: string;
      } | null;
      rendering?: {
        instanceId: string;
        renderingId?: string; name?: string;
        templateName?: string; placeholderKey?: string;
        dataSource?: string;
      } | null;
      reporter?: { name: string; email: string } | null;
    };
    const repo = createReportsSitecoreRepo({ client });
    await repo.append(scope.tenant, scope.site, {
      jiraKey: created.key,
      jiraUrl: created.url,
      summary: payload.summary,
      issueType: created.issueType ?? "Bug",
      reporter: ctx.reporter ?? null,
      page: ctx.page
        ? {
            title: ctx.page.title ?? "",
            url: ctx.page.url ?? "",
            language: ctx.page.language ?? "",
            site: ctx.page.site ?? ""
          }
        : null,
      rendering: ctx.rendering
        ? {
            instanceId: ctx.rendering.instanceId,
            renderingId: ctx.rendering.renderingId,
            name: ctx.rendering.name,
            templateName: ctx.rendering.templateName,
            placeholderKey: ctx.rendering.placeholderKey
          }
        : null,
      datasourceId: ctx.rendering?.dataSource ?? null,
      createdAt: new Date().toISOString()
    });
  }

  async getCreateMeta(
    projectKey: string, issueType: string
  ): Promise<CreateMetaResult> {
    const q = new URLSearchParams({
      project: projectKey,
      issueType: issueType
    });
    const res = await fetch(
      `/api/jira/create-meta?${q}`,
      { credentials: "include", headers: this.headers() }
    );
    if (!res.ok) throw await this.asError(res);
    return (await res.json()) as CreateMetaResult;
  }

  async getPriorities(): Promise<JiraPriority[]> {
    const res = await fetch(
      `/api/jira/priorities`,
      { credentials: "include", headers: this.headers() }
    );
    if (!res.ok) throw await this.asError(res);
    const body = (await res.json()) as {
      priorities: JiraPriority[];
    };
    return body.priorities ?? [];
  }

  async searchUsers(q: string): Promise<JiraUserResult[]> {
    if (q.trim().length < 2) return [];
    const qs = new URLSearchParams({ q: q.trim() });
    const res = await fetch(
      `/api/jira/user-search?${qs}`,
      { credentials: "include", headers: this.headers() }
    );
    if (!res.ok) throw await this.asError(res);
    const body = (await res.json()) as {
      users: JiraUserResult[];
    };
    return body.users ?? [];
  }

  async uploadAttachment(
    issueKey: string, blob: Blob
  ): Promise<AttachmentResult> {
    const form = new FormData();
    form.append(
      "file", blob,
      `screenshot-${Date.now()}.png`
    );
    const res = await fetch(
      `/api/jira/attachment?issueKey=${encodeURIComponent(issueKey)}`,
      {
        method: "POST",
        credentials: "include",
        headers: this.headers(),
        body: form
      }
    );
    if (!res.ok) throw await this.asError(res);
    return (await res.json()) as AttachmentResult;
  }

  private async asError(res: Response): Promise<PluginError> {
    try {
      const body = (await res.json()) as { error?: PluginError };
      if (body.error) return body.error;
    } catch {}
    return {
      category: "unknown",
      userMessage: `HTTP ${res.status}`,
      logCode: `client.${res.status}`
    };
  }
}
