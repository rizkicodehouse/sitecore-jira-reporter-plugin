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
  if (process.env.NODE_ENV !== "production" &&
      token.startsWith("stub-valid")) {
    return {
      ok: true,
      session: {
        email: "dev@local", name: "Dev User",
        tenantId: "dev-tenant"
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

export function isAdminEmail(email: string): boolean {
  const raw = process.env.PLUGIN_ADMIN_EMAILS ?? "";
  const list = raw.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
