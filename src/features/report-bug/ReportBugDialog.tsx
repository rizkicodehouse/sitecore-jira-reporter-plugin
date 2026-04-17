"use client";
import { FC, useEffect, useState } from "react";
import type { ReportContext } from "./types";
import { datasourceFromRendering } from "./useAutoContext";
import type {
  NormalizedField
} from "@/lib/jira-create-meta";
import { doc, para } from "@/lib/adf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  AssigneePicker, type AssigneeUser
} from "./AssigneePicker";
import {
  PriorityPicker, type JiraPriority
} from "./PriorityPicker";

type SubmitFn = (input: {
  summary: string;
  descriptionText: string;
  context: ReportContext;
  attachmentCount: number;
  customFields?: Record<string, unknown>;
  assignee?: { accountId: string } | null;
  priority?: { id: string } | null;
}) => Promise<{ key: string; url: string }>;

type UploadFn = (issueKey: string, blob: Blob) =>
  Promise<{ id: string }>;

type MetaLoader = () =>
  Promise<{ fields: NormalizedField[] }>;

type UserSearchFn = (q: string) => Promise<AssigneeUser[]>;

type PriorityLoader = () => Promise<JiraPriority[]>;

type Attachment = {
  id: string; source: "capture" | "upload";
  blob: Blob; name: string;
};

// Sentinel value for the rendering picker meaning
// "report against the whole page, not a specific rendering".
const PAGE_LEVEL = "__page_level__";

export type ReportBugDialogProps = {
  context: ReportContext;
  submit: SubmitFn;
  uploadAttachment: UploadFn;
  onClose: () => void;
  captureScreen?: () => Promise<Blob | null>;
  loadCreateMeta?: MetaLoader;
  searchUsers?: UserSearchFn;
  loadPriorities?: PriorityLoader;
};

export const ReportBugDialog: FC<ReportBugDialogProps> = (
  { context, submit, uploadAttachment,
    onClose, captureScreen, loadCreateMeta, searchUsers,
    loadPriorities }
) => {
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
  const [assignee, setAssignee] =
    useState<AssigneeUser | null>(null);
  const [priority, setPriority] =
    useState<JiraPriority | null>(null);

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
      rendering: chosen,
      datasource: datasourceFromRendering(chosen)
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
          ? customFields : undefined,
        assignee: assignee
          ? { accountId: assignee.accountId }
          : null,
        priority: priority
          ? { id: priority.id }
          : null
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
      <div role="dialog" aria-label="Bug reported" className="p-4 space-y-3">
        <p className="text-sm">
          Bug reported as{" "}
          <a href={created.url} target="_blank" rel="noreferrer"
             className="text-primary underline font-medium">
            {created.key}
          </a>
        </p>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Report bug"
         className="p-4 flex flex-col gap-3">
      {err && (
        <Alert variant="danger">
          <AlertDescription className="flex items-center justify-between">
            <span>{err}</span>
            <Button variant="link" size="xs" onClick={doSubmit}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      {context.renderings.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="rendering">Component</Label>
          <select id="rendering"
            value={pickedInstanceId}
            onChange={(e) =>
              setPickedInstanceId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="summary">Summary</Label>
        <Input id="summary" value={summary}
          onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="desc">Description</Label>
        <Textarea id="desc" value={desc}
          onChange={(e) => setDesc(e.target.value)} rows={5} />
      </div>

      {searchUsers && (
        <AssigneePicker
          value={assignee}
          onChange={setAssignee}
          search={searchUsers}
        />
      )}

      {loadPriorities && (
        <PriorityPicker
          value={priority}
          onChange={setPriority}
          load={loadPriorities}
        />
      )}

      {metaLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="h-3 w-3" /> Loading Jira field schema…
        </div>
      )}
      {metaError && (
        <p className="text-xs text-warning">
          Could not load Jira field schema: {metaError}.
          The ticket may fail to create if your project
          has required custom fields.
        </p>
      )}

      {requiredExtras.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-2">
            Required by your Jira project
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
        <pre className="text-xs bg-muted p-2 rounded
                        overflow-auto max-h-40">
{JSON.stringify(context, null, 2)}
        </pre>
      </details>
      <div className="flex gap-2 items-center">
        {captureScreen && (
          <Button variant="outline" size="sm" type="button" onClick={onCapture}>
            Capture screen
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <label className="cursor-pointer">
            Upload image
            <input type="file" className="hidden"
              accept="image/png,image/jpeg,image/webp"
              onChange={onUpload} />
          </label>
        </Button>
        {!captureScreen && (
          <span className="text-xs text-muted-foreground">
            Screen capture is blocked in this embedded
            view — use Upload with an OS screenshot.
          </span>
        )}
      </div>
      {attach.length > 0 && (
        <ul className="text-xs flex flex-col gap-1">
          {attach.map((a) => (
            <li key={a.id}
                className="flex items-center justify-between bg-muted px-2 py-1 rounded">
              <span className="flex items-center gap-1.5">
                {a.name} <Badge variant="default" className="text-[10px] px-1 py-0">{a.source}</Badge>
              </span>
              <Button variant="ghost" size="icon-xs"
                aria-label={`Remove ${a.name}`}
                onClick={() => setAttach(
                  (prev) => prev.filter((x) => x.id !== a.id)
                )}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={doSubmit}
          disabled={!canSubmit}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </div>
      {missingRequired.length > 0 && (
        <p className="text-xs text-destructive">
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
  "issuetype", "assignee", "reporter", "attachment",
  "priority"
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
        // Jira custom paragraph fields require ADF,
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

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const DynamicFieldInput: FC<DynamicFieldInputProps> = (
  { field, value, onChange }
) => {
  const label = (
    <Label>
      {field.name}
      {field.required && (
        <span className="text-destructive ml-1">*</span>
      )}
    </Label>
  );
  if (field.type === "paragraph") {
    return (
      <div className="space-y-1.5">
        {label}
        <Textarea rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.type === "string") {
    return (
      <div className="space-y-1.5">
        {label}
        <Input type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.type === "number") {
    return (
      <div className="space-y-1.5">
        {label}
        <Input type="number"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.type === "option" || field.type === "priority") {
    return (
      <div className="space-y-1.5">
        {label}
        <select className={selectCls}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {(field.allowedValues ?? []).map((v) => (
            <option key={v.id ?? v.name} value={v.id ?? ""}>
              {v.name ?? v.value ?? v.id}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === "array-option") {
    const current = (value as string[]) ?? [];
    return (
      <div className="space-y-1.5">
        {label}
        <select multiple className={selectCls + " min-h-20"}
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
      </div>
    );
  }
  if (field.type === "array-string") {
    return (
      <div className="space-y-1.5">
        {label}
        <Input type="text"
          placeholder="comma-separated"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {field.name}: field type not supported yet
      ({field.schemaType}
      {field.schemaItems ? ` of ${field.schemaItems}` : ""}).
      Contact your Jira admin.
    </p>
  );
};
