// src/services/sitecore/context.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import {
  initSitecoreContext, getPagesContext,
  subscribeToLayoutChanges
} from "./context";

type SdkStub = {
  query: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

describe("sitecore context", () => {
  let sdk: SdkStub;
  beforeEach(() => {
    sdk = {
      query: vi.fn().mockResolvedValue({
        data: {
          pageInfo: {
            id: "P", name: "home", displayName: "Home",
            path: "/en", url: "/en", language: "en"
          },
          siteInfo: { id: "S", name: "main" }
        }
      }),
      subscribe: vi.fn().mockReturnValue(() => {})
    };
    initSitecoreContext(sdk as never);
  });

  it("getPagesContext returns page + site", async () => {
    const ctx = await getPagesContext();
    expect(ctx.pageInfo?.id).toBe("P");
    expect(ctx.siteInfo?.name).toBe("main");
  });

  it("subscribeToLayoutChanges forwards events", () => {
    const cb = vi.fn();
    const off = subscribeToLayoutChanges(cb);
    expect(sdk.subscribe).toHaveBeenCalled();
    expect(typeof off).toBe("function");
  });
});
