import { useEffect, useState } from "react";
import {
  getPagesContext,
  parseRenderings
} from "@/services/sitecore/context";
import type { ReportContext } from "./types";

export type UseAutoContextOpts = {
  sdkToken: string;
  tenantId?: string;
  userEmail?: string;
  userName?: string;
  datasourceItemId?: string;
  activeRenderingInstanceId?: string;
};

export type UseAutoContextState = {
  loading: boolean;
  context: ReportContext | null;
  error: string | null;
};

export function useAutoContext(
  opts: UseAutoContextOpts
): UseAutoContextState {
  const [state, setState] = useState<UseAutoContextState>({
    loading: true, context: null, error: null
  });

  useEffect(() => {
    let cancelled = false;
    if (!opts.sdkToken) {
      setState({ loading: true, context: null, error: null });
      return () => { cancelled = true; };
    }
    (async () => {
      const [pagesCtx, reporter, datasource] =
        await Promise.all([
          getPagesContext().catch(() => null),
          fetchMe(opts),
          opts.datasourceItemId
            ? fetchDatasource(
                opts,
                opts.datasourceItemId,
                "en"
              )
            : Promise.resolve(null)
        ]);
      if (cancelled) return;
      const pageInfo = pagesCtx?.pageInfo;
      const siteInfo = pagesCtx?.siteInfo;
      const allRenderings = parseRenderings(
        pageInfo?.presentationDetails
      );
      const renderings = allRenderings.map((r) => ({
        instanceId: r.instanceId,
        renderingId: r.id,
        name: deriveName(r.dataSource),
        templateName: "",
        placeholderKey: r.placeholderKey,
        dataSource: r.dataSource
      }));
      const active = opts.activeRenderingInstanceId
        ? renderings.find(
            (r) =>
              r.instanceId ===
              opts.activeRenderingInstanceId
          ) ?? null
        : null;
      const ctx: ReportContext = {
        page: pageInfo
          ? {
              id: pageInfo.id ?? "",
              title:
                pageInfo.displayName ??
                pageInfo.name ?? "",
              url:
                pageInfo.url ??
                pageInfo.path ?? "",
              language: pageInfo.language ?? "",
              site:
                siteInfo?.displayName ??
                siteInfo?.name ?? ""
            }
          : null,
        rendering: active,
        renderings,
        datasource: datasource
          ? { itemId: opts.datasourceItemId!,
              templateName: "",
              fields: datasource }
          : null,
        reporter,
        browser: {
          userAgent:
            typeof navigator !== "undefined"
              ? navigator.userAgent : "",
          viewport:
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : "",
          timestamp: new Date().toISOString()
        }
      };
      setState({ loading: false, context: ctx, error: null });
    })();
    return () => { cancelled = true; };
  }, [
    opts.sdkToken,
    opts.datasourceItemId,
    opts.activeRenderingInstanceId
  ]);

  return state;
}

function deriveName(dataSource?: string): string {
  if (!dataSource) return "";
  const last = dataSource.split("/").pop() ?? dataSource;
  return last.trim() || dataSource;
}

function authHeaders(
  opts: UseAutoContextOpts
): Record<string, string> {
  const h: Record<string, string> = {
    "X-Sdk-Token": opts.sdkToken
  };
  if (opts.tenantId) h["X-Tenant-Id"] = opts.tenantId;
  if (opts.userEmail) h["X-User-Email"] = opts.userEmail;
  if (opts.userName) h["X-User-Name"] = opts.userName;
  return h;
}

async function fetchMe(opts: UseAutoContextOpts) {
  const res = await fetch("/api/xmc/me", {
    headers: authHeaders(opts)
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    name: string; email: string;
  };
}

async function fetchDatasource(
  opts: UseAutoContextOpts,
  itemId: string, language: string
) {
  const q = new URLSearchParams({ itemId, language });
  const res = await fetch(`/api/xmc/datasource?${q}`, {
    headers: authHeaders(opts)
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    fields: Record<string, string>;
  };
  return body.fields;
}
