"use client";
import {
  FC, useEffect, useMemo, useRef, useState
} from "react";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export type JiraPriority = {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  statusColor: string | null;
  isDefault: boolean;
};

export type PriorityPickerProps = {
  value: JiraPriority | null;
  onChange: (next: JiraPriority | null) => void;
  load: () => Promise<JiraPriority[]>;
};

export const PriorityPicker: FC<PriorityPickerProps> = (
  { value, onChange, load }
) => {
  const [priorities, setPriorities] =
    useState<JiraPriority[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await load();
        if (cancelled) return;
        setPriorities(list);
        if (!value) {
          const def = list.find((p) => p.isDefault)
            ?? list[0] ?? null;
          if (def) onChange(def);
        }
      } catch (e) {
        if (cancelled) return;
        setErr(
          (e as { userMessage?: string }).userMessage
          ?? (e as Error).message
          ?? "Could not load priorities"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(
        e.target as Node
      )) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () =>
      document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const items = useMemo(
    () => priorities ?? [], [priorities]
  );

  return (
    <div
      className="space-y-1.5 relative"
      ref={containerRef}
    >
      <Label htmlFor="priority">Priority</Label>
      <button
        id="priority"
        type="button"
        disabled={loading || Boolean(err)}
        onClick={() => setOpen((x) => !x)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {loading && <Spinner className="h-3 w-3" />}
          {!loading && value && (
            <PriorityRow priority={value} />
          )}
          {!loading && !value && (
            <span className="text-muted-foreground">
              — Select priority —
            </span>
          )}
        </span>
        <svg
          aria-hidden
          className="h-4 w-4 opacity-60"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.3 7.3a1 1 0 011.4 0L10 10.59l3.3-3.3a1 1 0 111.4 1.42l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.42z"
          />
        </svg>
      </button>
      {err && (
        <p className="text-xs text-destructive">{err}</p>
      )}
      {open && !loading && !err && (
        <div
          role="listbox"
          aria-label="Priority options"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-input bg-background shadow-lg"
        >
          {items.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No priorities available
            </div>
          )}
          {items.map((p) => (
            <button
              type="button"
              key={p.id}
              role="option"
              aria-selected={value?.id === p.id}
              className={
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                + (value?.id === p.id ? " bg-accent/50" : "")
              }
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              <PriorityRow priority={p} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PriorityRow: FC<{ priority: JiraPriority }> = (
  { priority }
) => (
  <span className="flex items-center gap-2">
    {priority.iconUrl
      ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={priority.iconUrl}
          alt=""
          aria-hidden
          className="h-4 w-4"
        />
      )
      : (
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-full"
          style={{
            backgroundColor:
              priority.statusColor ?? "#6b7280"
          }}
        />
      )}
    <span className="text-sm">{priority.name}</span>
  </span>
);
