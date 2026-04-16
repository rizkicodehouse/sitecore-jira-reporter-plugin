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
};

export type CreateIssueResult = { key: string; url: string };
export type AttachmentResult = { id: string };
export type CreateMetaResult = {
  fields: NormalizedField[];
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
    const res = await fetch("/api/jira/issue", {
      method: "POST",
      credentials: "include",
      headers: this.headers({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
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
