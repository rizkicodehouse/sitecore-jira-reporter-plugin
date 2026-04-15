import { useEffect, useState } from "react";
import { getPagesContext } from "@/services/sitecore/context";
import type { ReportContext } from "./types";

export type UseAutoContextOpts = {
  sdkToken: string;
  datasourceItemId?: string;
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
    (async () => {
      const [pagesCtx, reporter, datasource] =
        await Promise.all([
          getPagesContext().catch(() => null),
          fetchMe(opts.sdkToken),
          opts.datasourceItemId
            ? fetchDatasource(
                opts.sdkToken,
                opts.datasourceItemId,
                "en"
              )
            : Promise.resolve(null)
        ]);
      if (cancelled) return;
      const ctx: ReportContext = {
        page: pagesCtx?.page
          ? {
              id: pagesCtx.page.id ?? "",
              title: pagesCtx.page.title ?? "",
              url: pagesCtx.page.path ?? "",
              language: pagesCtx.page.language ?? "",
              site: pagesCtx.site?.name ?? ""
            }
          : null,
        rendering: pagesCtx?.rendering ?? null,
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
  }, [opts.sdkToken, opts.datasourceItemId]);

  return state;
}

async function fetchMe(sdkToken: string) {
  const res = await fetch("/api/xmc/me", {
    headers: { "X-Sdk-Token": sdkToken }
  });
  if (!res.ok) return null;
  return (await res.json()) as { name: string; email: string };
}

async function fetchDatasource(
  sdkToken: string, itemId: string, language: string
) {
  const q = new URLSearchParams({ itemId, language });
  const res = await fetch(`/api/xmc/datasource?${q}`, {
    headers: { "X-Sdk-Token": sdkToken }
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    fields: Record<string, string>;
  };
  return body.fields;
}
