import * as React from "react";

import { cn } from "@/lib/utils";
import { formatBytes, formatFileTime } from "@/lib/format";
import { fileAppearance } from "@/lib/file-types";
import { folderIconFor } from "@/lib/folder-icons";
import { entryDisplayName, entryId } from "@/lib/object-path";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsSelected } from "@/stores/selection";
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
 */
function ObjectRowImpl({
  entry,
  currentPrefix,
  compact = false,
  onSelectRow,
  onOpen,
}: {
  entry: S3Entry;
  currentPrefix: string;
  compact?: boolean;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onOpen: (entry: S3Entry) => void;
}) {
  const id = entryId(entry);
  const selected = useIsSelected(id);

  const isFolder = entry.type === "prefix";
  const display = entryDisplayName(entry, currentPrefix);
  // Folder icons come from Material Icon Theme — colored per folder type, so
  // no Tailwind color class is applied. File icons keep their per-extension
  // accent color from fileAppearance().
  const { Icon: FileIcon, color: fileColor, label: fileLabel } = isFolder
    ? { Icon: folderIconFor(display.replace(/\/$/, "")), color: "", label: "Folder" }
    : fileAppearance(display);

  const handleRowClick = (e: React.MouseEvent) => {
    const mods = { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
    // No modifiers → folders navigate, files open the preview drawer. Any
    // modifier (shift / cmd / ctrl) routes through selection so the range
    // and additive-toggle keystrokes still work on both kinds of entry.
    if (!mods.shift && !mods.meta) {
      onOpen(entry);
      return;
    }
    onSelectRow(entry, mods);
  };

  return (
    <div
      onClick={handleRowClick}
      className={cn(
        "group flex cursor-pointer items-center rounded px-2 select-none",
        compact ? "h-7" : "h-9",
        selected ? "bg-muted" : "hover:bg-muted/60"
      )}
    >
      <div
        className="flex w-8 shrink-0 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() =>
            // Checkbox always behaves as an additive toggle (Cmd-click).
            onSelectRow(entry, { shift: false, meta: true })
          }
          aria-label={`Select ${display}`}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <FileIcon className={cn("size-5 shrink-0", fileColor)} />
        <span
          className={cn(
            "text-foreground truncate text-sm",
            selected && "font-medium"
          )}
        >
          {display}
        </span>
      </div>

      <Cell className="w-20 shrink-0 text-right whitespace-nowrap sm:w-24">
        <span className={selected ? "text-primary-text" : undefined}>
          {isFolder ? "--" : formatBytes(entry.size)}
        </span>
      </Cell>
      <Cell className="hidden w-28 shrink-0 pl-4 text-left whitespace-nowrap sm:block">
        {fileLabel}
      </Cell>
      <Cell className="hidden w-32 shrink-0 text-right whitespace-nowrap sm:block">
        {isFolder ? "--" : formatFileTime(entry.lastModified)}
      </Cell>
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
