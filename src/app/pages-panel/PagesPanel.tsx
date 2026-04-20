"use client";
import {
  FC, ReactNode, useCallback, useEffect, useMemo, useState
} from "react";
import {
  initSitecoreContext, getPagesContext,
  subscribeToLayoutChanges,
  subscribeToFieldUpdates,
  parseRenderings,
  getHostUser
} from "@/services/sitecore/context";
import { useXmcClient } from "@/hooks/useXmcClient";
import type {
  MarketplaceMutator
} from "@/services/sitecore/xmc-client-sdk";
import {
  parseSiteScopeFromPath, type SiteScope
} from "@/services/sitecore/site-scope";
import {
  readSitecoreContextId
} from "@/services/sitecore/context-id";
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
import {
  loadClientSettings, saveClientSettings,
  loadClientStoredSettings,
  type ClientSettingsContext
} from "@/features/settings/client-store";
import type {
  JiraCredsForRequest, JiraSettingsForIssue
} from "@/services/jira/client";

export type PagesPanelProps = {
  skipAuthForTests?: boolean;
};

const AUTH_POLL_INTERVAL_MS = 2000;
const SELECTION_POLL_INTERVAL_MS = 1500;

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
  const [marketplaceClient, setMarketplaceClient] =
    useState<MarketplaceMutator | null>(null);
  const [sitecoreContextId, setSitecoreContextId] =
    useState<string | undefined>();
  const [siteScope, setSiteScope] =
    useState<SiteScope | null>(null);
  const [provisioned, setProvisioned] =
    useState<boolean | null>(null);
  // Cached Jira creds + project settings so the Jira side-
  // routes (priorities, create-meta, user-search, issue)
  // can make authenticated calls without re-reading
  // Sitecore. Loaded lazily when the user opens settings or
  // the report dialog.
  const [jiraCreds, setJiraCreds] =
    useState<JiraCredsForRequest | null>(null);
  const [jiraSettings, setJiraSettings] =
    useState<JiraSettingsForIssue | null>(null);
  const xmcClient = useXmcClient(
    marketplaceClient, sitecoreContextId
  );

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
    const id = setInterval(tick, AUTH_POLL_INTERVAL_MS);
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
      const [clientMod, xmcMod] = await Promise.all([
        import("@sitecore-marketplace-sdk/client"),
        import("@sitecore-marketplace-sdk/xmc")
      ]);
      const real = await clientMod.ClientSDK.init({
        target: window.parent,
        modules: [xmcMod.XMC],
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
      setMarketplaceClient(
        real as unknown as MarketplaceMutator
      );
      try {
        const pagesCtx = await getPagesContext();
        const scope = parseSiteScopeFromPath(
          pagesCtx?.pageInfo?.path
        );
        setSiteScope(scope);
        const ctxId = await readSitecoreContextId(adapter);
        setSitecoreContextId(ctxId);
      } catch { /* scope stays null */ }
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
        const next = parseSiteScopeFromPath(
          ctx?.pageInfo?.path
        );
        // Only fire setState when the *content* actually
        // changed. parseSiteScopeFromPath returns a fresh
        // object each poll tick; without this guard the
        // reference churn invalidates downstream useMemos
        // (xmcClient) and useCallbacks (loadSettings), which
        // re-triggers SettingsView's load effect on every
        // 1.5s poll and wipes in-flight form edits.
        setSiteScope((prev) => {
          if (prev === next) return prev;
          if (prev && next &&
              prev.tenant === next.tenant &&
              prev.site === next.site) {
            return prev;
          }
          return next;
        });
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
    const poll = setInterval(
      () => refreshSelection(),
      SELECTION_POLL_INTERVAL_MS
    );
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
  const jira = useMemo(
    () => new JiraClient({
      tenantId, userEmail, userName,
      xmcClient, siteScope,
      creds: jiraCreds,
      settings: jiraSettings
    }),
    [
      tenantId, userEmail, userName,
      xmcClient, siteScope, jiraCreds, jiraSettings
    ]
  );

  const identity = useMemo(
    () => ({ tenantId, userEmail, userName }),
    [tenantId, userEmail, userName]
  );

  const resolveSettingsCtx = useCallback(
    (): ClientSettingsContext => {
      if (!xmcClient || !siteScope) {
        throw { category: "sdk-not-ready" };
      }
      return {
        xmcClient,
        tenant: siteScope.tenant,
        site: siteScope.site,
        tenantId,
        authHeaders: buildAuthHeaders(identity)
      };
    },
    [xmcClient, siteScope, tenantId, identity]
  );

  // useCallback-stable so SettingsView's load effect only
  // fires once per dep change (xmcClient/siteScope/tenantId)
  // instead of on every keystroke, which would otherwise
  // overwrite the user's in-flight edits with the stored
  // settings every render.
  const loadSettings = useCallback(
    async (): Promise<PublicSettings> => {
      const ctx = resolveSettingsCtx();
      try {
        const res = await loadClientSettings(ctx);
        setProvisioned(true);
        return res;
      } catch (e) {
        const tag = (e as { category?: string })?.category;
        if (tag === "not-provisioned") {
          setProvisioned(false);
        }
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xmcClient, siteScope, tenantId, userEmail, userName]
  );

  const saveSettings = useCallback(
    async (next: SettingsUpdate) => {
      const ctx = resolveSettingsCtx();
      const saved = await saveClientSettings(ctx, next);
      // Refresh the Jira creds cache after a successful
      // save so the next ticket submission uses the new
      // credentials without requiring a hard reload.
      void primeJiraCache();
      return saved;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xmcClient, siteScope, tenantId, userEmail, userName]
  );

  const primeJiraCache = useCallback(async () => {
    if (!xmcClient || !siteScope) return;
    try {
      const stored = await loadClientStoredSettings({
        xmcClient,
        tenant: siteScope.tenant,
        site: siteScope.site,
        tenantId,
        authHeaders: buildAuthHeaders(identity)
      });
      setProvisioned(true);
      setJiraCreds(
        stored.jiraBaseUrl && stored.jiraServiceEmail
          && stored.jiraApiTokenEnc
          ? {
              baseUrl: stored.jiraBaseUrl,
              serviceEmail: stored.jiraServiceEmail,
              apiTokenEnc: stored.jiraApiTokenEnc
            }
          : null
      );
      setJiraSettings({
        projectKey: stored.projectKey,
        defaultIssueType: stored.defaultIssueType,
        defaultLabels: stored.defaultLabels,
        defaultBoardId: stored.defaultBoardId
      });
    } catch (e) {
      const tag = (e as { category?: string })?.category;
      if (tag === "not-provisioned") setProvisioned(false);
      setJiraCreds(null);
      setJiraSettings(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xmcClient, siteScope, tenantId, userEmail, userName]);

  useEffect(() => { void primeJiraCache(); },
    [primeJiraCache]);

  // Setup is "complete" once the site has been provisioned
  // AND the admin has filled in Jira creds + project key.
  // While we don't yet know (null), treat as complete so the
  // panel doesn't flicker into a guided state during normal
  // use (and so tests without the XMC client still render the
  // Report Bug button).
  const setupComplete =
    provisioned !== false &&
    Boolean(jiraCreds) &&
    Boolean(jiraSettings?.projectKey);
  const needsSetup =
    xmcClient !== null && siteScope !== null &&
    !setupComplete;

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
            <span className="text-primary">Bug Reporter</span>
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
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(110,63,255,0.5)] transition hover:bg-primary-600 active:bg-primary-700"
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
          <div className="relative">
            {needsSetup && !settingsOpen && (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 animate-ping rounded-full ring-2 ring-primary/60"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary/40"
                />
              </>
            )}
            <SettingsGear
              onClick={() => setSettingsOpen((x) => !x)} />
          </div>
        </div>
        <h2 className="text-base font-semibold tracking-tight text-gray-900">
          Report a <span className="text-primary">Bug</span>
        </h2>
        {needsSetup && !settingsOpen && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-3"
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white"
            >
              1
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-primary-800">
                Finish setup before reporting a bug
              </p>
              <p className="text-xs leading-relaxed text-gray-700">
                {provisioned === false
                  ? "Install the plugin on this site, then "
                    + "configure your Jira connection."
                  : "Open settings to configure your Jira "
                    + "connection and target project. "
                    + "The Report Bug button appears once "
                    + "setup is complete."}
              </p>
            </div>
          </div>
        )}
        {!needsSetup && (
          <ReportBugButton
            disabled={!hasSelection}
            onClick={() => setOpen(true)} />
        )}
        {!hasSelection && setupComplete && (
          <div className="flex items-start gap-3 rounded-xl border border-primary-100/80 bg-primary-50/40 p-3">
            <div className="h-6 w-6 shrink-0 rounded-full bg-primary-200 shadow-inner" />
            <p className="text-xs leading-relaxed text-gray-600">
              Open a page in Sitecore Pages to report a bug
              on it.
            </p>
          </div>
        )}
        {settingsOpen && (
          <div className="rounded-xl border border-primary-100/80 bg-white/70 p-3 backdrop-blur">
            {provisioned === false
              ? (
                <InitialInstallationCard
                  xmcClient={xmcClient}
                  siteScope={siteScope}
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
      <div className="h-1 bg-primary" />
      {children}
    </section>
  </div>
);
