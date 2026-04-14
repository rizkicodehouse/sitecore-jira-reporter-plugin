"use client";
import { FC } from "react";

export const SettingsGear: FC<{ onClick: () => void }> = (
  { onClick }
) => (
  <button type="button" onClick={onClick}
    aria-label="Open settings"
    className="p-2 rounded hover:bg-gray-100"
    title="Settings">
    ⚙
  </button>
);
