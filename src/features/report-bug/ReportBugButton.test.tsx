import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportBugButton } from "./ReportBugButton";

describe("ReportBugButton", () => {
  it("is disabled when no rendering selected", () => {
    render(<ReportBugButton
      disabled={true} onClick={() => {}} />);
    expect(screen.getByRole("button", {
      name: /report bug/i
    })).toBeDisabled();
  });

  it("invokes onClick when enabled", async () => {
    const onClick = vi.fn();
    render(<ReportBugButton
      disabled={false} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });
});
