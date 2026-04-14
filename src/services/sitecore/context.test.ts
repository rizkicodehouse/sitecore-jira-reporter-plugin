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
          page: { id: "P", path: "/en", title: "Home",
                  language: "en" },
          site: { name: "main" }
        }
      }),
      subscribe: vi.fn().mockReturnValue(() => {})
    };
    initSitecoreContext(sdk as never);
  });

  it("getPagesContext returns cached page + site", async () => {
    const ctx = await getPagesContext();
    expect(ctx.page.id).toBe("P");
    expect(ctx.site.name).toBe("main");
  });

  it("subscribeToLayoutChanges forwards events", () => {
    const cb = vi.fn();
    const off = subscribeToLayoutChanges(cb);
    expect(sdk.subscribe).toHaveBeenCalled();
    expect(typeof off).toBe("function");
  });
});
