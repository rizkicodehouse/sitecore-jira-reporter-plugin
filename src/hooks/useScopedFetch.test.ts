import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScopedFetch } from "./useScopedFetch";
import type { SdkContext } from "@/services/sitecore/sdk-context";

describe("useScopedFetch", () => {
  beforeEach(() => {
    // Stub global fetch so the hook has something to call
    // through. The real browser fetch would throw "Illegal
    // invocation" when called through a detached reference;
    // this test reproduces that exact call pattern.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("{}", { status: 200 }))
    );
  });

  it("returns a callable fetch when ctx is null (no illegal invocation)", async () => {
    const { result } = renderHook(() => useScopedFetch(null));
    // Invoke via a bare variable — the exact pattern that
    // trips the native-fetch binding check in the browser.
    const scopedFetch = result.current;
    await expect(scopedFetch("/api/x")).resolves
      .toBeInstanceOf(Response);
  });

  it("forwards x-sc-* headers when ctx is provided", async () => {
    const ctx: SdkContext = {
      tenant: "T", site: "S",
      contextId: "ctx", authToken: "tok"
    };
    const { result } = renderHook(() => useScopedFetch(ctx));
    await result.current("/api/x");
    const call = (fetch as unknown as { mock: {
      calls: Array<[string, RequestInit]>;
    } }).mock.calls[0]!;
    const headers = new Headers(call[1].headers);
    expect(headers.get("x-sc-tenant")).toBe("T");
    expect(headers.get("x-sc-site")).toBe("S");
    expect(headers.get("x-sc-context-id")).toBe("ctx");
    expect(headers.get("x-sc-auth-token")).toBe("tok");
  });
});
