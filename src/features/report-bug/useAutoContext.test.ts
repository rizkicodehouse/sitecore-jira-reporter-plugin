// src/features/report-bug/useAutoContext.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAutoContext } from "./useAutoContext";

vi.mock("@/services/sitecore/context", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/sitecore/context")
  >("@/services/sitecore/context");
  return {
    ...actual,
    getPagesContext: vi.fn().mockResolvedValue({
      pageInfo: {
        id: "P", name: "home", displayName: "Home",
        path: "/en", url: "/en", language: "en",
        presentationDetails: JSON.stringify({
          devices: [{
            renderings: [{
              id: "r", instanceId: "abc",
              placeholderKey: "main",
              dataSource: "Hero"
            }]
          }]
        })
      },
      siteInfo: { id: "S", name: "main" }
    })
  };
});

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
      useAutoContext({
        sdkToken: "stub-valid",
        datasourceItemId: "uid",
        activeRenderingInstanceId: "abc"
      })
    );
    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );
    expect(result.current.context?.reporter?.email)
      .toBe("a@x.com");
    expect(result.current.context?.rendering?.renderingId)
      .toBe("r");
    expect(result.current.context?.renderings.length)
      .toBe(1);
    expect(result.current.context?.datasource?.fields.Title)
      .toBe("T");
  });
});
