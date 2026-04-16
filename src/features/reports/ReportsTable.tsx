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
import type {
  LoadReports, ReportRow, ReportsPage
} from "./types";

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
      <div className="flex items-center justify-center p-8"
           aria-label="Loading reports">
        <Spinner className="h-5 w-5" />
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
    <div className="flex flex-col gap-3">
      {err && (
        <Alert variant="danger">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground p-8 text-center">
          No bug reports yet. Reports submitted from the
          Pages Panel will appear here.
        </p>
      ) : (
        <Table aria-label="Reported bugs">
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Page</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Sprint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableReportRow key={r.jiraKey} row={r} />
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total === 0
            ? "0 reports"
            : `Showing ${offset + 1}–` +
              `${Math.min(offset + pageSize, total)} of ${total}`}
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

const TableReportRow: FC<{ row: ReportRow }> = ({ row }) => {
  const componentLabel = row.rendering?.name
    || row.rendering?.renderingId
    || (row.rendering?.instanceId
        ? row.rendering.instanceId.slice(0, 8)
        : "—");
  const reporterLabel = row.reporter?.name
    || row.reporter?.email
    || "—";
  return (
    <TableRow>
      <TableCell>
        <a href={row.jiraUrl} target="_blank"
           rel="noreferrer"
           className="text-primary underline font-medium">
          {row.jiraKey}
        </a>
      </TableCell>
      <TableCell className="whitespace-normal max-w-[28rem]">
        {row.summary}
      </TableCell>
      <TableCell>
        <Badge colorScheme="neutral">
          {row.issueType}
        </Badge>
      </TableCell>
      <TableCell>
        {row.page
          ? (
            <a href={row.page.url} target="_blank"
               rel="noreferrer"
               className="underline"
               title={row.page.url}>
              {row.page.title || row.page.url}
            </a>
          )
          : "—"}
      </TableCell>
      <TableCell title={row.datasourceId ?? undefined}>
        {componentLabel}
      </TableCell>
      <TableCell title={row.reporter?.email ?? undefined}>
        {reporterLabel}
      </TableCell>
      <TableCell>{formatDate(row.createdAt)}</TableCell>
      <TableCell>
        {row.sprintAssigned
          ? <Badge colorScheme="success">Sprint</Badge>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
    </TableRow>
  );
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}
