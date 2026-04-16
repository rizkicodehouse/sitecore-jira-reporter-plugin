"use client";
import { FC, useEffect, useState } from "react";
import {
  initSitecoreContext, getPagesContext,
  subscribeToLayoutChanges,
  subscribeToFieldUpdates,
  parseRenderings,
  getHostUser
} from "@/services/sitecore/context";
import { ReportBugButton } from
  "@/features/report-bug/ReportBugButton";
import { ReportBugDialog } from
  "@/features/report-bug/ReportBugDialog";
import { SettingsGear } from
  "@/features/settings/SettingsGear";
import {
  SettingsView,
  type PublicSettings,
  type SettingsUpdate
} from "@/features/settings/SettingsView";
import { useAutoContext } from
  "@/features/report-bug/useAutoContext";
import { JiraClient } from "@/services/jira/client";
import { buildAuthHeaders } from "@/lib/api-headers";
import {
  captureVisibleTab, canCaptureScreen
} from "@/services/screenshot/capture";

export type PagesPanelProps = {
  sdkTokenForTests?: string;
};

export const PagesPanel: FC<PagesPanelProps> = (
  { sdkTokenForTests }
) => {
  const [sdkReady, setSdkReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sdkToken, setSdkToken] = useState(
    sdkTokenForTests ?? ""
  );
  const [activeInstanceId, setActiveInstanceId] =
    useState<string | undefined>();
  const [tenantId, setTenantId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id =
      params.get("marketplaceAppTenantId") ??
      params.get("tenantId") ??
      "dev";
    setTenantId(id);
  }, []);

  useEffect(() => {
    if (!sdkReady) return;
    let cancelled = false;
    (async () => {
      const user = await getHostUser();
      if (cancelled) return;
      setUserEmail(user?.email ?? "");
      setUserName(
        user?.displayName ?? user?.name ?? ""
      );
    })();
    return () => { cancelled = true; };
  }, [sdkReady]);

  useEffect(() => {
    if (sdkTokenForTests) {
      // Test path: caller supplies sdkToken and is
      // expected to vi.mock @/services/sitecore/context
      // for query/subscribe behaviour. We just flip
      // sdkReady so the rest of the panel renders.
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
          topic: string,
          handler: (e: unknown) => void
        ) =>
          real.subscribe(
            topic as
              | "pages.content.layoutUpdated"
              | "pages.content.fieldsUpdated",
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
    const refreshSelection = async () => {
      try {
        const ctx = await getPagesContext();
        setHasSelection(Boolean(ctx?.pageInfo));
      } catch {
        setHasSelection(false);
      }
    };
    refreshSelection();
    try {
      off = subscribeToLayoutChanges(() => {
        refreshSelection();
      });
    } catch {
      /* subscription unsupported — poll instead */
    }
    const poll = setInterval(() => refreshSelection(), 1500);
    return () => {
      clearInterval(poll);
      if (off) off();
    };
  }, [sdkReady]);

  useEffect(() => {
    if (!sdkReady) return;
    let off: (() => void) | null = null;
    try {
      off = subscribeToFieldUpdates(async (evt) => {
        if (!evt.itemId) return;
        try {
          const ctx = await getPagesContext();
          const list = parseRenderings(
            ctx?.pageInfo?.presentationDetails
          );
          const match = list.find((r) =>
            r.dataSource?.toLowerCase().endsWith(
              evt.itemId!.toLowerCase()
            )
          );
          if (match) setActiveInstanceId(match.instanceId);
        } catch { /* ignore */ }
      });
    } catch { /* event unsupported */ }
    return () => { if (off) off(); };
  }, [sdkReady]);

  const autoCtx = useAutoContext({
    sdkToken,
    tenantId,
    userEmail,
    userName,
    activeRenderingInstanceId: activeInstanceId
  });
  const jira = new JiraClient({
    sdkToken, tenantId, userEmail, userName
  });

  const identity = {
    sdkToken, tenantId, userEmail, userName
  };

  async function loadSettings(): Promise<PublicSettings> {
    const res = await fetch("/api/settings", {
      headers: buildAuthHeaders(identity)
    });
    if (!res.ok) throw await toErr(res);
    return (await res.json()) as PublicSettings;
  }

  async function saveSettings(next: SettingsUpdate) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: buildAuthHeaders(identity, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(next)
    });
    if (!res.ok) throw await toErr(res);
    return (await res.json()) as PublicSettings;
  }

  async function toErr(res: Response) {
    try {
      const body = await res.json();
      return body.error ?? {};
    } catch { return {}; }
  }

  if (!sdkReady) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-sm text-muted-foreground">Initialising…</span>
      </div>
    );
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
        <p className="text-sm text-muted-foreground mt-2">
          Open a page in Sitecore Pages to report a bug on
          it. Use the gear icon to configure the target
          JIRA project.
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
          captureScreen={
            canCaptureScreen()
              ? async () => {
                  const r = await captureVisibleTab();
                  return r.ok ? r.blob : null;
                }
              : undefined
          }
          loadCreateMeta={() => {
            const sPromise = loadSettings();
            return sPromise.then((s) =>
              jira.getCreateMeta(
                s.projectKey, s.defaultIssueType
              )
            );
          }} />
      )}
    </div>
  );
};
