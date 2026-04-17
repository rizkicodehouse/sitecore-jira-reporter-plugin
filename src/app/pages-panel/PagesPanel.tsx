"use client";
import { FC, ReactNode, useEffect, useState } from "react";
import {
  initSitecoreContext, getPagesContext,
  subscribeToLayoutChanges,
  subscribeToFieldUpdates,
  parseRenderings,
  getHostUser
} from "@/services/sitecore/context";
import {
  readSdkContext, type SdkContext
} from "@/services/sitecore/sdk-context";
import { useScopedFetch } from "@/hooks/useScopedFetch";
import {
  InitialInstallationCard
} from "./InitialInstallationCard";
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

type SessionState = "unknown" | "authenticated" | "needs-login";

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
  const [sessionState, setSessionState] =
    useState<SessionState>(
      skipAuthForTests ? "authenticated" : "unknown"
    );
  const [authPolling, setAuthPolling] = useState(false);
  const [sdkContext, setSdkContext] =
    useState<SdkContext | null>(null);
  const [provisioned, setProvisioned] =
    useState<boolean | null>(null);
  const scopedFetch = useScopedFetch(sdkContext);

  useEffect(() => {
    if (skipAuthForTests) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/xmc/me", {
          credentials: "include"
        });
        if (cancelled) return;
        if (res.ok) {
          setSessionState("authenticated");
          return;
        }
        if (res.status === 401) {
          const isEmbedded =
            typeof window !== "undefined" &&
            window.parent !== window;
          if (isEmbedded) {
            // In a cross-site iframe we cannot navigate the
            // top frame (blocked) and a same-frame redirect
            // to Auth0 would fail on third-party cookies.
            // Defer to a user-click that opens the flow in
            // a new tab, then poll until the session lands.
            setSessionState("needs-login");
            return;
          }
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
    if (!authPolling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/xmc/me", {
          credentials: "include"
        });
        if (cancelled) return;
        if (res.ok) {
          setSessionState("authenticated");
          setAuthPolling(false);
        }
      } catch { /* keep polling */ }
    };
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authPolling]);

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
      // Production triage hook. Updated at every step so
      // "stage" tells us how far the SDK handshake got even
      // if a later step throws. `sitecore-context-missing`
      // means one of these came back empty.
      const debugBag: Record<string, unknown> = {
        stage: "sdk-initialised"
      };
      const publishDebug = () => {
        if (typeof window !== "undefined") {
          (window as unknown as {
            __scPluginDebug?: unknown;
          }).__scPluginDebug = debugBag;
        }
      };
      publishDebug();
      try {
        const pagesCtx = await getPagesContext();
        debugBag.pagesContext = pagesCtx;
        debugBag.stage = "pages-context-loaded";
        publishDebug();
        const siteName = pagesCtx?.siteInfo?.name ?? "";
        debugBag.siteName = siteName;
        try {
          const appRes = await adapter.query(
            "application.context"
          );
          debugBag.applicationContext = appRes?.data ?? null;
        } catch (e) {
          debugBag.applicationContext = {
            queryError: (e as Error).message
          };
        }
        debugBag.stage = "application-context-queried";
        publishDebug();
        const resolved = siteName
          ? await readSdkContext(adapter, siteName)
          : null;
        debugBag.resolvedSdkContext = resolved;
        debugBag.stage = "resolved";
        publishDebug();
        setSdkContext(resolved);
      } catch (e) {
        debugBag.error = (e as Error).message;
        debugBag.stage = "threw";
        publishDebug();
      }
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
    const res = await scopedFetch("/api/settings", {
      credentials: "include",
      headers: buildAuthHeaders(identity)
    });
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      if (body?.error === "not-provisioned") {
        setProvisioned(false);
        throw { category: "not-provisioned" };
      }
    }
    if (!res.ok) throw await toErr(res);
    setProvisioned(true);
    return (await res.json()) as PublicSettings;
  }

  async function saveSettings(next: SettingsUpdate) {
    const res = await scopedFetch("/api/settings", {
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

  if (sessionState === "needs-login") {
    return (
      <PanelShell ariaLabel="Bug Reporter for Jira sign in">
        <div className="flex flex-col gap-3 p-5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.18em] text-primary-700 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            Sign-in required
          </span>
          <h2 className="text-base font-semibold tracking-tight text-gray-900">
            Sign in to{" "}
            <span className="bg-gradient-to-r from-primary-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent">
              Bug Reporter
            </span>
          </h2>
          <p className="text-xs leading-relaxed text-gray-600">
            Opens your Sitecore login in a new tab. This
            panel refreshes automatically once your session
            is ready.
          </p>
          <a
            href="/api/auth/login?returnTo=/auth-complete"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAuthPolling(true)}
            className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-primary-500 via-pink-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(110,63,255,0.5)] transition hover:opacity-95"
          >
            Sign in with Sitecore
          </a>
          {authPolling && (
            <div
              role="status"
              className="flex items-center gap-2 text-2xs text-gray-500"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
              Waiting for sign-in…
            </div>
          )}
        </div>
      </PanelShell>
    );
  }

  if (!sdkReady || sessionState === "unknown") {
    return (
      <PanelShell ariaLabel="Bug Reporter for Jira panel">
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
    <PanelShell ariaLabel="Bug Reporter for Jira panel">
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
              target Jira project.
            </p>
          </div>
        )}
        {settingsOpen && (
          <div className="rounded-xl border border-primary-100/80 bg-white/70 p-3 backdrop-blur">
            {provisioned === false
              ? (
                <InitialInstallationCard
                  scopedFetch={scopedFetch}
                  onReady={() => setProvisioned(true)}
                />
              )
              : (
                <SettingsView
                  load={loadSettings}
                  save={saveSettings} />
              )}
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
          }}
          searchUsers={(q) => jira.searchUsers(q)}
          loadPriorities={() => jira.getPriorities()} />
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
