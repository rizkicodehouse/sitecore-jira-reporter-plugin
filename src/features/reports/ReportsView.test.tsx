import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReportsView } from "./ReportsView";

describe("ReportsView", () => {
  beforeEach(() => {
    // Force standalone (non-embedded) code path: jsdom
    // already sets window.parent === window.
    window.history.replaceState(
      {}, "",
      "/full-screen?tenantId=acme"
    );
  });

  it("loads reports and renders rows from API",
     async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        items: [{
          jiraKey: "CLD-55",
          jiraUrl: "https://x.atlassian.net/browse/CLD-55",
          summary: "Header regression",
          issueType: "Bug",
          reporter: {
            email: "bob@co.com", name: "Bob"
          },
          page: {
            title: "About", url: "/about",
            language: "en", site: "default"
          },
          rendering: null,
          datasourceId: null,
          sprintAssigned: false,
          createdAt: "2026-04-16T00:00:00.000Z"
        }],
        total: 1, offset: 0, limit: 50
      }), { status: 200 })
    ));
    render(<ReportsView />);
    expect(
      await screen.findByRole(
        "link", { name: "CLD-55" }
      )
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = (fetch as unknown as { mock: {
      calls: [string, RequestInit][]
    } }).mock.calls[0]!;
    expect(call[0]).toContain("/api/reports?");
    expect(call[0]).toContain("offset=0");
    expect(call[0]).toContain("limit=50");
    const headers = call[1].headers as Record<string, string>;
    expect(headers["X-Tenant-Id"]).toBe("acme");
    expect(call[1].credentials).toBe("include");
  });

  it("surfaces the server userMessage on error",
     async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: {
          category: "permission",
          userMessage: "Sign-in required",
          logCode: "reports.auth.missing"
        }
      }), { status: 401 })
    ));
    render(<ReportsView />);
    await waitFor(() =>
      expect(
        screen.getByText("Sign-in required")
      ).toBeInTheDocument()
    );
  });

  it("falls back to tenantId=dev when missing from URL",
     async () => {
    window.history.replaceState({}, "", "/full-screen");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        items: [], total: 0, offset: 0, limit: 50
      }), { status: 200 })
    ));
    render(<ReportsView />);
    await waitFor(() =>
      expect(
        screen.getByText(/No bug reports yet/)
      ).toBeInTheDocument()
    );
    const headers =
      (fetch as unknown as { mock: {
        calls: [string, RequestInit][]
      } }).mock.calls[0]![1].headers as Record<string, string>;
    expect(headers["X-Tenant-Id"]).toBe("dev");
  });
});
