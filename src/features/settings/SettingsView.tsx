"use client";
import { FC, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export type PublicSettings = {
  projectKey: string;
  defaultIssueType: string;
  defaultLabels: string[];
  defaultBoardId: number | null;
  jiraBaseUrl: string;
  jiraServiceEmail: string;
  hasJiraApiToken: boolean;
  adminEmails: string[];
};

export type SettingsUpdate = {
  projectKey: string;
  defaultIssueType: string;
  defaultLabels: string[];
  defaultBoardId: number | null;
  jiraBaseUrl: string;
  jiraServiceEmail: string;
  jiraApiToken?: string;
  adminEmails: string[];
};

export type SettingsViewProps = {
  load: () => Promise<PublicSettings>;
  save: (next: SettingsUpdate) => Promise<PublicSettings>;
};

export const SettingsView: FC<SettingsViewProps> = ({ load, save }) => {
  const [value, setValue] = useState<PublicSettings | null>(null);
  const [newToken, setNewToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load().then(setValue).catch(
      (e) => setErr(e?.userMessage ?? "Load failed")
    );
  }, [load]);

  if (!value) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  async function onSave() {
    setErr(null);
    setSaved(false);
    const update: SettingsUpdate = {
      projectKey: value!.projectKey,
      defaultIssueType: value!.defaultIssueType,
      defaultLabels: value!.defaultLabels,
      defaultBoardId: value!.defaultBoardId,
      jiraBaseUrl: value!.jiraBaseUrl,
      jiraServiceEmail: value!.jiraServiceEmail,
      adminEmails: value!.adminEmails,
    };
    if (newToken.trim()) {
      update.jiraApiToken = newToken.trim();
    }
    try {
      const next = await save(update);
      setValue(next);
      setNewToken("");
      setSaved(true);
    } catch (e) {
      setErr(
        (e as { userMessage?: string }).userMessage ?? "Save failed"
      );
    }
  }

  const missing: string[] = [];
  if (!value.jiraBaseUrl.trim()) missing.push("Jira base URL");
  if (!value.jiraServiceEmail.trim()) missing.push("Service account email");
  if (!newToken.trim() && !value.hasJiraApiToken) missing.push("API token");
  if (!value.projectKey.trim()) missing.push("Project key");
  const canSave = missing.length === 0;

  return (
    <div className="p-4 flex flex-col gap-3" aria-label="Plugin settings">
      {err && (
        <Alert variant="danger">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert variant="success">
          <AlertDescription role="status">Saved</AlertDescription>
        </Alert>
      )}

      <h3 className="text-sm font-semibold mt-3">
        Connect to your Jira workspace
      </h3>
      <Separator className="my-1" />

      <div className="space-y-1.5">
        <Label htmlFor="jiraBaseUrl">
          Jira workspace URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="jiraBaseUrl"
          required
          placeholder="https://your-org.atlassian.net"
          value={value.jiraBaseUrl}
          onChange={(e) => setValue({ ...value, jiraBaseUrl: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="jiraServiceEmail">
          Jira service account email{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="jiraServiceEmail"
          required
          placeholder="svc-bot@your-org.com"
          value={value.jiraServiceEmail}
          onChange={(e) =>
            setValue({ ...value, jiraServiceEmail: e.target.value })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="jiraApiToken">
          Jira API token <span className="text-destructive">*</span>
          {value.hasJiraApiToken && (
            <span className="ml-2 text-xs text-success-600">
              (stored — leave blank to keep)
            </span>
          )}
        </Label>
        <Input
          id="jiraApiToken"
          type="password"
          required={!value.hasJiraApiToken}
          placeholder={value.hasJiraApiToken ? "••••••••" : "Atlassian API token"}
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)}
        />
      </div>

      <h3 className="text-sm font-semibold mt-3">
        Defaults applied to new bug reports
      </h3>
      <Separator className="my-1" />

      <div className="space-y-1.5">
        <Label htmlFor="projectKey">
          Target Jira project key{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="projectKey"
          required
          placeholder="e.g. SJP"
          value={value.projectKey}
          onChange={(e) => setValue({ ...value, projectKey: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defaultIssueType">
          Default Jira issue type
        </Label>
        <Input
          id="defaultIssueType"
          placeholder="e.g. Bug"
          value={value.defaultIssueType}
          onChange={(e) =>
            setValue({ ...value, defaultIssueType: e.target.value })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defaultLabels">
          Default Jira labels (comma-separated)
        </Label>
        <Input
          id="defaultLabels"
          placeholder="e.g. page-builder, frontend"
          value={value.defaultLabels.join(", ")}
          onChange={(e) =>
            setValue({
              ...value,
              defaultLabels: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defaultBoardId">
          Jira board ID for sprint assignment (optional)
        </Label>
        <Input
          id="defaultBoardId"
          type="number"
          min={1}
          placeholder="e.g. 2124"
          value={value.defaultBoardId ?? ""}
          onChange={(e) => {
            const n = e.target.value ? Number(e.target.value) : null;
            setValue({
              ...value,
              defaultBoardId: n && Number.isInteger(n) && n > 0 ? n : null,
            });
          }}
        />
        <p className="text-xs text-muted-foreground mt-1">
          For Scrum boards, new tickets are added to the board&apos;s active
          sprint. Kanban boards need no board ID — the ticket will appear as
          long as it matches the board&apos;s JQL filter. Find the ID in the
          board URL, e.g. <code>…/boards/2124</code>.
        </p>
      </div>

      <h3 className="text-sm font-semibold mt-3">
        Plugin administrators
      </h3>
      <Separator className="my-1" />

      <div className="space-y-1.5">
        <Label htmlFor="adminEmails">
          Admin emails allowed to edit settings (comma-separated)
        </Label>
        <Input
          id="adminEmails"
          placeholder="alice@co.com, bob@co.com"
          value={value.adminEmails.join(", ")}
          onChange={(e) =>
            setValue({
              ...value,
              adminEmails: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
        <p className="text-xs text-muted-foreground mt-1">
          If empty, any signed-in user can edit settings. Set this to lock down
          config after initial setup.
        </p>
      </div>

      {!canSave && (
        <p className="text-xs text-destructive">
          Required: {missing.join(", ")}.
        </p>
      )}

      <Button onClick={onSave} disabled={!canSave} className="self-end">
        Save
      </Button>
    </div>
  );
};
