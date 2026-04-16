"use client";
import { FC } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icon";
import { mdiBugOutline } from "@mdi/js";

export type ReportBugButtonProps = {
  disabled: boolean;
  onClick: () => void;
};

export const ReportBugButton: FC<ReportBugButtonProps> = (
  { disabled, onClick }
) => (
  <Button
    variant="outline"
    size="sm"
    disabled={disabled}
    onClick={onClick}
    aria-label="Report bug to Jira"
    title={disabled
      ? "Select a component to report"
      : "Report a bug for the selected component"}
  >
    <Icon path={mdiBugOutline} size={0.7} aria-hidden />
    Report bug
  </Button>
);
