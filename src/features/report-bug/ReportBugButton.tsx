"use client";
import { FC } from "react";

export type ReportBugButtonProps = {
  disabled: boolean;
  onClick: () => void;
};

export const ReportBugButton: FC<ReportBugButtonProps> = (
  { disabled, onClick }
) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-label="Report bug to JIRA"
    title={disabled
      ? "Select a component to report"
      : "Report a bug for the selected component"}
    className="flex items-center gap-2 px-3 py-2 rounded-md
               border border-gray-300 text-sm font-medium
               disabled:opacity-50 disabled:cursor-not-allowed
               hover:bg-gray-50"
  >
    <span aria-hidden="true">🐞</span>
    Report bug
  </button>
);
