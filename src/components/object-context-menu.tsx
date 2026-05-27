import * as React from "react";
import {
  Copy,
  Download,
  Eye,
  ExternalLink,
  FolderOutput,
  Link as LinkIcon,
  PenLine,
  Share,
  Trash2,
} from "@/lib/icons";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSelectionStore } from "@/stores/selection";
import { entryId } from "@/lib/object-path";
import type { ContextAction } from "@/components/object-list";
import type { S3Entry } from "@server/types";

/**
 * One Radix ContextMenu for an entire list/grid, instead of one per row.
 *
 * Why: the previous design wrapped every visible row in its own ContextMenu
 * Root. With ~30 virtualized rows on screen, that's ~30 simultaneous Radix
 * Root instances, each running their own pointer / focus / collection
 * bookkeeping. Hovering inside the open menu visibly lagged because every
 * pointer move rippled through every instance.
 *
 * How: each row stamps `data-entry-id={entryId(entry)}` on its root. The
 * single onContextMenu handler walks up from `e.target` to find the row that
 * was right-clicked, records it as `activeEntry`, and lets Radix open at the
 * cursor. Right-clicking empty space (no row ancestor) preventDefaults the
 * event — Radix Slot's composeEventHandlers skips its own handler when the
 * child already preventDefaulted, so the menu stays closed.
 */
export function ObjectListContextMenu({
  visible,
  onAction,
  children,
}: {
  /** All entries currently rendered in the list/grid. Used to map a clicked
   *  row's data-entry-id back to its S3Entry. */
  visible: S3Entry[];
  onAction: (entry: S3Entry, action: ContextAction) => void;
  children: React.ReactNode;
}) {
  const [activeEntry, setActiveEntry] = React.useState<S3Entry | null>(null);
  // Read latest `visible` without re-binding the handler on every render —
  // the list updates often (sort, filter, scroll) and Radix's Slot composes
  // a fresh handler whenever this prop changes, churning the trigger.
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    const el = (e.target as Element | null)?.closest("[data-entry-id]");
    if (!el) {
      // Right-click on empty space / header / loader row — suppress both
      // our menu and the browser's native one for predictability.
      e.preventDefault();
      return;
    }
    const id = el.getAttribute("data-entry-id");
    const found = id
      ? visibleRef.current.find((v) => entryId(v) === id)
      : null;
    if (!found) {
      e.preventDefault();
      return;
    }
    setActiveEntry(found);
    // Don't preventDefault — let Radix's onContextMenu (composed by Slot)
    // run next and open the menu at the cursor.
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          // `display: contents` keeps the wrapper invisible to layout so the
          // children's flex/grid math is unchanged, but the div is still in
          // the DOM tree and receives the contextmenu event.
          style={{ display: "contents" }}
          onContextMenu={handleContextMenu}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="font-mono text-xs">
        {activeEntry ? (
          <MenuItems entry={activeEntry} onAction={onAction} />
        ) : null}
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
        disabled={isFolder || selectedCount > 1}
        onSelect={() => onAction(entry, "preview")}
      >
        <Eye />
        Preview
      </ContextMenuItem>
      <ContextMenuItem
        disabled={isFolder}
        onSelect={() => onAction(entry, "download")}
      >
        <Download />
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
        <LinkIcon />
        Copy link
      </ContextMenuItem>
      <ContextMenuItem
        disabled={isFolder || selectedCount > 1}
        onSelect={() => onAction(entry, "share")}
      >
        <Share />
        Share
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
        <FolderOutput />
        Move
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction(entry, "copy-to")}>
        <Copy />
        Copy to
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
