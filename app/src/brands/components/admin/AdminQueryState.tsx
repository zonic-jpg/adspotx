import React from "react";
import { AlertCircle } from "lucide-react";
import { TableCell, TableRow } from "@brands/components/ui/table";
import { publicError } from "../../../lib/publicMessage";

type AdminQueryStateProps = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage?: string;
  loadingFallback: React.ReactNode;
  children: React.ReactNode;
  /**
   * Number of columns to span. Most callers render inside a `<tbody>`, where a
   * bare `<div>` is invalid markup that browsers hoist out of the table —
   * which is why error and empty states used to appear above the header.
   */
  colSpan?: number;
  /** Set for callers that are not inside a table. */
  asTableRow?: boolean;
};

/** Surfaces API failures instead of silent empty tables. */
export function AdminQueryState({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyMessage = "No records found.",
  loadingFallback,
  children,
  colSpan = 5,
  asTableRow = true,
}: AdminQueryStateProps) {
  if (isLoading) return <>{loadingFallback}</>;

  const wrap = (node: React.ReactNode) =>
    asTableRow ? (
      <TableRow>
        <TableCell colSpan={colSpan} className="p-0">
          {node}
        </TableCell>
      </TableRow>
    ) : (
      <>{node}</>
    );

  if (isError) {
    return wrap(
      <div
        className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        role="alert"
        data-testid="admin-query-error"
      >
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Failed to load data</p>
          <p className="text-xs mt-0.5 opacity-90">
            {publicError(error, "Please try again in a moment.")}
          </p>
        </div>
      </div>,
    );
  }

  if (isEmpty) {
    return wrap(
      <p className="text-center py-12 text-sm text-muted-foreground" data-testid="admin-query-empty">
        {emptyMessage}
      </p>,
    );
  }

  return <>{children}</>;
}
