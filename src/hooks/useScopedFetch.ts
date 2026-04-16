import { useMemo } from "react";
import {
  createScopedFetch
} from "@/app/api/_lib/scoped-fetch";
import type { SdkContext } from "@/services/sitecore/sdk-context";

export function useScopedFetch(
  ctx: SdkContext | null
): typeof fetch {
  return useMemo(() => {
    if (!ctx) return fetch;
    return createScopedFetch(ctx);
  }, [ctx]);
}
