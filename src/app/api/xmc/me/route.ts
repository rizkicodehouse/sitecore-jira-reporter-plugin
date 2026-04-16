import { NextResponse } from "next/server";
import { verifySdkSession } from "@/lib/auth";

export async function GET(req: Request) {
  const s = await verifySdkSession(req);
  if (!s.ok) return fail(401, "auth.missing");
  return NextResponse.json({
    name: s.session.name,
    email: s.session.email
  });
}

function fail(status: number, code: string) {
  return NextResponse.json(
    { error: {
        category: status === 401 ? "permission" : "retryable",
        userMessage:
          status === 401 ? "Sign-in required" :
          "Could not identify user",
        logCode: code
    } },
    { status }
  );
}
