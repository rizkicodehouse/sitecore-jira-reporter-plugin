import { basicAuthHeader } from "./jira-creds";

export type ResolvedUser = {
  accountId: string;
  displayName: string;
  emailAddress?: string;
};

export class JiraUserLookupError extends Error {
  constructor(
    public readonly reason:
      | "not-found"
      | "auth"
      | "network"
      | "ambiguous"
      | "bad-creds",
    message: string
  ) {
    super(message);
  }
}

const ACCOUNT_ID_RE = /^[0-9a-f]{24}$/i;

export function looksLikeAccountId(s: string): boolean {
  return ACCOUNT_ID_RE.test(s.trim());
}

export function looksLikeEmail(s: string): boolean {
  return /@/.test(s) && s.includes(".");
}

export async function resolveJiraUserByEmail(
  baseUrl: string,
  serviceEmail: string,
  apiToken: string,
  query: string
): Promise<ResolvedUser> {
  if (!baseUrl || !serviceEmail || !apiToken) {
    throw new JiraUserLookupError(
      "bad-creds",
      "JIRA credentials missing — save the connection " +
      "fields before using email for the assignee."
    );
  }
  const url =
    `${baseUrl}/rest/api/3/user/search?` +
    `query=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: basicAuthHeader(
          serviceEmail, apiToken
        )
      }
    });
  } catch {
    throw new JiraUserLookupError(
      "network",
      "Could not reach JIRA to look up the assignee."
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new JiraUserLookupError(
      "auth",
      "JIRA rejected the service credentials while " +
      "looking up the assignee."
    );
  }
  if (!res.ok) {
    throw new JiraUserLookupError(
      "network",
      `JIRA returned HTTP ${res.status} while looking ` +
      "up the assignee."
    );
  }
  let users: Array<{
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
    active?: boolean;
  }>;
  try {
    users = await res.json();
  } catch {
    throw new JiraUserLookupError(
      "network",
      "Could not parse JIRA user-search response."
    );
  }
  const active = users.filter(
    (u) => u.active !== false && u.accountId
  );
  if (active.length === 0) {
    throw new JiraUserLookupError(
      "not-found",
      `No JIRA user matches "${query}".`
    );
  }
  const exact = active.find(
    (u) =>
      u.emailAddress?.toLowerCase() === query.toLowerCase()
  );
  const pick = exact ?? active[0]!;
  if (!exact && active.length > 1) {
    throw new JiraUserLookupError(
      "ambiguous",
      `"${query}" matches ${active.length} JIRA users. ` +
      "Use the exact email or the 24-character accountId."
    );
  }
  return {
    accountId: pick.accountId!,
    displayName: pick.displayName ?? "",
    emailAddress: pick.emailAddress
  };
}
