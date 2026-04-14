"use client";
import { FC, useEffect, useState } from "react";

export type Settings = {
  projectKey: string;
  defaultIssueType: string;
  defaultLabels: string[];
  defaultAssigneeAccountId: string | null;
};

export type SettingsViewProps = {
  load: () => Promise<Settings>;
  save: (next: Settings) => Promise<Settings>;
};

export const SettingsView: FC<SettingsViewProps> = (
  { load, save }
) => {
  const [value, setValue] = useState<Settings | null>(null);
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
    try {
      const next = await save(value!);
      setValue(next);
      setSaved(true);
    } catch (e) {
      setErr(
        (e as { userMessage?: string }).userMessage
          ?? "Save failed"
      );
    }
  }

  function updateLabels(raw: string) {
    setValue({
      ...value!,
      defaultLabels: raw.split(",")
        .map((s) => s.trim()).filter(Boolean)
    });
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
      <label>
        Project key
        <input className="mt-1 block w-full border px-2 py-1"
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
          onChange={(e) => updateLabels(e.target.value)} />
      </label>
      <label>
        Default assignee accountId (optional)
        <input className="mt-1 block w-full border px-2 py-1"
          value={value.defaultAssigneeAccountId ?? ""}
          onChange={(e) => setValue({
            ...value,
            defaultAssigneeAccountId: e.target.value || null
          })} />
      </label>
      <button type="button" onClick={onSave}
        className="self-end px-3 py-1 border rounded">
        Save
      </button>
    </div>
  );
};
