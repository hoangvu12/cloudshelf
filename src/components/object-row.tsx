import * as React from "react";

import { Loader2, RotateCw, X, XCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatBytes, formatFileTime } from "@/lib/format";
import { fileAppearance } from "@/lib/file-types";
import { folderIconFor } from "@/lib/folder-icons";
import { entryDisplayName, entryId } from "@/lib/object-path";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsSelected } from "@/stores/selection";
import {
  usePendingByEntryId,
  useUploadsStore,
  type PendingInfo,
} from "@/stores/uploads";
import type { S3Entry } from "@server/types";

/**
 * Modifier flags the parent needs to disambiguate range-select from
 * toggle-select from replace-select. Captured from the click event.
 */
export interface RowClickModifiers {
  shift: boolean;
  /** True for Cmd on macOS / Ctrl elsewhere. */
  meta: boolean;
}

/**
 * One row in the object list. Subscribes to its own selection bit via
 * useIsSelected — passing the whole selectedIds Set down would force every
 * visible row to re-render on every selection change, which felt laggy on
 * large lists. With per-row subscription + React.memo, only the row whose
 * bit actually flipped re-renders.
 *
 * Interaction:
 *   - Plain click on folder → navigate into it
 *   - Plain click on file → open the preview drawer
 *   - Cmd/Ctrl + click → additive toggle (works on file or folder)
 *   - Shift + click → extend selection from anchor to here (replacing the range)
 *   - Checkbox click → additive toggle
 *
 * To download or open a file in a new tab, use the right-click menu.
 *
 * Pending uploads: when `isPending` is set, the row also subscribes to
 * `usePendingByEntryId` so progress/status decoration ticks on its own
 * timeline. The row becomes non-interactive — no select, no open — until
 * the upload completes (the post-upload listener invalidates the listing
 * and the synthetic row falls away).
 */
function ObjectRowImpl({
  entry,
  currentPrefix,
  connectionId,
  bucket,
  isPending = false,
  compact = false,
  onSelectRow,
  onOpen,
}: {
  entry: S3Entry;
  currentPrefix: string;
  connectionId: string;
  bucket: string;
  isPending?: boolean;
  compact?: boolean;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onOpen: (entry: S3Entry) => void;
}) {
  const id = entryId(entry);
  const selected = useIsSelected(id);
  // `enabled = isPending` makes the selector a no-op for non-pending rows,
  // so progress ticks don't ripple through every visible row.
  const pendingDisplay = usePendingByEntryId(connectionId, bucket, id, isPending);

  const isFolder = entry.type === "prefix";
  const display = entryDisplayName(entry, currentPrefix);
  const { Icon: FileIcon, color: fileColor, label: fileLabel } = isFolder
    ? { Icon: folderIconFor(display.replace(/\/$/, "")), color: "", label: "Folder" }
    : fileAppearance(display);

  const handleRowClick = (e: React.MouseEvent) => {
    // Pending rows are non-interactive — the file doesn't exist on S3 yet
    // (or its current bytes are about to be replaced), so opening or
    // selecting it would be confusing.
    if (pendingDisplay) return;
    const mods = { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
    if (!mods.shift && !mods.meta) {
      onOpen(entry);
      return;
    }
    onSelectRow(entry, mods);
  };

  const failed = pendingDisplay?.kind === "file"
    ? pendingDisplay.status === "failed"
    : pendingDisplay?.kind === "folder"
      ? pendingDisplay.anyFailed
      : false;

  return (
    <div
      onClick={handleRowClick}
      data-entry-id={id}
      data-pending={pendingDisplay ? "true" : undefined}
      className={cn(
        "group relative flex items-center rounded px-2 select-none",
        compact ? "h-7" : "h-9",
        pendingDisplay ? "cursor-default" : "cursor-pointer",
        selected ? "bg-muted" : !pendingDisplay && "hover:bg-muted/60",
        // Subtle washed-out treatment so users register "this row is busy"
        // without it looking broken — failed rows take a faint red tint.
        pendingDisplay && !failed && "opacity-75",
        failed && "bg-destructive/5"
      )}
    >
      <div
        className="flex w-8 shrink-0 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {pendingDisplay ? (
          <PendingBadge pending={pendingDisplay} />
        ) : (
          <Checkbox
            checked={selected}
            onCheckedChange={() =>
              onSelectRow(entry, { shift: false, meta: true })
            }
            aria-label={`Select ${display}`}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <FileIcon className={cn("size-5 shrink-0", fileColor)} />
        <span
          className={cn(
            "truncate text-sm",
            failed ? "text-destructive" : "text-foreground",
            selected && "font-medium"
          )}
          title={pendingDisplay?.kind === "file" ? pendingDisplay.lastError : undefined}
        >
          {display}
        </span>
      </div>

      {pendingDisplay && failed ? (
        // Size cell + (hidden-on-mobile) type/modified cells collapse into
        // a single right-aligned actions slot when failed.
        <FailedActions pending={pendingDisplay} />
      ) : (
        <>
          <Cell className="w-20 shrink-0 text-right whitespace-nowrap sm:w-24">
            <SizeContent entry={entry} pending={pendingDisplay} selected={selected} />
          </Cell>
          <Cell className="hidden w-28 shrink-0 pl-4 text-left whitespace-nowrap sm:block">
            {fileLabel}
          </Cell>
          <Cell className="hidden w-32 shrink-0 text-right whitespace-nowrap sm:block">
            <ModifiedContent entry={entry} hideForPending={!!pendingDisplay} />
          </Cell>
        </>
      )}

      {/* Bottom-edge progress strip — only for byte-tracked file uploads.
          Folder uploads don't get a strip because the aggregate progress
          across heterogeneous files is misleading; the spinner badge is
          the signal there. */}
      {pendingDisplay?.kind === "file" &&
        !pendingDisplay.indeterminate &&
        !failed && (
          <div className="bg-muted absolute right-2 bottom-0 left-2 h-0.5 overflow-hidden rounded-full">
            <div
              className="bg-primary-text h-full rounded-full transition-[width] duration-200 ease-linear"
              style={{
                width:
                  pendingDisplay.size > 0
                    ? `${Math.min(
                        100,
                        (pendingDisplay.bytesUploaded / pendingDisplay.size) *
                          100
                      )}%`
                    : "0%",
              }}
            />
          </div>
        )}
      {pendingDisplay?.kind === "file" && pendingDisplay.indeterminate && !failed && (
        <div className="bg-muted absolute right-2 bottom-0 left-2 h-0.5 overflow-hidden rounded-full">
          <div className="bg-primary-text h-full w-1/3 animate-pulse rounded-full" />
        </div>
      )}
    </div>
  );
}

export const ObjectRow = React.memo(ObjectRowImpl);

function Cell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("text-muted-foreground font-mono text-xs", className)}>
      {children}
    </div>
  );
}

