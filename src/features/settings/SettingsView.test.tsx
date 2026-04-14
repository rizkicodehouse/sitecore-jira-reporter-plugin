// src/features/settings/SettingsView.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "./SettingsView";

describe("SettingsView", () => {
  it("loads current settings on mount", async () => {
    const load = vi.fn().mockResolvedValue({
      projectKey: "CLD",
      defaultIssueType: "Bug",
      defaultLabels: ["page-builder"],
      defaultAssigneeAccountId: null
    });
    render(<SettingsView load={load} save={vi.fn()} />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/project key/i) as HTMLInputElement)
          .value
      ).toBe("CLD")
    );
  });

  it("saves updated settings", async () => {
    const save = vi.fn().mockResolvedValue({
      projectKey: "OPS",
      defaultIssueType: "Bug",
      defaultLabels: [],
      defaultAssigneeAccountId: null
    });
    render(<SettingsView
      load={vi.fn().mockResolvedValue({
        projectKey: "CLD",
        defaultIssueType: "Bug",
        defaultLabels: [],
        defaultAssigneeAccountId: null
      })}
      save={save}
    />);
    const input = await screen.findByLabelText(/project key/i);
    await userEvent.clear(input);
    await userEvent.type(input, "OPS");
    await userEvent.click(
      screen.getByRole("button", { name: /save/i })
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ projectKey: "OPS" })
    );
    expect(await screen.findByText(/saved/i))
      .toBeInTheDocument();
  });

  it("shows error banner on 403", async () => {
    const save = vi.fn().mockRejectedValue({
      userMessage: "Admin access required"
    });
    render(<SettingsView
      load={vi.fn().mockResolvedValue({
        projectKey: "CLD",
        defaultIssueType: "Bug",
        defaultLabels: [],
        defaultAssigneeAccountId: null
      })}
      save={save}
    />);
    await screen.findByLabelText(/project key/i);
    await userEvent.click(
      screen.getByRole("button", { name: /save/i })
    );
    expect(await screen.findByText(/admin access required/i))
      .toBeInTheDocument();
  });
});
