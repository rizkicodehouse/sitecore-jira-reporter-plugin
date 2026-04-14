import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PagesPanel } from "./PagesPanel";

vi.mock("@/services/sitecore/context", () => ({
  initSitecoreContext: vi.fn(),
  getPagesContext: vi.fn().mockResolvedValue({
    page: { id: "P", path: "/en", title: "Home",
            language: "en" },
    site: { name: "main" },
    rendering: {
      instanceId: "abc", renderingId: "r",
      name: "Hero", templateName: "Banner"
    }
  }),
  subscribeToLayoutChanges: vi.fn((cb) => {
    cb({ type: "page-layout",
         renderingInstanceId: "abc" });
    return () => {};
  })
}));

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
        if (url.includes("/api/xmc/datasource")) {
          return Promise.resolve(new Response(
            JSON.stringify({ fields: { T: "v" } }),
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
    render(<PagesPanel sdkTokenForTests="stub-valid" />);
    await waitFor(() =>
      expect(screen.getByRole("button",
        { name: /report bug/i })).toBeEnabled()
    );
  });

  it("opens dialog on click and submits successfully",
     async () => {
    render(<PagesPanel sdkTokenForTests="stub-valid" />);
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