/** Status glyph that replaces the checkbox while an upload is in flight.
 *  Uses currentColor so the wrapper's text-* class drives the hue. */
function PendingBadge({ pending }: { pending: PendingInfo }) {
  if (pending.kind === "file") {
    if (pending.status === "failed") {
      return <XCircle className="text-destructive size-4" />;
    }
    if (pending.status === "paused") {
      return <Loader2 className="text-accent-peach size-4" />;
    }
    return <Loader2 className="text-primary-text size-4 animate-spin" />;
  }
  if (pending.anyFailed) {
    return <XCircle className="text-destructive size-4" />;
  }
  return <Loader2 className="text-primary-text size-4 animate-spin" />;
}

function SizeContent({
  entry,
  pending,
  selected,
}: {
  entry: S3Entry;
  pending: PendingInfo | undefined;
  selected: boolean;
}) {
  if (pending?.kind === "file") return <PendingFileMeta pending={pending} />;
  if (pending?.kind === "folder")
    return <PendingFolderMeta pending={pending} />;
  if (entry.type === "prefix") {
    return <span className={selected ? "text-primary-text" : undefined}>--</span>;
  }
  return (
    <span className={selected ? "text-primary-text" : undefined}>
      {formatBytes(entry.size)}
    </span>
  );
}

function ModifiedContent({
  entry,
  hideForPending,
}: {
  entry: S3Entry;
  hideForPending: boolean;
}) {
  if (hideForPending || entry.type === "prefix") return <>--</>;
  return <>{formatFileTime(entry.lastModified)}</>;
}

function PendingFileMeta({
  pending,
}: {
  pending: Extract<PendingInfo, { kind: "file" }>;
}) {
  if (pending.status === "queued") {
    return <span className="text-muted-foreground text-[10px] uppercase">Queued</span>;
  }
  if (pending.status === "paused") {
    return <span className="text-accent-peach text-[10px] uppercase">Paused</span>;
  }
  if (pending.indeterminate) {
    return <span className="text-primary-text text-[10px] uppercase">Uploading</span>;
  }
  const pct =
    pending.size > 0 ? (pending.bytesUploaded / pending.size) * 100 : 0;
  return (
    <span className="text-primary-text">{Math.min(100, pct).toFixed(0)}%</span>
  );
}

function PendingFolderMeta({
  pending,
}: {
  pending: Extract<PendingInfo, { kind: "folder" }>;
}) {
  return (
    <span className="text-muted-foreground text-[10px] uppercase">
      {pending.fileCount} file{pending.fileCount === 1 ? "" : "s"}
    </span>
  );
}

/** Retry + dismiss buttons that replace the size/type/modified cells when
 *  a row is in failed state. Positioned on the right edge so the columns
 *  the user is used to (size, type, modified) collapse cleanly. */
function FailedActions({
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
