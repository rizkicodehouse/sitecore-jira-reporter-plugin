import { NextResponse } from "next/server";
import { verifySdkSession, getTenantId } from "@/lib/auth";
import { getReportsStore } from "@/lib/reports-store";

const MAX_LIMIT = 100;

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) {
    return NextResponse.json(
      { error: {
          category: "permission",
          userMessage: "Sign-in required",
          logCode: "reports.auth.missing"
      } },
      { status: 401 }
    );
  }
  const tenantId = getTenantId(req);
  if (!tenantId) {
    return NextResponse.json(
      { error: {
          category: "config",
          userMessage: "Tenant context is missing",
          logCode: "reports.tenant.missing"
      } },
      { status: 400 }
    );
  }
  const url = new URL(req.url);
  const offset = clampInt(url.searchParams.get("offset"),
    0, 0, Number.MAX_SAFE_INTEGER);
  const limit = clampInt(url.searchParams.get("limit"),
    50, 1, MAX_LIMIT);
  try {
    const page = await getReportsStore()
      .list(tenantId, { offset, limit });
    return NextResponse.json(page);
  } catch (e) {
    return NextResponse.json(
      { error: {
          category: "unknown",
          userMessage:
            (e as Error).message ?? "List failed",
          logCode: "reports.list.store-error"
      } },
      { status: 500 }
    );
  }
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
