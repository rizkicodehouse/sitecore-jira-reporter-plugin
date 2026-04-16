import { auth0 } from "./auth0";

export type SdkSession = {
  email: string;
  name: string;
  tenantId: string;
};

export type SessionResult =
  | { ok: true; session: SdkSession }
  | { ok: false; status: number; reason: string };

export async function verifySdkSession(
  req: Request
): Promise<SessionResult> {
  const session = await auth0.getSession();
  const user = session?.user;
  if (!user) {
    return { ok: false, status: 401, reason: "no-session" };
  }
  return {
    ok: true,
    session: {
      email: user.email ?? "",
      name: user.name ?? "",
      tenantId: getTenantId(req) ?? ""
    }
  };
}

export function isAdminEmail(
  email: string,
  adminEmails: string[] = []
): boolean {
  const envSuperAdmins =
    (process.env.PLUGIN_ADMIN_EMAILS ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean)
      .map((s) => s.toLowerCase());
  const tenantAdmins =
    adminEmails.map((s) => s.toLowerCase());
  const combined = [...envSuperAdmins, ...tenantAdmins];
  if (combined.length === 0) return false;
  return combined.includes(email.trim().toLowerCase());
}

export function getTenantId(req: Request): string | null {
  const header = req.headers.get("X-Tenant-Id");
  if (header && header.trim()) return header.trim();
  const url = new URL(req.url);
  const qp = url.searchParams.get("tenantId");
  if (qp && qp.trim()) return qp.trim();
  return null;
}
