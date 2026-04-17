"use client";
import {
  FC, useCallback, useEffect, useMemo, useRef, useState
} from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

export type AssigneeUser = {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl: string | null;
};

export type AssigneePickerProps = {
  value: AssigneeUser | null;
  onChange: (next: AssigneeUser | null) => void;
  search: (q: string) => Promise<AssigneeUser[]>;
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

export const AssigneePicker: FC<AssigneePickerProps> = (
  { value, onChange, search }
) => {
  const [query, setQuery] = useState("");
  const [results, setResults] =
    useState<AssigneeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setErr(null);
    if (q.trim().length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await search(q);
      setResults(list);
    } catch (e) {
      const msg =
        (e as { userMessage?: string }).userMessage
        ?? "Could not search Jira users";
      setErr(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (value) return;
    const handle = setTimeout(
      () => runSearch(query), DEBOUNCE_MS
    );
    return () => clearTimeout(handle);
  }, [query, runSearch, value]);

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

  const showDropdown = useMemo(
    () => open && !value && query.trim().length >= MIN_QUERY,
    [open, value, query]
  );

  if (value) {
    return (
      <div className="space-y-1.5">
        <Label>Assignee</Label>
        <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2">
          <AssigneeRow user={value} compact />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label="Clear assignee"
            onClick={() => {
              onChange(null);
              setQuery("");
              setResults([]);
            }}
          >
            Clear
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-1.5 relative"
      ref={containerRef}
    >
      <Label htmlFor="assignee">
        Assignee (optional)
      </Label>
      <Input
        id="assignee"
        autoComplete="off"
        placeholder="Search by name or email"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {err && (
        <p className="text-xs text-destructive">{err}</p>
      )}
      {showDropdown && (
        <div
          role="listbox"
          aria-label="Assignee suggestions"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-input bg-background shadow-lg"
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Spinner className="h-3 w-3" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No matches for &ldquo;{query}&rdquo;
            </div>
          )}
          {!loading && results.map((u) => (
            <button
              type="button"
              key={u.accountId}
              role="option"
              aria-selected={false}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onChange(u);
                setOpen(false);
                setQuery("");
              }}
            >
              <AssigneeRow user={u} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AssigneeRow: FC<{
  user: AssigneeUser; compact?: boolean;
}> = ({ user, compact }) => {
  const initials = (user.displayName || user.emailAddress)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
  return (
    <span className="flex items-center gap-2">
      {user.avatarUrl
        ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            aria-hidden
            className="h-6 w-6 rounded-full"
          />
        )
        : (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-cyan-400 text-3xs font-bold text-white">
            {initials}
          </span>
        )}
      <span className="flex flex-col leading-tight">
        <span className={
          compact ? "text-sm font-medium" : "text-sm"
        }>
          {user.displayName || user.emailAddress}
        </span>
        {user.emailAddress && (
          <span className="text-2xs text-muted-foreground">
            {user.emailAddress}
          </span>
        )}
      </span>
    </span>
  );
};
