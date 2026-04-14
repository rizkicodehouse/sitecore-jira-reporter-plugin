import type { PluginError } from "@/lib/jira-errors";

export type CreateIssuePayload = {
  summary: string;
  descriptionText: string;
  context: unknown;
  attachmentCount: number;
};

export type CreateIssueResult = { key: string; url: string };
export type AttachmentResult = { id: string };

export class JiraClient {
  constructor(private readonly opts: { sdkToken: string }) {}

  async createIssue(
    payload: CreateIssuePayload
  ): Promise<CreateIssueResult> {
    const res = await fetch("/api/jira/issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sdk-Token": this.opts.sdkToken
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw await this.asError(res);
    return (await res.json()) as CreateIssueResult;
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
        headers: { "X-Sdk-Token": this.opts.sdkToken },
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
