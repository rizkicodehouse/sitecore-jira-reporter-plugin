"use client";
import { FC, useEffect, useState } from "react";

export type PublicSettings = {
  projectKey: string;
  defaultIssueType: string;
  defaultLabels: string[];
  defaultAssigneeAccountId: string | null;
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
  defaultAssigneeAccountId: string | null;
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

export const SettingsView: FC<SettingsViewProps> = (
  { load, save }
) => {
  const [value, setValue] =
    useState<PublicSettings | null>(null);
  const [newToken, setNewToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load().then(setValue).catch(
      (e) => setErr(e?.userMessage ?? "Load failed")
    );
  }, [load]);

  if (!value) {
    return <div className="p-4">Loading…</div>;
  }

  async function onSave() {
    setErr(null); setSaved(false);
    const update: SettingsUpdate = {
      projectKey: value!.projectKey,
      defaultIssueType: value!.defaultIssueType,
      defaultLabels: value!.defaultLabels,
      defaultAssigneeAccountId:
        value!.defaultAssigneeAccountId,
      defaultBoardId: value!.defaultBoardId,
      jiraBaseUrl: value!.jiraBaseUrl,
      jiraServiceEmail: value!.jiraServiceEmail,
      adminEmails: value!.adminEmails
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
        (e as { userMessage?: string }).userMessage
          ?? "Save failed"
      );
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3"
         aria-label="Plugin settings">
      {err && (
        <div role="alert"
             className="bg-red-50 border border-red-200 p-2">
          {err}
        </div>
      )}
      {saved && <div role="status">Saved</div>}

      <h3 className="font-semibold text-sm mt-2">
        JIRA connection
      </h3>
      <label>
        JIRA base URL <span className="text-red-600">*</span>
        <input required
          className="mt-1 block w-full border px-2 py-1"
          placeholder="https://your-org.atlassian.net"
          value={value.jiraBaseUrl}
          onChange={(e) => setValue({
            ...value, jiraBaseUrl: e.target.value
          })} />
      </label>
      <label>
        Service account email{" "}
        <span className="text-red-600">*</span>
        <input required
          className="mt-1 block w-full border px-2 py-1"
          placeholder="svc-bot@your-org.com"
          value={value.jiraServiceEmail}
          onChange={(e) => setValue({
            ...value, jiraServiceEmail: e.target.value
          })} />
      </label>
      <label>
        API token <span className="text-red-600">*</span>
        {value.hasJiraApiToken && (
          <span className="ml-2 text-xs text-green-700">
            (stored — leave blank to keep)
          </span>
        )}
        <input type="password"
          required={!value.hasJiraApiToken}
          className="mt-1 block w-full border px-2 py-1"
          placeholder={
            value.hasJiraApiToken
              ? "••••••••"
              : "Atlassian API token"
          }
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)} />
      </label>

      <h3 className="font-semibold text-sm mt-2">
        Defaults for new issues
      </h3>
      <label>
        Project key <span className="text-red-600">*</span>
        <input required
          className="mt-1 block w-full border px-2 py-1"
          placeholder="e.g. SJP"
          value={value.projectKey}
          onChange={(e) => setValue({
            ...value, projectKey: e.target.value
          })} />
      </label>
      <label>
        Default issue type
        <input className="mt-1 block w-full border px-2 py-1"
          value={value.defaultIssueType}
          onChange={(e) => setValue({
            ...value, defaultIssueType: e.target.value
          })} />
      </label>
      <label>
        Default labels (comma-separated)
        <input className="mt-1 block w-full border px-2 py-1"
          value={value.defaultLabels.join(", ")}
          onChange={(e) => setValue({
            ...value,
            defaultLabels: e.target.value.split(",")
              .map((s) => s.trim()).filter(Boolean)
          })} />
      </label>
      <label>
        Default assignee (email or accountId, optional)
        <input className="mt-1 block w-full border px-2 py-1"
          placeholder="alice@co.com or 5c1aed…"
          value={value.defaultAssigneeAccountId ?? ""}
          onChange={(e) => setValue({
            ...value,
            defaultAssigneeAccountId: e.target.value || null
          })} />
        <p className="text-xs text-gray-500 mt-1">
          Enter an email and we'll look up the JIRA
          accountId on save (requires valid JIRA creds
          above).
        </p>
      </label>
      <label>
        Target board ID (optional)
        <input type="number" min={1}
          className="mt-1 block w-full border px-2 py-1"
          placeholder="e.g. 2124"
          value={value.defaultBoardId ?? ""}
          onChange={(e) => {
            const n = e.target.value
              ? Number(e.target.value) : null;
            setValue({
              ...value,
              defaultBoardId:
                n && Number.isInteger(n) && n > 0
                  ? n : null
            });
          }} />
        <p className="text-xs text-gray-500 mt-1">
          For Scrum boards, new tickets are added to the
          board's active sprint. Kanban boards need no
          board ID — the ticket will appear as long as it
          matches the board's JQL filter. Find the ID in
          the board URL, e.g. <code>…/boards/2124</code>.
        </p>
      </label>

      <h3 className="font-semibold text-sm mt-2">
        Admins
      </h3>
      <label>
        Admin emails (comma-separated)
        <input className="mt-1 block w-full border px-2 py-1"
          placeholder="alice@co.com, bob@co.com"
          value={value.adminEmails.join(", ")}
          onChange={(e) => setValue({
            ...value,
            adminEmails: e.target.value.split(",")
              .map((s) => s.trim()).filter(Boolean)
          })} />
        <p className="text-xs text-gray-500 mt-1">
          If empty, any signed-in user can edit settings.
          Set this to lock down config after initial setup.
        </p>
      </label>

      {(() => {
        const missing: string[] = [];
        if (!value.jiraBaseUrl.trim())
          missing.push("JIRA base URL");
        if (!value.jiraServiceEmail.trim())
          missing.push("Service account email");
        if (!newToken.trim() && !value.hasJiraApiToken)
          missing.push("API token");
        if (!value.projectKey.trim())
          missing.push("Project key");
        const canSave = missing.length === 0;
        return (
          <>
            {!canSave && (
              <p className="text-xs text-red-700">
                Required: {missing.join(", ")}.
              </p>
            )}
            <button type="button" onClick={onSave}
              disabled={!canSave}
              className={
                "self-end px-3 py-1 border rounded " +
                (canSave
                  ? ""
                  : "opacity-50 cursor-not-allowed")
              }>
              Save
            </button>
          </>
        );
      })()}
    </div>
  );
};
