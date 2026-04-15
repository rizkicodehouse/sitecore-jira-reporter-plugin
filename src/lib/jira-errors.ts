export type PluginErrorCategory =
  "retryable" | "permission" | "config" | "unknown";

export type PluginError = {
  category: PluginErrorCategory;
  userMessage: string;
  logCode: string;
  retryAfterSeconds?: number;
};

export type UpstreamInput = {
  status: number;
  upstreamBody: unknown;
  retryAfterSeconds?: number;
};

export function mapJiraError(u: UpstreamInput): PluginError {
  const { status, retryAfterSeconds } = u;
  if (status === 401) return {
    category: "config", logCode: "jira.401.invalid-token",
    userMessage:
      "Plugin not configured correctly — contact your " +
      "Sitecore admin."
  };
  if (status === 403) return {
    category: "config", logCode: "jira.403.no-permission",
    userMessage:
      "Plugin not configured correctly — contact your " +
      "Sitecore admin."
  };
  if (status === 404) return {
    category: "config", logCode: "jira.404.project-not-found",
    userMessage:
      "Configured JIRA project not found — check plugin " +
      "settings."
  };
  if (status === 400) {
    const detail = extractJiraValidationDetail(u.upstreamBody);
    return {
      category: "config", logCode: "jira.400.validation",
      userMessage: detail
        ? `JIRA rejected the request: ${detail}`
        : "JIRA rejected the request. Check Settings — " +
          "project key, issue type, labels, assignee."
    };
  }
  if (status === 413) return {
    category: "retryable",
    logCode: "jira.413.payload-too-large",
    userMessage: "Screenshot too large — try a smaller image."
  };
  if (status === 429) return {
    category: "retryable", logCode: "jira.429.rate-limited",
    userMessage:
      `JIRA is busy — try again in ${retryAfterSeconds ?? 10}s.`,
    retryAfterSeconds
  };
  if (status >= 500 && status < 600) return {
    category: "retryable", logCode: `jira.${status}.server`,
    userMessage: "JIRA is temporarily unavailable."
  };
  return {
    category: "unknown", logCode: `jira.${status}.unknown`,
    userMessage: "JIRA returned an unexpected error."
  };
}

function extractJiraValidationDetail(
  body: unknown
): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    errorMessages?: string[];
    errors?: Record<string, string>;
  };
  const messages: string[] = [];
  if (Array.isArray(b.errorMessages)) {
    messages.push(...b.errorMessages);
  }
  if (b.errors && typeof b.errors === "object") {
    for (const [field, msg] of Object.entries(b.errors)) {
      messages.push(`${field}: ${msg}`);
    }
  }
  if (messages.length === 0) return null;
  // Cap length so the banner stays readable.
  const joined = messages.join("; ");
  return joined.length > 300
    ? joined.slice(0, 297) + "…"
    : joined;
}
