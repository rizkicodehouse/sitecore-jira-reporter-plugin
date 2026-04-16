"use client";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { ReportsTable } from "./ReportsTable";
import type { LoadReports, ReportsPage } from "./types";
import { buildAuthHeaders } from "@/lib/api-headers";
import {
  initSitecoreContext, getHostUser
} from "@/services/sitecore/context";
import {
  readSdkContext, type SdkContext
} from "@/services/sitecore/sdk-context";
import { useScopedFetch } from "@/hooks/useScopedFetch";
import { isSitecoreDatastore } from "@/lib/datastore-mode";

type Identity = {
  tenantId: string;
  userEmail: string;
  userName: string;
};

type SessionState = "unknown" | "authenticated" | "needs-login";

async function fetchReports(
  identity: Identity,
  { offset, limit }: { offset: number; limit: number },
  scopedFetch: typeof fetch
): Promise<ReportsPage> {
  const qs = new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  });
  const res = await scopedFetch(`/api/reports?${qs}`, {
    credentials: "include",
    headers: buildAuthHeaders(identity)
  });
  if (!res.ok) {
    let userMessage = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.userMessage) {
        userMessage = body.error.userMessage;
      }
    } catch { /* ignore */ }
    throw { userMessage };
  }
  return (await res.json()) as ReportsPage;
}

export const ReportsView: FC = () => {
  const [identity, setIdentity] = useState<Identity | null>(
    null
  );
  const [sessionState, setSessionState] =
    useState<SessionState>("unknown");
  const [authPolling, setAuthPolling] = useState(false);
  const [sdkContext, setSdkContext] =
    useState<SdkContext | null>(null);
  const scopedFetch = useScopedFetch(sdkContext);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isEmbedded = window.parent !== window;
    if (!isEmbedded) {
      // Standalone runs through ReportsTable's inline
      // error alert on 401 — iframe cookie rules don't
      // apply, so skip the pre-check entirely.
      setSessionState("authenticated");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/xmc/me", {
          credentials: "include"
        });
        if (cancelled) return;
        setSessionState(
          res.ok ? "authenticated" : "needs-login"
        );
      } catch {
        if (cancelled) return;
        setSessionState("needs-login");
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    const params = new URLSearchParams(
      window.location.search
    );
    const tenantId =
      params.get("marketplaceAppTenantId") ??
      params.get("tenantId") ??
      "dev";

    const isEmbedded = window.parent !== window;
    if (!isEmbedded) {
      // Dev / standalone: no Sitecore host to query.
      setIdentity({
        tenantId,
        userEmail: "",
        userName: ""
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const mod = await import(
          "@sitecore-marketplace-sdk/client"
        );
        const real = await mod.ClientSDK.init({
          target: window.parent,
          ...(process.env
            .NEXT_PUBLIC_SITECORE_HOST_ORIGIN
            ? {
                origin:
                  process.env
                    .NEXT_PUBLIC_SITECORE_HOST_ORIGIN
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
          subscribe: () => () => {}
        };
        initSitecoreContext(adapter);
        // Grab the Sitecore SDK context so /api/reports
        // requests forward the editor's session when the
        // Sitecore datastore flag is enabled.
        if (isSitecoreDatastore()) {
          try {
            const pc = await adapter.query("pages.context");
            const siteName =
              (pc.data as { siteInfo?: { name?: string } })
                ?.siteInfo?.name ?? "";
            if (siteName) {
              const resolved = await readSdkContext(
                adapter, siteName
              );
              if (!cancelled) setSdkContext(resolved);
            }
          } catch { /* non-fatal */ }
        }
        const user = await getHostUser();
        if (cancelled) return;
        setIdentity({
          tenantId,
          userEmail: user?.email ?? "",
          userName:
            user?.displayName ?? user?.name ?? ""
        });
      } catch {
        if (cancelled) return;
        setIdentity({
          tenantId,
          userEmail: "",
          userName: ""
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback<LoadReports>(
    (args) => {
      if (!identity) {
        return Promise.reject({
          userMessage: "Not ready"
        });
      }
      return fetchReports(identity, args, scopedFetch);
    },
    [identity, scopedFetch]
  );

  const key = useMemo(
    () => identity ? identity.tenantId : "pending",
    [identity]
  );

  if (sessionState === "needs-login") {
    return (
      <div
        className="flex flex-col items-start gap-3 p-6"
        aria-label="Sign-in required"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.18em] text-primary-700 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
          Sign-in required
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">
          Sign in to view{" "}
          <span className="bg-gradient-to-r from-primary-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent">
            reported bugs
          </span>
        </h2>
        <p className="max-w-lg text-sm text-gray-600">
          Opens your Sitecore login in a new tab. This
          view refreshes automatically once your session
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
    );
  }

  if (!identity || sessionState === "unknown") {
    return (
      <div className="flex items-center justify-center p-8"
           aria-label="Initialising reports view">
        <span className="text-sm text-muted-foreground">
          Initialising…
        </span>
      </div>
    );
  }

  return <ReportsTable key={key} load={load} />;
};
