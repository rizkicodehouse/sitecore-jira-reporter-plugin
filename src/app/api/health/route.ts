import { NextResponse } from "next/server";
import { getSettingsStore } from "@/lib/settings-store";

export async function GET() {
  let settingsLoaded = false;
  try {
    await getSettingsStore().get();
    settingsLoaded = true;
  } catch {}
  return NextResponse.json({
    ok: true,
    jiraConfigured: Boolean(
      process.env.JIRA_BASE_URL && process.env.JIRA_API_TOKEN
    ),
    settingsLoaded,
    at: new Date().toISOString()
  });
}
