"use client";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { ReportsTable } from "./ReportsTable";
import type { LoadReports, ReportsPage } from "./types";
import { buildAuthHeaders } from "@/lib/api-headers";
import {
  initSitecoreContext, getHostUser
} from "@/services/sitecore/context";

type Identity = {
  tenantId: string;
  userEmail: string;
  userName: string;
};

async function fetchReports(
  identity: Identity,
  { offset, limit }: { offset: number; limit: number }
): Promise<ReportsPage> {
  const qs = new URLSearchParams({
    offset: String(offset),
    limit: String(limit)
  });
  const res = await fetch(`/api/reports?${qs}`, {
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
      return fetchReports(identity, args);
    },
    [identity]
  );

  const key = useMemo(
    () => identity ? identity.tenantId : "pending",
    [identity]
  );

  if (!identity) {
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
