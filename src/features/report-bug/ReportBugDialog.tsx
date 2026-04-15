"use client";
import { FC, useEffect, useState } from "react";
import type { ReportContext } from "./types";
import type {
  NormalizedField
} from "@/lib/jira-create-meta";
import { doc, para } from "@/lib/adf";

type SubmitFn = (input: {
  summary: string;
  descriptionText: string;
  context: ReportContext;
  attachmentCount: number;
  customFields?: Record<string, unknown>;
}) => Promise<{ key: string; url: string }>;

type UploadFn = (issueKey: string, blob: Blob) =>
  Promise<{ id: string }>;

type MetaLoader = () =>
  Promise<{ fields: NormalizedField[] }>;

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
  loadCreateMeta?: MetaLoader;
};

export const ReportBugDialog: FC<ReportBugDialogProps> = (
  { context, submit, uploadAttachment,
    onClose, captureScreen, loadCreateMeta }
) => {
  const PAGE_LEVEL = "__page_level__";
  const [summary, setSummary] = useState("");
  const [desc, setDesc] = useState("");
  const [attach, setAttach] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    key: string; url: string;
  } | null>(null);
  const [pickedInstanceId, setPickedInstanceId] =
    useState<string>(
      context.rendering?.instanceId ?? PAGE_LEVEL
    );
  const [metaFields, setMetaFields] =
    useState<NormalizedField[] | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] =
    useState<string | null>(null);
  const [dynamicValues, setDynamicValues] =
    useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!loadCreateMeta) return;
    let cancelled = false;
    setMetaLoading(true);
    (async () => {
      try {
        const res = await loadCreateMeta();
        if (!cancelled) setMetaFields(res.fields);
      } catch (e) {
        if (!cancelled) {
          setMetaError(
            (e as { userMessage?: string })
              .userMessage ?? (e as Error).message
              ?? "Could not load field schema"
          );
        }
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadCreateMeta]);

  const requiredExtras = (metaFields ?? []).filter(
    (f) =>
      f.required &&
      !f.hasDefaultValue &&
      !BUILTIN_FIELD_KEYS.has(f.key) &&
      f.type !== "unsupported"
  );

  const missingRequired = requiredExtras
    .filter((f) => !hasDynamicValue(dynamicValues[f.key]))
    .map((f) => f.name);

  const canSubmit =
    summary.trim().length > 0 &&
    !submitting &&
    missingRequired.length === 0;

  async function doSubmit() {
    setSubmitting(true); setErr(null);
    const chosen =
      pickedInstanceId === PAGE_LEVEL
        ? null
        : context.renderings.find(
            (r) => r.instanceId === pickedInstanceId
          ) ?? null;
    const scopedContext: ReportContext = {
      ...context,
      rendering: chosen
    };
    try {
      const customFields = buildCustomFieldsPayload(
        requiredExtras, dynamicValues
      );
      const result = await submit({
        summary: summary.trim(),
        descriptionText: desc,
        context: scopedContext,
        attachmentCount: attach.length,
        customFields: Object.keys(customFields).length
          ? customFields : undefined
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
      {context.renderings.length > 0 && (
        <label htmlFor="rendering"
               className="text-sm font-medium">
          Component
          <select id="rendering"
            value={pickedInstanceId}
            onChange={(e) =>
              setPickedInstanceId(e.target.value)}
            className="mt-1 w-full border rounded
                       px-2 py-1 bg-white">
            <option value={PAGE_LEVEL}>
              Page-level issue (no specific component)
            </option>
            {context.renderings.map((r) => (
              <option key={r.instanceId}
                      value={r.instanceId}>
                {r.name || r.renderingId}
                {r.placeholderKey
                  ? ` — ${r.placeholderKey}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
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

      {metaLoading && (
        <p className="text-xs text-gray-500">
          Loading JIRA field schema…
        </p>
      )}
      {metaError && (
        <p className="text-xs text-amber-700">
          Could not load JIRA field schema: {metaError}.
          The ticket may fail to create if your project
          has required custom fields.
        </p>
      )}

      {requiredExtras.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-2">
            Required by your JIRA project
          </h4>
          {requiredExtras.map((f) => (
            <DynamicFieldInput key={f.key} field={f}
              value={dynamicValues[f.key]}
              onChange={(v) => setDynamicValues(
                (prev) => ({ ...prev, [f.key]: v })
              )} />
          ))}
        </>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer">
          Auto-captured context
        </summary>
        <pre className="text-xs bg-gray-50 p-2 rounded
                        overflow-auto max-h-40">
{JSON.stringify(context, null, 2)}
        </pre>
      </details>
      <div className="flex gap-2 items-center">
        {captureScreen && (
          <button type="button" onClick={onCapture}
            className="border rounded px-2 py-1">
            Capture screen
          </button>
        )}
        <label className="border rounded px-2 py-1
                          cursor-pointer">
          Upload image
          <input type="file" className="hidden"
            accept="image/png,image/jpeg,image/webp"
            onChange={onUpload} />
        </label>
        {!captureScreen && (
          <span className="text-xs text-gray-500">
            Screen capture is blocked in this embedded
            view — use Upload with an OS screenshot.
          </span>
        )}
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
      {missingRequired.length > 0 && (
        <p className="text-xs text-red-700">
          Missing required: {missingRequired.join(", ")}.
        </p>
      )}
    </div>
  );
};

// Fields we already collect in the baseline form; any
// meta field matching these should NOT be rendered as a
// dynamic input (we'd collide with ourselves).
const BUILTIN_FIELD_KEYS = new Set([
  "summary", "description", "labels", "project",
  "issuetype", "assignee", "reporter", "attachment"
]);

function hasDynamicValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") {
    return Object.keys(v as object).length > 0;
  }
  return true;
}

function buildCustomFieldsPayload(
  fields: NormalizedField[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (!hasDynamicValue(raw)) continue;
    switch (f.type) {
      case "string":
        out[f.key] = String(raw);
        break;
      case "paragraph":
        // JIRA custom paragraph fields require ADF,
        // not plain strings. Wrap the input in a
        // minimal ADF document.
        out[f.key] = doc([para(String(raw))]);
        break;
      case "number":
        out[f.key] = Number(raw);
        break;
      case "option":
      case "priority":
        out[f.key] = { id: String(raw) };
        break;
      case "array-option":
        out[f.key] = (raw as string[]).map(
          (id) => ({ id })
        );
        break;
      case "array-string":
        out[f.key] = typeof raw === "string"
          ? raw.split(",").map((s) => s.trim())
              .filter(Boolean)
          : raw;
        break;
      default:
        // unsupported / user / date — pass through as-is
        out[f.key] = raw;
    }
  }
  return out;
}

type DynamicFieldInputProps = {
  field: NormalizedField;
  value: unknown;
  onChange: (v: unknown) => void;
};

const DynamicFieldInput: FC<DynamicFieldInputProps> = (
  { field, value, onChange }
) => {
  const label = (
    <span className="text-sm font-medium">
      {field.name}
      {field.required && (
        <span className="text-red-600 ml-1">*</span>
      )}
    </span>
  );
  const cls = "mt-1 w-full border rounded px-2 py-1";
  if (field.type === "paragraph") {
    return (
      <label>{label}
        <textarea rows={3} className={cls}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "string") {
    return (
      <label>{label}
        <input type="text" className={cls}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "number") {
    return (
      <label>{label}
        <input type="number" className={cls}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "option" || field.type === "priority") {
    return (
      <label>{label}
        <select className={cls + " bg-white"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {(field.allowedValues ?? []).map((v) => (
            <option key={v.id ?? v.name} value={v.id ?? ""}>
              {v.name ?? v.value ?? v.id}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "array-option") {
    const current = (value as string[]) ?? [];
    return (
      <label>{label}
        <select multiple className={cls + " bg-white"}
          value={current}
          onChange={(e) => {
            const picked = Array.from(
              e.target.selectedOptions
            ).map((o) => o.value);
            onChange(picked);
          }}>
          {(field.allowedValues ?? []).map((v) => (
            <option key={v.id ?? v.name} value={v.id ?? ""}>
              {v.name ?? v.value ?? v.id}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "array-string") {
    return (
      <label>{label}
        <input type="text" className={cls}
          placeholder="comma-separated"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <p className="text-xs text-gray-500">
      {field.name}: field type not supported yet
      ({field.schemaType}
      {field.schemaItems ? ` of ${field.schemaItems}` : ""}).
      Contact your JIRA admin.
    </p>
  );
};
