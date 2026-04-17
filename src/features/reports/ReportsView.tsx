"use client";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { ReportsTable } from "./ReportsTable";
import type { LoadReports } from "./types";
import {
  initSitecoreContext, getHostUser
} from "@/services/sitecore/context";
import { useXmcClient } from "@/hooks/useXmcClient";
import type {
  MarketplaceMutator
} from "@/services/sitecore/xmc-client-sdk";
import {
  readSitecoreContextId
} from "@/services/sitecore/context-id";
import { loadReportsFromXmc } from "./client-loader";

type Identity = {
  tenantId: string;
  userEmail: string;
  userName: string;
};

const AUTH_POLL_INTERVAL_MS = 2000;

type SessionState = "unknown" | "authenticated" | "needs-login";

export const ReportsView: FC = () => {
  const [identity, setIdentity] = useState<Identity | null>(
    null
  );
  const [sessionState, setSessionState] =
    useState<SessionState>("unknown");
  const [authPolling, setAuthPolling] = useState(false);
  const [marketplaceClient, setMarketplaceClient] =
    useState<MarketplaceMutator | null>(null);
  const [sitecoreContextId, setSitecoreContextId] =
    useState<string | undefined>();
  const xmcClient = useXmcClient(
    marketplaceClient, sitecoreContextId
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isEmbedded = window.parent !== window;
    if (!isEmbedded) {
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
    const id = setInterval(tick, AUTH_POLL_INTERVAL_MS);
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
        if (!cancelled) {
          setMarketplaceClient(
            real as unknown as MarketplaceMutator
          );
        }
        const ctxId = await readSitecoreContextId(adapter);
        if (!cancelled) setSitecoreContextId(ctxId);
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
      if (!xmcClient) {
        return Promise.reject({
          userMessage:
            "Sitecore session isn't ready yet. " +
            "Open this from XMC Pages."
        });
      }
      return loadReportsFromXmc(xmcClient, args)
        .catch((e: unknown) => {
          throw {
            userMessage:
              (e as Error)?.message ??
              "Failed to load reports"
          };
        });
    },
    [identity, xmcClient]
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
