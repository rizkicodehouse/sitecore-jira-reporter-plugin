// src/features/report-bug/useAutoContext.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAutoContext } from "./useAutoContext";

vi.mock("@/services/sitecore/context", () => ({
  getPagesContext: vi.fn().mockResolvedValue({
    page: { id: "P", path: "/en",
            title: "Home", language: "en" },
    site: { name: "main" },
    rendering: {
      instanceId: "abc", renderingId: "r",
      name: "Hero", templateName: "Banner"
    }
  })
}));

describe("useAutoContext", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(
      (url: string) => {
        if (url.includes("/api/xmc/me")) {
          return Promise.resolve(new Response(
            JSON.stringify({ name: "Ada", email: "a@x.com" }),
            { status: 200 }
          ));
        }
        if (url.includes("/api/xmc/datasource")) {
          return Promise.resolve(new Response(
            JSON.stringify({ fields: { Title: "T" } }),
            { status: 200 }
          ));
        }
        return Promise.reject(new Error("unexpected"));
      }
    ));
  });

  it("populates all context fields on mount", async () => {
    const { result } = renderHook(() =>
      useAutoContext({ sdkToken: "stub-valid",
                       datasourceItemId: "uid" })
    );
    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );
    expect(result.current.context?.reporter?.email)
      .toBe("a@x.com");
    expect(result.current.context?.rendering?.name)
      .toBe("Hero");
    expect(result.current.context?.datasource?.fields.Title)
      .toBe("T");
  });
});
