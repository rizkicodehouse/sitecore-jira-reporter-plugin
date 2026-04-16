import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PagesPanel } from "./PagesPanel";

vi.mock("@/services/sitecore/context", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/sitecore/context")
  >("@/services/sitecore/context");
  return {
    ...actual,
    initSitecoreContext: vi.fn(),
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
    }),
    subscribeToLayoutChanges: vi.fn((cb) => {
      cb({ type: "page-layout",
           renderingInstanceId: "abc" });
      return () => {};
    })
  };
});

describe("PagesPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(
      (url: string) => {
        if (url.includes("/api/xmc/me")) {
          return Promise.resolve(new Response(
            JSON.stringify({ name: "A", email: "a@x" }),
            { status: 200 }
          ));
        }
        if (url.includes("/api/jira/issue")) {
          return Promise.resolve(new Response(
            JSON.stringify({
              key: "CLD-9", url: "http://j/CLD-9"
            }),
            { status: 201 }
          ));
        }
        return Promise.reject(new Error("unexpected"));
      }
    ));
  });

  it("enables the report button once rendering selected",
     async () => {
    render(<PagesPanel skipAuthForTests />);
    await waitFor(() =>
      expect(screen.getByRole("button",
        { name: /report bug/i })).toBeEnabled()
    );
  });

  it("opens dialog on click and submits successfully",
     async () => {
    render(<PagesPanel skipAuthForTests />);
    await waitFor(() =>
      expect(screen.getByRole("button",
        { name: /report bug/i })).toBeEnabled()
    );
    await userEvent.click(
      screen.getByRole("button", { name: /report bug/i })
    );
    await userEvent.type(
      screen.getByLabelText(/summary/i), "broken"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /submit/i })
    );
    expect(await screen.findByText(/CLD-9/))
      .toBeInTheDocument();
  });
});
