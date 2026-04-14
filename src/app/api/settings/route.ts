import { NextResponse } from "next/server";
import { verifySdkSession, isAdminEmail } from "@/lib/auth";
import {
  getSettingsStore, SettingsSchema
} from "@/lib/settings-store";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return json401();
  const settings = await getSettingsStore().get();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return json401();
  if (!isAdminEmail(s.session.email)) {
    return NextResponse.json(
      { error: {
          category: "permission",
          userMessage: "Admin access required",
          logCode: "settings.put.not-admin"
      } },
      { status: 403 }
    );
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return json400("invalid-json"); }
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) return json400("invalid-shape");
  await getSettingsStore().put(parsed.data);
  return NextResponse.json(parsed.data);
}

function json401() {
  return NextResponse.json(
    { error: {
        category: "permission",
        userMessage: "Sign-in required",
        logCode: "settings.auth.missing"
    } },
    { status: 401 }
  );
}

function json400(code: string) {
  return NextResponse.json(
    { error: {
        category: "unknown",
        userMessage: "Invalid settings payload",
        logCode: `settings.put.${code}`
    } },
    { status: 400 }
  );
}
