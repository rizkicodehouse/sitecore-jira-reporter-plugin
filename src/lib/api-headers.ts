// Build the auth-related request headers we send to our
// own /api routes. Used by the JIRA client, the
// useAutoContext hook, and PagesPanel's settings calls
// so they all stay in sync.

export type ClientIdentity = {
  sdkToken: string;
  tenantId?: string;
  userEmail?: string;
  userName?: string;
};

export function buildAuthHeaders(
  id: ClientIdentity,
  extra: Record<string, string> = {}
): Record<string, string> {
  const h: Record<string, string> = {
    "X-Sdk-Token": id.sdkToken,
    ...extra
  };
  if (id.tenantId) h["X-Tenant-Id"] = id.tenantId;
  if (id.userEmail) h["X-User-Email"] = id.userEmail;
  if (id.userName) h["X-User-Name"] = id.userName;
  return h;
}
