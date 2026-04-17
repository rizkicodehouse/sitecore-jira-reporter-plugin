"use client";
import { FC } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icon";
import { mdiLadybug } from "@mdi/js";

export type ReportBugButtonProps = {
  disabled: boolean;
  onClick: () => void;
};

export const REPORT_BUG_BUTTON_CLASS =
  "bg-gradient-to-r from-primary-500 via-pink-500 to-cyan-500 " +
  "text-white shadow-[0_10px_30px_-12px_rgba(110,63,255,0.5)] " +
  "hover:opacity-95 focus-visible:ring-primary/50";

export const ReportBugButton: FC<ReportBugButtonProps> = (
  { disabled, onClick }
) => (
  <Button
    disabled={disabled}
    onClick={onClick}
    aria-label="Report bug to Jira"
    title={disabled
      ? "Select a component to report"
      : "Report a bug for the selected component"}
    className={REPORT_BUG_BUTTON_CLASS}
  >
    <Icon path={mdiLadybug} aria-hidden />
    Report bug
  </Button>
);
