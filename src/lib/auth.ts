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
  const token = req.headers.get("X-Sdk-Token");
  if (!token) {
    return {
      ok: false, status: 401, reason: "missing-token"
    };
  }
  // Stub tokens are normally only accepted in non-prod.
  // ALLOW_STUB_TOKEN=1 is an INTERIM escape hatch for
  // smoke-testing deployed previews before real Auth0
  // verification lands. Never enable on Production.
  // See docs/TODO-auth0-integration.md.
  const stubAllowed =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_STUB_TOKEN === "1";
  if (stubAllowed && token.startsWith("stub-valid")) {
    const claimedEmail = req.headers.get("X-User-Email");
    const claimedName = req.headers.get("X-User-Name");
    return {
      ok: true,
      session: {
        email:
          claimedEmail?.trim() ||
          process.env.DEV_STUB_EMAIL ||
          "dev@local",
        name:
          claimedName?.trim() || "Dev User",
        tenantId:
          getTenantId(req) ?? "dev-tenant"
      }
    };
  }
  const validator = globalThis.__SDK_VALIDATOR__;
  if (!validator) {
    return {
      ok: false, status: 401, reason: "no-validator"
    };
  }
  try {
    const session = await validator(token);
    return { ok: true, session };
  } catch {
    return {
      ok: false, status: 401, reason: "invalid-token"
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __SDK_VALIDATOR__:
    ((t: string) => Promise<SdkSession>) | undefined;
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

// True for the dev-mode session token issued by
// PagesPanel when there is no real Sitecore SDK to verify
// (window.parent === window) or when running embedded
// without proper JWT verification wired up. Routes use
// this to short-circuit XMC calls (which would 502 with
// a fake token) and fall back to empty data.
export function isDevStubToken(token: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return token.startsWith("stub-valid-");
}
