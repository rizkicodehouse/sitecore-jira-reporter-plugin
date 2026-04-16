"use client";
import { FC, ReactNode, useEffect, useState } from "react";
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
  skipAuthForTests?: boolean;
};

export const PagesPanel: FC<PagesPanelProps> = (
  { skipAuthForTests }
) => {
  const [sdkReady, setSdkReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeInstanceId, setActiveInstanceId] =
    useState<string | undefined>();
  const [tenantId, setTenantId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    if (skipAuthForTests) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/xmc/me", {
          credentials: "include"
        });
        if (cancelled) return;
        if (res.status === 401) {
          const returnTo = encodeURIComponent(
            window.location.pathname + window.location.search
          );
          window.location.href =
            `/api/auth/login?returnTo=${returnTo}`;
        }
      } catch { /* let API errors surface through other paths */ }
    })();
    return () => { cancelled = true; };
  }, [skipAuthForTests]);

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
    if (skipAuthForTests) {
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
      setSdkReady(true);
    })();
  }, [skipAuthForTests]);

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
    tenantId,
    userEmail,
    userName,
    activeRenderingInstanceId: activeInstanceId
  });
  const jira = new JiraClient({
    tenantId, userEmail, userName
  });

  const identity = { tenantId, userEmail, userName };

  async function loadSettings(): Promise<PublicSettings> {
    const res = await fetch("/api/settings", {
      credentials: "include",
      headers: buildAuthHeaders(identity)
    });
    if (!res.ok) throw await toErr(res);
    return (await res.json()) as PublicSettings;
  }

  async function saveSettings(next: SettingsUpdate) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      credentials: "include",
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
      <PanelShell ariaLabel="JIRA reporter panel">
        <div className="flex items-center justify-center gap-2 p-6">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
          <span className="text-xs font-medium text-primary-700">
            Initialising…
          </span>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell ariaLabel="JIRA reporter panel">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.18em] text-primary-700 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            Bug reporter
          </span>
          <SettingsGear
            onClick={() => setSettingsOpen((x) => !x)} />
        </div>
        <h2 className="text-base font-semibold tracking-tight text-gray-900">
          Report a{" "}
          <span className="bg-gradient-to-r from-primary-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent">
            Bug
          </span>
        </h2>
        <ReportBugButton
          disabled={!hasSelection}
          onClick={() => setOpen(true)} />
        {!hasSelection && (
          <div className="flex items-start gap-3 rounded-xl border border-primary-100/80 bg-gradient-to-br from-primary-50/60 via-white to-cyan-50/60 p-3">
            <div className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-primary-300 via-pink-300 to-cyan-300 shadow-inner" />
            <p className="text-xs leading-relaxed text-gray-600">
              Open a page in Sitecore Pages to report a bug
              on it. Use the gear icon to configure the
              target JIRA project.
            </p>
          </div>
        )}
        {settingsOpen && (
          <div className="rounded-xl border border-primary-100/80 bg-white/70 p-3 backdrop-blur">
            <SettingsView
              load={loadSettings}
              save={saveSettings} />
          </div>
        )}
      </div>
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
    </PanelShell>
  );
};

const PanelShell: FC<{
  ariaLabel: string;
  children: ReactNode;
}> = ({ ariaLabel, children }) => (
  <div
    className="relative min-h-screen overflow-hidden p-3"
    aria-label={ariaLabel}
  >
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#f7f6ff] via-white to-[#fff4fe]" />
      <div className="absolute -top-16 -left-12 h-56 w-56 rounded-full bg-primary-200/40 blur-3xl" />
      <div className="absolute -bottom-20 -right-12 h-56 w-56 rounded-full bg-cyan-200/40 blur-3xl" />
      <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-pink-200/30 blur-3xl" />
    </div>
    <section className="overflow-hidden rounded-2xl border border-primary-100 bg-white/80 shadow-[0_20px_50px_-25px_rgba(110,63,255,0.35)] backdrop-blur-md">
      <div className="h-1 bg-gradient-to-r from-primary-500 via-pink-500 to-cyan-500" />
      {children}
    </section>
  </div>
);
