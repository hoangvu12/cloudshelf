import * as React from "react";

import { RotateCw, X } from "@/lib/icons";
import { useUploadsStore, type PendingInfo } from "@/stores/uploads";

/** Retry + dismiss buttons that replace the size/type/modified cells when
 *  a row is in failed state. Positioned on the right edge so the columns
 *  the user is used to (size, type, modified) collapse cleanly. */
export function FailedActions({
  pending,
}: {
  pending: PendingInfo;
}) {
  const actions = useUploadsStore((s) => s.actions);
  const uploadIds =
    pending.kind === "file"
      ? [pending.uploadId]
      : // For aggregated folder rows we retry/dismiss every failed child.
        // Folder kind doesn't expose ids (out of scope for v1 — we don't
        // ship per-folder retry yet), so this branch only triggers from
        // the per-file kind in practice.
        [];

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    for (const id of uploadIds) actions.retry(id);
  };
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    for (const id of uploadIds) actions.cancel(id);
  };

  if (uploadIds.length === 0) {
    return (
      <div className="text-destructive flex shrink-0 items-center pr-2 font-mono text-[10px] uppercase">
        Failed
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1 pr-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleRetry}
        title="Retry upload"
        className="hover:bg-muted text-muted-foreground hover:text-foreground rounded p-1 focus:outline-none"
      >
        <RotateCw className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        title="Dismiss"
        className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded p-1 focus:outline-none"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
