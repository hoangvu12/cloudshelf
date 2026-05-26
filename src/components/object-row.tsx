import * as React from "react";
import { Folder } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatBytes, formatFileTime } from "@/lib/format";
import { fileAppearance } from "@/lib/file-types";
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
 *   - Plain click on file → additive toggle (same as the checkbox); the
 *     existing selection is preserved, not replaced
 *   - Cmd/Ctrl + click → same as plain click (additive toggle)
 *   - Shift + click → extend selection from anchor to here (replacing the range)
 *   - Checkbox click → additive toggle
 *
 * To open a file, use the right-click menu (Open in new tab / Download).
 */
function ObjectRowImpl({
  entry,
  currentPrefix,
  onSelectRow,
  onOpen,
}: {
  entry: S3Entry;
  currentPrefix: string;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onOpen: (entry: S3Entry) => void;
}) {
  const id = entryId(entry);
  const selected = useIsSelected(id);

  const isFolder = entry.type === "prefix";
  const display = entryDisplayName(entry, currentPrefix);
  const { Icon: FileIcon, color: fileColor, label: fileLabel } = isFolder
    ? { Icon: Folder, color: "text-ctp-blue", label: "Folder" }
    : fileAppearance(display);

  const handleRowClick = (e: React.MouseEvent) => {
    const mods = { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
    // A folder with no modifiers navigates; anything else (folder or file)
    // routes through selection so range / additive selection still works.
    if (isFolder && !mods.shift && !mods.meta) {
      onOpen(entry);
      return;
    }
    onSelectRow(entry, mods);
  };

  return (
    <div
      onClick={handleRowClick}
      className={cn(
        "group flex h-9 cursor-pointer items-center rounded px-2 select-none",
        selected ? "bg-ctp-surface0" : "hover:bg-ctp-surface0/60"
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
        <FileIcon
          className={cn(
            "size-5 shrink-0",
            fileColor,
            isFolder && "fill-ctp-blue/30"
          )}
        />
        <span
          className={cn(
            "text-ctp-text truncate text-sm",
            selected && "font-medium"
          )}
        >
          {display}
        </span>
      </div>

      <Cell className="w-24 text-right">
        <span className={selected ? "text-ctp-mauve" : undefined}>
          {isFolder ? "--" : formatBytes(entry.size)}
        </span>
      </Cell>
      <Cell className="w-28 pl-4 text-left">{fileLabel}</Cell>
      <Cell className="w-32 text-right">
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
    <div className={cn("text-ctp-subtext font-mono text-xs", className)}>
      {children}
    </div>
  );
}
