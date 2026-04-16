import { useEffect, useState } from "react";
import {
  getPagesContext,
  parseRenderings
} from "@/services/sitecore/context";
import { buildAuthHeaders } from "@/lib/api-headers";
import type { ReportContext, RenderingMeta } from "./types";

export type UseAutoContextOpts = {
  sdkToken: string;
  tenantId?: string;
  userEmail?: string;
  userName?: string;
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
    const hasHostUser =
      Boolean(opts.userEmail) || Boolean(opts.userName);
    (async () => {
      const [pagesCtx, fetchedReporter] = await Promise.all([
        getPagesContext().catch(() => null),
        hasHostUser
          ? Promise.resolve(null)
          : fetchMe(opts)
      ]);
      if (cancelled) return;
      const reporter = hasHostUser
        ? {
            name: opts.userName ?? "",
            email: opts.userEmail ?? ""
          }
        : fetchedReporter;
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
        datasource: datasourceFromRendering(active),
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
    opts.activeRenderingInstanceId,
    opts.userEmail,
    opts.userName
  ]);

  return state;
}

export function datasourceFromRendering(
  r: Pick<RenderingMeta, "name" | "dataSource"> | null
): ReportContext["datasource"] {
  if (!r?.dataSource) return null;
  const fields: Record<string, string> = { path: r.dataSource };
  if (r.name) fields.name = r.name;
  return { itemId: "", templateName: "", fields };
}

function deriveName(dataSource?: string): string {
  if (!dataSource) return "";
  const last = dataSource.split("/").pop() ?? dataSource;
  return last.trim() || dataSource;
}

async function fetchMe(opts: UseAutoContextOpts) {
  const res = await fetch("/api/xmc/me", {
    headers: buildAuthHeaders(opts)
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    name: string; email: string;
  };
}
