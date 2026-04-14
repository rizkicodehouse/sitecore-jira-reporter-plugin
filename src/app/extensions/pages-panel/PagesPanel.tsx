"use client";
import { FC, useEffect, useState } from "react";
import {
  initSitecoreContext, getPagesContext,
  subscribeToLayoutChanges
} from "@/services/sitecore/context";
import { ReportBugButton } from
  "@/features/report-bug/ReportBugButton";
import { ReportBugDialog } from
  "@/features/report-bug/ReportBugDialog";
import { SettingsGear } from
  "@/features/settings/SettingsGear";
import { SettingsView, type Settings } from
  "@/features/settings/SettingsView";
import { useAutoContext } from
  "@/features/report-bug/useAutoContext";
import { JiraClient } from "@/services/jira/client";
import { captureVisibleTab } from
  "@/services/screenshot/capture";

export type PagesPanelProps = {
  sdkTokenForTests?: string;
};

export const PagesPanel: FC<PagesPanelProps> = (
  { sdkTokenForTests }
) => {
  const [sdkReady, setSdkReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [dsId, setDsId] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sdkToken, setSdkToken] = useState(
    sdkTokenForTests ?? ""
  );

  useEffect(() => {
    if (sdkTokenForTests) {
      const stub = {
        query: async () => ({
          data: await getPagesContext()
        }),
        subscribe: (_: string, cb: (e: unknown) => void) => {
          const off = subscribeToLayoutChanges(
            (e) => cb(e)
          );
          return off;
        }
      };
      initSitecoreContext(stub as never);
      setSdkReady(true);
      return;
    }
    (async () => {
      const mod = (await import(
        "@sitecore-marketplace-sdk/client"
      )) as unknown as {
        createClient: () => Promise<{
          getSessionToken: () => Promise<string>;
        }>;
      };
      const sdk = await mod.createClient();
      initSitecoreContext(sdk as unknown as never);
      setSdkToken(await sdk.getSessionToken());
      setSdkReady(true);
    })();
  }, [sdkTokenForTests]);

  useEffect(() => {
    if (!sdkReady) return;
    const off = subscribeToLayoutChanges(async (evt) => {
      const ctx = await getPagesContext();
      setHasSelection(Boolean(ctx.rendering));
      setDsId(evt.renderingInstanceId);
    });
    return () => off();
  }, [sdkReady]);

  const autoCtx = useAutoContext({
    sdkToken,
    datasourceItemId: dsId
  });
  const jira = new JiraClient({ sdkToken });

  async function loadSettings(): Promise<Settings> {
    const res = await fetch("/api/settings", {
      headers: { "X-Sdk-Token": sdkToken }
    });
    if (!res.ok) throw await toErr(res);
    return (await res.json()) as Settings;
  }

  async function saveSettings(next: Settings) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Sdk-Token": sdkToken
      },
      body: JSON.stringify(next)
    });
    if (!res.ok) throw await toErr(res);
    return (await res.json()) as Settings;
  }

  async function toErr(res: Response) {
    try {
      const body = await res.json();
      return body.error ?? {};
    } catch { return {}; }
  }

  if (!sdkReady) {
    return <div className="p-4">Initialising…</div>;
  }

  return (
    <div className="flex flex-col gap-2 p-3"
         aria-label="JIRA reporter panel">
      <div className="flex items-center justify-between">
        <ReportBugButton
          disabled={!hasSelection}
          onClick={() => setOpen(true)} />
        <SettingsGear
          onClick={() => setSettingsOpen((x) => !x)} />
      </div>
      {settingsOpen && (
        <SettingsView
          load={loadSettings}
          save={saveSettings} />
      )}
      {open && autoCtx.context && (
        <ReportBugDialog
          context={autoCtx.context}
          submit={(p) => jira.createIssue(p)}
          uploadAttachment={(k, b) =>
            jira.uploadAttachment(k, b)}
          onClose={() => setOpen(false)}
          captureScreen={async () => {
            const r = await captureVisibleTab();
            return r.ok ? r.blob : null;
          }} />
      )}
    </div>
  );
};
