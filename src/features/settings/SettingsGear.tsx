"use client";
import { FC } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icon";
import { mdiCogOutline } from "@mdi/js";

export const SettingsGear: FC<{ onClick: () => void }> = (
  { onClick }
) => (
  <Button
    variant="ghost"
    size="icon-sm"
    onClick={onClick}
    aria-label="Open settings"
    title="Settings"
  >
    <Icon path={mdiCogOutline} size={0.8} aria-hidden />
  </Button>
);
