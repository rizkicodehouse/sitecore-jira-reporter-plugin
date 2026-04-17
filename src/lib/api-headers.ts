// Header used by the browser to forward its loaded Jira
// settings alongside every Jira API request, so the server
// routes can call Atlassian without reading Sitecore itself.
export const JIRA_CREDS_HEADER = "x-jira-creds";

export type ClientIdentity = {
  tenantId?: string;
  userEmail?: string;
  userName?: string;
};

export function buildAuthHeaders(
  id: ClientIdentity,
  extra: Record<string, string> = {}
): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (id.tenantId) h["X-Tenant-Id"] = id.tenantId;
  if (id.userEmail) h["X-User-Email"] = id.userEmail;
  if (id.userName) h["X-User-Name"] = id.userName;
  return h;
}
