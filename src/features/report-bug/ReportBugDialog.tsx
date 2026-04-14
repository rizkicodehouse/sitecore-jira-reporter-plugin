"use client";
import { FC, useState } from "react";
import type { ReportContext } from "./types";

type SubmitFn = (input: {
  summary: string;
  descriptionText: string;
  context: ReportContext;
  attachmentCount: number;
}) => Promise<{ key: string; url: string }>;

type UploadFn = (issueKey: string, blob: Blob) =>
  Promise<{ id: string }>;

type Attachment = {
  id: string; source: "capture" | "upload";
  blob: Blob; name: string;
};

export type ReportBugDialogProps = {
  context: ReportContext;
  submit: SubmitFn;
  uploadAttachment: UploadFn;
  onClose: () => void;
  captureScreen?: () => Promise<Blob | null>;
};

export const ReportBugDialog: FC<ReportBugDialogProps> = (
  { context, submit, uploadAttachment,
    onClose, captureScreen }
) => {
  const [summary, setSummary] = useState("");
  const [desc, setDesc] = useState("");
  const [attach, setAttach] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    key: string; url: string;
  } | null>(null);

  const canSubmit = summary.trim().length > 0 && !submitting;

  async function doSubmit() {
    setSubmitting(true); setErr(null);
    try {
      const result = await submit({
        summary: summary.trim(),
        descriptionText: desc,
        context,
        attachmentCount: attach.length
      });
      for (const a of attach) {
        try { await uploadAttachment(result.key, a.blob); }
        catch {}
      }
      setCreated(result);
    } catch (e) {
      const msg =
        (e as { userMessage?: string }).userMessage
        ?? "Failed to submit";
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function onCapture() {
    if (!captureScreen) return;
    const blob = await captureScreen();
    if (!blob) return;
    setAttach((prev) => [...prev, {
      id: crypto.randomUUID(),
      source: "capture",
      blob,
      name: `capture-${Date.now()}.png`
    }]);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttach((prev) => [...prev, {
      id: crypto.randomUUID(),
      source: "upload",
      blob: file,
      name: file.name
    }]);
    e.target.value = "";
  }

  if (created) {
    return (
      <div role="dialog" aria-label="Bug reported"
           className="p-4">
        <p>Bug reported as{" "}
          <a href={created.url} target="_blank"
             rel="noreferrer" className="underline">
            {created.key}
          </a>
        </p>
        <button onClick={onClose}
          className="mt-3 px-3 py-1 border rounded">
          Close
        </button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Report bug"
         className="p-4 flex flex-col gap-3">
      {err && (
        <div role="alert"
             className="bg-red-50 border border-red-200
                        text-red-900 p-2 rounded
                        flex items-center justify-between">
          <span>{err}</span>
          <button onClick={doSubmit}
            className="underline ml-2">Retry</button>
        </div>
      )}
      <label htmlFor="summary" className="text-sm font-medium">
        Summary
        <input id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="mt-1 w-full border rounded px-2 py-1" />
      </label>
      <label htmlFor="desc" className="text-sm font-medium">
        Description
        <textarea id="desc"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={5}
          className="mt-1 w-full border rounded px-2 py-1" />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer">
          Auto-captured context
        </summary>
        <pre className="text-xs bg-gray-50 p-2 rounded
                        overflow-auto max-h-40">
{JSON.stringify(context, null, 2)}
        </pre>
      </details>
      <div className="flex gap-2">
        <button type="button" onClick={onCapture}
          className="border rounded px-2 py-1">
          Capture screen
        </button>
        <label className="border rounded px-2 py-1
                          cursor-pointer">
          Upload image
          <input type="file" className="hidden"
            accept="image/png,image/jpeg,image/webp"
            onChange={onUpload} />
        </label>
      </div>
      {attach.length > 0 && (
        <ul className="text-xs flex flex-col gap-1">
          {attach.map((a) => (
            <li key={a.id}
                className="flex justify-between
                           bg-gray-50 px-2 py-1 rounded">
              <span>{a.name} ({a.source})</span>
              <button aria-label={`Remove ${a.name}`}
                onClick={() => setAttach(
                  (prev) => prev.filter((x) => x.id !== a.id)
                )}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="px-3 py-1">Cancel</button>
        <button type="button" onClick={doSubmit}
          disabled={!canSubmit}
          className="px-3 py-1 border rounded
                     disabled:opacity-50">
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
};
