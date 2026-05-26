import * as React from "react";
import {
  Copy,
  Download,
  ExternalLink,
  FolderOutput,
  Link as LinkIcon,
  PenLine,
  Trash2,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSelectionStore } from "@/stores/selection";
import type { ContextAction } from "@/components/object-list";
import type { S3Entry } from "@server/types";

/**
 * Right-click menu around a single object row. The wrapper renders no
 * selection-aware UI itself — count is read inside `MenuItems`, which only
 * mounts when the menu is actually open. That keeps the wrapper free of any
 * selection subscription so it doesn't re-render on every click, which was
 * the dominant cost across ~30 visible rows.
 */
export function ObjectContextMenu({
  entry,
  onAction,
  children,
}: {
  entry: S3Entry;
  /**
   * Receives `entry` so the parent's handler can stay stable (a per-row inline
   * `(a) => onAction(entry, a)` would allocate every render and burn the memo).
   */
  onAction: (entry: S3Entry, action: ContextAction) => void;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="font-mono text-xs">
        <MenuItems entry={entry} onAction={onAction} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Only rendered when the menu is open (Radix unmounts Content when closed).
 * Subscribing to selection here means only the *open* menu reads the store —
 * the 29 other closed wrappers in the list never trigger a re-render on
 * selection change.
 */
function MenuItems({
  entry,
  onAction,
}: {
  entry: S3Entry;
  onAction: (entry: S3Entry, action: ContextAction) => void;
}) {
  const selectedCount = useSelectionStore((s) => s.selected.size);
  const isFolder = entry.type === "prefix";
  const label =
    selectedCount > 1
      ? `${selectedCount} selected`
      : isFolder
        ? "Folder"
        : "File";

  return (
    <>
      <ContextMenuLabel className="text-[10px] tracking-wider uppercase">
        {label}
      </ContextMenuLabel>
      <ContextMenuItem
        disabled={isFolder}
        onSelect={() => onAction(entry, "download")}
      >
        <Download className="text-ctp-green" />
        Download
      </ContextMenuItem>
      <ContextMenuItem
        disabled={isFolder || selectedCount > 1}
        onSelect={() => onAction(entry, "open-new-tab")}
      >
        <ExternalLink />
        Open in new tab
      </ContextMenuItem>
      <ContextMenuItem
        disabled={isFolder || selectedCount > 1}
        onSelect={() => onAction(entry, "copy-link")}
      >
        <LinkIcon className="text-ctp-sapphire" />
        Copy link
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={selectedCount > 1}
        onSelect={() => onAction(entry, "rename")}
      >
        <PenLine />
        Rename
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction(entry, "move")}>
        <FolderOutput className="text-ctp-yellow" />
        Move
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction(entry, "copy-to")}>
        <Copy className="text-ctp-mauve" />
        Copy to...
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onSelect={() => onAction(entry, "delete")}
      >
        <Trash2 />
        Delete
      </ContextMenuItem>
    </>
  );
}
