import { NextResponse } from "next/server";
import { verifySdkSession, getTenantId } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

// Client-side settings flows need ciphertext for the Jira
// API token without shipping the KEK to the browser. This
// route accepts plaintext + tenantId and returns the
// packed ciphertext. The Auth0 session guard ensures only
// signed-in editors can call it.
export async function POST(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) {
    return NextResponse.json(
      { error: "unauthenticated" }, { status: 401 }
    );
  }
  const tenantId = getTenantId(req);
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenant-missing" }, { status: 400 }
    );
  }
  let body: { plaintext?: unknown };
  try { body = await req.json(); }
  catch {
    return NextResponse.json(
      { error: "invalid-json" }, { status: 400 }
    );
  }
  if (typeof body.plaintext !== "string" ||
      body.plaintext.length === 0) {
    return NextResponse.json(
      { error: "plaintext-required" }, { status: 400 }
    );
  }
  const ciphertext = await encryptSecret(
    body.plaintext, tenantId
  );
  return NextResponse.json({ ciphertext });
}
