import React from "react";
import { AlertCircle } from "lucide-react";
import { adminApiErrorMessage } from "@brands/lib/adminApi";

type AdminQueryStateProps = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage?: string;
  loadingFallback: React.ReactNode;
  children: React.ReactNode;
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
}: AdminQueryStateProps) {
  if (isLoading) return <>{loadingFallback}</>;

  if (isError) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        role="alert"
        data-testid="admin-query-error"
      >
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Failed to load data</p>
          <p className="text-xs mt-0.5 opacity-90">{adminApiErrorMessage(error)}</p>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <p className="text-center py-12 text-sm text-muted-foreground" data-testid="admin-query-empty">
        {emptyMessage}
      </p>
    );
  }

  return <>{children}</>;
}
