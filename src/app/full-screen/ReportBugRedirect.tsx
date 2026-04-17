"use client";
import { FC } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icon";
import { mdiBugOutline } from "@mdi/js";
import {
  REPORT_BUG_BUTTON_CLASS
} from "@/features/report-bug/ReportBugButton";

const PAGES_EDITOR_URL = "https://pages.sitecorecloud.io/";

export const ReportBugRedirect: FC = () => (
  <Button asChild className={REPORT_BUG_BUTTON_CLASS}>
    <a
      href={PAGES_EDITOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open Page Builder to report a bug"
    >
      <Icon path={mdiBugOutline} aria-hidden />
      Report bug
    </a>
  </Button>
);
