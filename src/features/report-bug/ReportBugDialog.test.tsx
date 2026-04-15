// src/features/report-bug/ReportBugDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportBugDialog } from "./ReportBugDialog";
import type { ReportContext } from "./types";

const ctx: ReportContext = {
  page: { id: "P", title: "Home", url: "/",
          language: "en", site: "main" },
  rendering: {
    instanceId: "a", renderingId: "r",
    name: "Hero", templateName: "Banner"
  },
  renderings: [{
    instanceId: "a", renderingId: "r",
    name: "Hero", templateName: "Banner"
  }],
  datasource: {
    itemId: "a", templateName: "Banner",
    fields: { Title: "Welcome" }
  },
  reporter: { name: "Ada", email: "a@x.com" },
  browser: { userAgent: "UA", viewport: "1x1",
             timestamp: "2026-04-14T00:00:00Z" }
};

describe("ReportBugDialog", () => {
  it("disables Submit until summary is typed", async () => {
    render(<ReportBugDialog
      context={ctx}
      submit={vi.fn()}
      uploadAttachment={vi.fn()}
      onClose={vi.fn()}
    />);
    const submit = screen.getByRole("button",
      { name: /submit/i });
    expect(submit).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/summary/i), "Broken"
    );
    expect(submit).toBeEnabled();
  });

  it("calls submit with summary + description", async () => {
    const submit = vi.fn().mockResolvedValue({
      key: "CLD-1", url: "http://j/CLD-1"
    });
    render(<ReportBugDialog
      context={ctx}
      submit={submit}
      uploadAttachment={vi.fn()}
      onClose={vi.fn()}
    />);
    await userEvent.type(
      screen.getByLabelText(/summary/i), "Broken"
    );
    await userEvent.type(
      screen.getByLabelText(/description/i), "details"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /submit/i })
    );
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Broken",
        descriptionText: "details"
      })
    );
    expect(await screen.findByText(/CLD-1/)).toBeInTheDocument();
  });

  it("shows banner + Retry on submit error", async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce({
        category: "retryable",
        userMessage: "JIRA is busy"
      })
      .mockResolvedValueOnce({
        key: "CLD-2", url: "http://j/CLD-2"
      });
    render(<ReportBugDialog
      context={ctx} submit={submit}
      uploadAttachment={vi.fn()} onClose={vi.fn()}
    />);
    await userEvent.type(
      screen.getByLabelText(/summary/i), "x"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /submit/i })
    );
    expect(await screen.findByText(/JIRA is busy/))
      .toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /retry/i })
    );
    expect(await screen.findByText(/CLD-2/))
      .toBeInTheDocument();
  });
});
