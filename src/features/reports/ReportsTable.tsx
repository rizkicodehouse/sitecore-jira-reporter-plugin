"use client";
import { FC, useCallback, useEffect, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type {
  LoadReports, ReportRow, ReportsPage
} from "./types";

type BadgeColor =
  | "neutral" | "primary" | "danger" | "success"
  | "warning" | "yellow" | "teal" | "cyan" | "blue" | "pink";

function issueTypeColor(t: string): BadgeColor {
  const k = t.trim().toLowerCase();
  if (k === "bug") return "danger";
  if (k === "story") return "success";
  if (k === "task") return "blue";
  if (k === "epic") return "primary";
  if (k === "sub-task" || k === "subtask") return "teal";
  if (k === "improvement") return "cyan";
  return "neutral";
}

const HEAD_CELL =
  "text-2xs font-semibold uppercase tracking-[0.14em] text-primary-700";

export type ReportsTableProps = {
  load: LoadReports;
  pageSize?: number;
};

export const ReportsTable: FC<ReportsTableProps> = (
  { load, pageSize = 50 }
) => {
  const [data, setData] = useState<ReportsPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setErr(null);
    try {
      const page = await load({
        offset: nextOffset, limit: pageSize
      });
      setData(page);
      setOffset(page.offset);
    } catch (e) {
      setErr(
        (e as { userMessage?: string }).userMessage ??
        (e as Error).message ??
        "Failed to load reports"
      );
    } finally {
      setLoading(false);
    }
  }, [load, pageSize]);

  useEffect(() => {
    void refresh(0);
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-10"
           aria-label="Loading reports">
        <Spinner className="h-5 w-5 text-primary-500" />
      </div>
    );
  }

  if (err && !data) {
    return (
      <Alert variant="danger">
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{err}</span>
          <Button variant="link" size="xs"
            onClick={() => refresh(offset)}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <div className="flex flex-col gap-4">
      {err && (
        <Alert variant="danger">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary-200 via-pink-200 to-cyan-200 shadow-inner" />
          <p className="max-w-sm text-sm text-gray-600">
            No bug reports yet. Reports submitted from the
            Pages Panel will appear here.
          </p>
        </div>
      ) : (
        <Table aria-label="Reported bugs"
          containerClassName="border border-primary-100/80 shadow-sm">
          <TableHeader className="bg-gradient-to-r from-primary-50 via-white to-cyan-50">
            <TableRow className="border-b border-primary-100 hover:bg-transparent">
              <TableHead className={HEAD_CELL}>Key</TableHead>
              <TableHead className={HEAD_CELL}>Summary</TableHead>
              <TableHead className={HEAD_CELL}>Type</TableHead>
              <TableHead className={HEAD_CELL}>Page</TableHead>
              <TableHead className={HEAD_CELL}>Component</TableHead>
              <TableHead className={HEAD_CELL}>Reporter</TableHead>
              <TableHead className={HEAD_CELL}>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r, i) => (
              <TableReportRow key={r.jiraKey}
                row={r} zebra={i % 2 === 1} />
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
        <span className="text-gray-500">
          {total === 0
            ? "0 reports"
            : (
              <>
                Showing{" "}
                <span className="font-semibold text-primary-700 tabular-nums">
                  {offset + 1}–{Math.min(offset + pageSize, total)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-primary-700 tabular-nums">
                  {total}
                </span>
              </>
            )}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            disabled={!hasPrev || loading}
            onClick={() =>
              refresh(Math.max(0, offset - pageSize))}>
            Previous
          </Button>
          <Button variant="outline" size="sm"
            disabled={!hasNext || loading}
            onClick={() => refresh(offset + pageSize)}>
            Next
          </Button>
          <Button variant="ghost" size="sm"
            disabled={loading}
            onClick={() => refresh(offset)}
            aria-label="Refresh">
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
};

const TableReportRow: FC<{ row: ReportRow; zebra: boolean }> = (
  { row, zebra }
) => {
  const componentLabel = row.rendering?.name
    || row.rendering?.renderingId
    || (row.rendering?.instanceId
        ? row.rendering.instanceId.slice(0, 8)
        : "—");
  const reporterLabel = row.reporter?.name
    || row.reporter?.email
    || "—";
  return (
    <TableRow
      className={cn(
        "border-b border-primary-50 transition-colors",
        zebra && "bg-primary-50/25",
        "hover:bg-primary-50/70"
      )}
    >
      <TableCell>
        <a href={row.jiraUrl} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 transition hover:border-primary-400 hover:bg-primary-100 hover:text-primary-800">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
          {row.jiraKey}
        </a>
      </TableCell>
      <TableCell className="max-w-[28rem] whitespace-normal font-medium text-gray-900">
        {row.summary}
      </TableCell>
      <TableCell>
        <Badge variant="bold"
          colorScheme={issueTypeColor(row.issueType)}
          className="text-2xs tracking-wide">
          {row.issueType}
        </Badge>
      </TableCell>
      <TableCell>
        {pageLabel(row.page)
          ? (
            <span
              title={row.page?.url ?? undefined}
              className="block max-w-[16rem] truncate font-medium text-gray-800">
              {pageLabel(row.page)}
            </span>
          )
          : <span className="text-gray-300">—</span>}
      </TableCell>
      <TableCell title={row.datasourceId ?? undefined}
        className="text-gray-700">
        {componentLabel}
      </TableCell>
      <TableCell title={row.reporter?.email ?? undefined}>
        <ReporterChip label={reporterLabel} />
      </TableCell>
      <TableCell className="tabular-nums text-gray-500">
        {formatDate(row.createdAt)}
      </TableCell>
    </TableRow>
  );
};

const ReporterChip: FC<{ label: string }> = ({ label }) => {
  if (label === "—") {
    return <span className="text-gray-300">—</span>;
  }
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-cyan-400 text-3xs font-bold text-white shadow-sm ring-2 ring-white">
        {initials}
      </span>
      <span className="text-gray-800">{label}</span>
    </span>
  );
};

function pageLabel(
  page: { title: string; url: string } | null
): string {
  if (!page) return "";
  if (page.title.trim()) return page.title.trim();
  const url = page.url.trim();
  if (!url) return "";
  try {
    const parsed = url.startsWith("http")
      ? new URL(url)
      : new URL(url, "http://x");
    const site = parsed.searchParams.get("sc_site");
    const path = parsed.pathname === "/" || !parsed.pathname
      ? "Home" : parsed.pathname;
    return site ? `${path} · ${site}` : path;
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}
