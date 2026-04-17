import type { PluginError } from "@/lib/jira-errors";
import type { NormalizedField }
  from "@/lib/jira-create-meta";
import { buildAuthHeaders } from "@/lib/api-headers";

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
    } = {}
  ) {}

  private headers(
    extra: Record<string, string> = {}
  ): Record<string, string> {
    return buildAuthHeaders(this.opts, extra);
  }

  async createIssue(
    payload: CreateIssuePayload
  ): Promise<CreateIssueResult> {
    const body: CreateIssuePayload = {
      summary: payload.summary,
      descriptionText: payload.descriptionText,
      context: payload.context,
      attachmentCount: payload.attachmentCount,
      ...(payload.customFields
        ? { customFields: payload.customFields } : {}),
      ...(payload.assignee !== undefined
        ? { assignee: payload.assignee } : {}),
      ...(payload.priority !== undefined
        ? { priority: payload.priority } : {})
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
    return (await res.json()) as CreateIssueResult;
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
