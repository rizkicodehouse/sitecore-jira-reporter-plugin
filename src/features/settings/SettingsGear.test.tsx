import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsGear } from "./SettingsGear";

describe("SettingsGear", () => {
  it("invokes onClick", async () => {
    const onClick = vi.fn();
    render(<SettingsGear onClick={onClick} />);
    await userEvent.click(
      screen.getByRole("button", { name: /settings/i })
    );
    expect(onClick).toHaveBeenCalled();
  });
});
