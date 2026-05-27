import * as React from "react";

import { cn } from "@/lib/utils";
import { fileAppearance } from "@/lib/file-types";
import { folderIconFor } from "@/lib/folder-icons";
import { entryDisplayName, entryId } from "@/lib/object-path";
import { Checkbox } from "@/components/ui/checkbox";
import { Cell } from "@/components/object-row-cells/cell";
import { PendingBadge } from "@/components/object-row-cells/pending-badge";
import { SizeContent } from "@/components/object-row-cells/size-content";
import { ModifiedContent } from "@/components/object-row-cells/modified-content";
import { FailedActions } from "@/components/object-row-cells/failed-actions";
import { useHasSelection, useIsSelected } from "@/stores/selection";
import { usePendingByEntryId } from "@/stores/uploads";
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
  const hasSelection = useHasSelection();
  // `enabled = isPending` makes the selector a no-op for non-pending rows,
  // so progress ticks don't ripple through every visible row.
  const pendingDisplay = usePendingByEntryId(connectionId, bucket, id, isPending);

  const isFolder = entry.type === "prefix";
  const display = entryDisplayName(entry, currentPrefix);
  const { Icon: FileIcon, color: fileColor, label: fileLabel } = isFolder
    ? { Icon: folderIconFor(display.replace(/\/$/, "")), color: "", label: "Folder" }
    : fileAppearance(display);

  const handleRowClick = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    // Pending rows are non-interactive — the file doesn't exist on S3 yet
    // (or its current bytes are about to be replaced), so opening or
    // selecting it would be confusing.
    if (pendingDisplay) return;
    const mods = { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
    if (!mods.shift && !mods.meta) {
      // In selection mode (at least one row selected), plain click toggles
      // instead of activating — matches Finder/Files behavior.
      if (hasSelection) {
        onSelectRow(entry, { shift: false, meta: true });
        return;
      }
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
      role="button"
      tabIndex={pendingDisplay ? -1 : 0}
      aria-label={display}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowClick(e);
        }
      }}
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
