import { useMemo } from "react";
import {
  createScopedFetch
} from "@/app/api/_lib/scoped-fetch";
import type { SdkContext } from "@/services/sitecore/sdk-context";

export function useScopedFetch(
  ctx: SdkContext | null
): typeof fetch {
  return useMemo(() => {
    if (!ctx) {
      // Wrap the native fetch in an arrow so callers can
      // invoke it through a variable without the browser
      // throwing "Illegal invocation" (native fetch must
      // be bound to globalThis/window).
      return ((input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, init)) as typeof fetch;
    }
    return createScopedFetch(ctx);
  }, [ctx]);
}
