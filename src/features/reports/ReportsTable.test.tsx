import {
  describe, it, expect, vi
} from "vitest";
import {
  render, screen, waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsTable } from "./ReportsTable";
import type { ReportRow, ReportsPage } from "./types";

const mkRow = (
  overrides: Partial<ReportRow> = {}
): ReportRow => ({
  jiraKey: "CLD-1",
  jiraUrl: "https://x.atlassian.net/browse/CLD-1",
  summary: "Hero banner broken",
  issueType: "Bug",
  reporter: { email: "alice@co.com", name: "Alice" },
  page: {
    title: "Home",
    url: "https://site.com/",
    language: "en",
    site: "default"
  },
  rendering: {
    instanceId: "r-1",
    renderingId: "rend-1",
    name: "HeroBanner",
    templateName: "Hero"
  },
  datasourceId: "/sitecore/content/ds",
  createdAt: "2026-04-16T10:30:00.000Z",
  ...overrides
});

const mkPage = (
  items: ReportRow[],
  extras: Partial<ReportsPage> = {}
): ReportsPage => ({
  items, total: items.length, offset: 0, limit: 50,
  ...extras
});

describe("ReportsTable", () => {
  it("shows a loading indicator before load resolves",
     async () => {
    let release: (p: ReportsPage) => void = () => {};
    const load = vi.fn(() =>
      new Promise<ReportsPage>((r) => { release = r; })
    );
    render(<ReportsTable load={load} />);
    expect(
      screen.getByLabelText("Loading reports")
    ).toBeInTheDocument();
    release(mkPage([]));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Loading reports")
      ).not.toBeInTheDocument()
    );
  });

  it("shows empty-state copy when no reports", async () => {
    const load = vi.fn().mockResolvedValue(mkPage([]));
    render(<ReportsTable load={load} />);
    await waitFor(() =>
      expect(
        screen.getByText(/No bug reports yet/)
      ).toBeInTheDocument()
    );
  });

  it("renders rows with key link, summary, reporter",
     async () => {
    const load = vi.fn().mockResolvedValue(mkPage([
      mkRow({ jiraKey: "CLD-7", summary: "Footer 500" })
    ]));
    render(<ReportsTable load={load} />);
    const link = await screen.findByRole(
      "link", { name: "CLD-7" }
    );
    expect(link).toHaveAttribute(
      "href",
      "https://x.atlassian.net/browse/CLD-1"
    );
    expect(
      screen.getByText("Footer 500")
    ).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(
      screen.getByText("HeroBanner")
    ).toBeInTheDocument();
  });

  it("shows em-dash when no rendering or reporter",
     async () => {
    const load = vi.fn().mockResolvedValue(mkPage([
      mkRow({ reporter: null, rendering: null })
    ]));
    render(<ReportsTable load={load} />);
    await waitFor(() =>
      expect(
        screen.getAllByText("—").length
      ).toBeGreaterThan(0)
    );
  });

  it("shows an error alert and retries on click",
     async () => {
    const load = vi.fn()
      .mockRejectedValueOnce({ userMessage: "Bad gateway" })
      .mockResolvedValueOnce(mkPage([
        mkRow({ jiraKey: "CLD-42" })
      ]));
    render(<ReportsTable load={load} />);
    const retry = await screen.findByRole(
      "button", { name: "Retry" }
    );
    expect(
      screen.getByText("Bad gateway")
    ).toBeInTheDocument();
    await userEvent.click(retry);
    expect(
      await screen.findByRole("link", { name: "CLD-42" })
    ).toBeInTheDocument();
  });

  it("disables Previous on first page", async () => {
    const load = vi.fn().mockResolvedValue(mkPage(
      [mkRow({})], { total: 120 }
    ));
    render(<ReportsTable load={load} pageSize={50} />);
    await screen.findByRole("link", { name: "CLD-1" });
    const prev = screen.getByRole(
      "button", { name: "Previous" }
    );
    expect(prev).toBeDisabled();
    const next = screen.getByRole(
      "button", { name: "Next" }
    );
    expect(next).not.toBeDisabled();
  });

  it("requests next page when Next is clicked",
     async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(mkPage(
        [mkRow({ jiraKey: "CLD-A" })],
        { offset: 0, total: 120, limit: 50 }
      ))
      .mockResolvedValueOnce(mkPage(
        [mkRow({ jiraKey: "CLD-B" })],
        { offset: 50, total: 120, limit: 50 }
      ));
    render(<ReportsTable load={load} pageSize={50} />);
    await screen.findByRole("link", { name: "CLD-A" });
    await userEvent.click(
      screen.getByRole("button", { name: "Next" })
    );
    await screen.findByRole("link", { name: "CLD-B" });
    expect(load).toHaveBeenCalledWith(
      { offset: 50, limit: 50 }
    );
  });

  it("disables Next on last page", async () => {
    const load = vi.fn().mockResolvedValue(mkPage(
      [mkRow({})], { total: 1 }
    ));
    render(<ReportsTable load={load} />);
    await screen.findByRole("link", { name: "CLD-1" });
    expect(
      screen.getByRole("button", { name: "Next" })
    ).toBeDisabled();
  });
});
