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
      const isEmbedded =
        typeof window !== "undefined" &&
        window.parent !== window;
      if (!isEmbedded) {
        const mockCtx = {
          page: {
            id: "dev-page-1",
            path: "/home",
            title: "Dev: Home",
            language: "en"
          },
          site: { name: "dev-site" },
          rendering: {
            instanceId: "dev-rendering-1",
            renderingId: "dev-r-1",
            name: "Hero Banner",
            templateName: "Hero"
          }
        };
        const devStub = {
          query: async () => ({ data: mockCtx }),
          subscribe: (
            _: string,
            handler: (e: unknown) => void
          ) => {
            setTimeout(
              () =>
                handler({
                  type: "page-layout",
                  renderingInstanceId: "dev-rendering-1"
                }),
              100
            );
            return () => {};
          }
        };
        initSitecoreContext(devStub);
        setSdkToken("stub-valid-dev");
        setSdkReady(true);
        return;
      }
      const mod = await import(
        "@sitecore-marketplace-sdk/client"
      );
      const real = await mod.ClientSDK.init({
        target: window.parent,
        ...(process.env
          .NEXT_PUBLIC_SITECORE_HOST_ORIGIN
          ? {
              origin:
                process.env.NEXT_PUBLIC_SITECORE_HOST_ORIGIN
            }
          : {})
      });
      const adapter = {
        query: async (name: string) => {
          const r = await real.query(
            name as "pages.context"
          );
          return { data: r.data };
        },
        subscribe: (
          _topic: string,
          handler: (e: unknown) => void
        ) =>
          real.subscribe(
            "pages.content.layoutUpdated",
            {
              onData: (d) => handler(d)
            }
          )
      };
      initSitecoreContext(adapter);
      if (!sdkTokenForTests) {
        setSdkToken("stub-valid-embedded-dev");
      }
      setSdkReady(true);
    })();
  }, [sdkTokenForTests]);

  useEffect(() => {
    if (!sdkReady) return;
    let off: (() => void) | null = null;
    const refreshSelection = async (
      evt?: { renderingInstanceId?: string }
    ) => {
      try {
        const ctx = await getPagesContext();
        setHasSelection(Boolean(ctx.rendering));
        setDsId(
          evt?.renderingInstanceId ??
            ctx.rendering?.instanceId
        );
      } catch {
        setHasSelection(false);
      }
    };
    refreshSelection();
    try {
      off = subscribeToLayoutChanges((evt) => {
        refreshSelection(evt);
      });
    } catch {
      /* subscription unsupported — initial read covers it */
    }
    return () => {
      if (off) off();
    };
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
      {!hasSelection && (
        <p className="text-sm text-gray-600 mt-2">
          Open a page in Sitecore Pages and select a
          rendering to report a bug on it. Use the gear
          icon to configure the target JIRA project.
        </p>
      )}
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
