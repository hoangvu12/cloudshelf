import * as React from "react";

import type { ContextAction } from "@/components/object-list";
import type { RowClickModifiers } from "@/components/object-row";
import { entryId } from "@/lib/object-path";
import type { S3Entry, S3ObjectEntry } from "@server/types";

/**
 * Owns the modifier-aware row click handler, "select all visible", and the
 * context-menu dispatcher. All handlers are stable across renders (refs mirror
 * the volatile inputs) so memoized rows in ObjectList/ObjectGrid actually bail
 * out when an unrelated row changes.
 */
export function useObjectBrowserSelection(args: {
  selectedIdsRef: React.RefObject<ReadonlySet<string>>;
  visibleRef: React.RefObject<S3Entry[]>;
  pendingIdsRef: React.RefObject<ReadonlySet<string>>;
  anchorRef: React.RefObject<string | null>;
  setAnchor: (id: string | null) => void;
  toggleSelection: (id: string) => void;
  setManySelected: (ids: string[]) => void;
  clearSelection: () => void;
  openPreview: (key: string, siblings: string[]) => void;
  openShare: (key: string) => void;
  // Per-entry actions from useObjectBrowserDownloads. Routed through a ref so
  // their identities don't force the context dispatcher to re-create.
  downloadEntry: (entry: S3Entry) => void;
  handleDownloadSelected: () => void;
  handleDownloadAsZip: (entry: S3Entry) => void;
  handleCopyLink: (entry: S3Entry) => void;
  handleOpenInNewTab: (entry: S3Entry) => void;
  setRenameTarget: (entry: S3Entry) => void;
  setRenameOpen: (open: boolean) => void;
  setMoveOpen: (open: boolean) => void;
  setCopyToOpen: (open: boolean) => void;
  setDeleteOpen: (open: boolean) => void;
}) {
  const {
    selectedIdsRef,
    visibleRef,
    pendingIdsRef,
    anchorRef,
    setAnchor,
    toggleSelection,
    setManySelected,
    clearSelection,
    openPreview,
    openShare,
    setRenameTarget,
    setRenameOpen,
    setMoveOpen,
    setCopyToOpen,
    setDeleteOpen,
  } = args;

  // Action handlers are read via ref so their identities don't churn the
  // context-menu dispatcher (which is memoized for ObjectList's bail-out).
  const actionsRef = React.useRef({
    downloadEntry: args.downloadEntry,
    handleDownloadSelected: args.handleDownloadSelected,
    handleDownloadAsZip: args.handleDownloadAsZip,
    handleCopyLink: args.handleCopyLink,
    handleOpenInNewTab: args.handleOpenInNewTab,
  });
  actionsRef.current = {
    downloadEntry: args.downloadEntry,
    handleDownloadSelected: args.handleDownloadSelected,
    handleDownloadAsZip: args.handleDownloadAsZip,
    handleCopyLink: args.handleCopyLink,
    handleOpenInNewTab: args.handleOpenInNewTab,
  };

  const handleSelectRow = React.useCallback(
    (entry: S3Entry, mods: RowClickModifiers) => {
      const id = entryId(entry);
      const currentAnchor = anchorRef.current;

      if (mods.shift && currentAnchor) {
        // Range select against the *visible* order. If the anchor scrolled out
        // of the current filter, fall back to single-select so we don't silently
        // select nothing.
        const ids = visibleRef.current!.map(entryId);
        const a = ids.indexOf(currentAnchor);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a];
          // Drop pending rows that fall inside the range — they're not
          // selectable (no real S3 entry yet).
          const pending = pendingIdsRef.current!;
          const sliced = ids.slice(from, to + 1);
          setManySelected(
            pending.size === 0
              ? sliced
              : sliced.filter((sid) => !pending.has(sid))
          );
          // Anchor intentionally stays — next shift-click re-extends from it.
          return;
        }
      }

      // Plain click and Cmd/Ctrl-click both additively toggle, matching how
      // the checkbox behaves. Range select still requires shift.
      toggleSelection(id);
      setAnchor(id);
    },
    [
      anchorRef,
      visibleRef,
      pendingIdsRef,
      setAnchor,
      toggleSelection,
      setManySelected,
    ]
  );

  const handleSelectAll = React.useCallback(
    (vis: S3Entry[]) => {
      const sel = selectedIdsRef.current!;
      const pending = pendingIdsRef.current!;
      // Pending rows aren't selectable; "select all" means all real entries.
      const ids: string[] = [];
      for (const entry of vis) {
        const id = entryId(entry);
        if (pending.size === 0 || !pending.has(id)) ids.push(id);
      }
      const allSelected = ids.length > 0 && ids.every((id) => sel.has(id));
      if (allSelected) {
        clearSelection();
        setAnchor(null);
      } else {
        setManySelected(ids);
        setAnchor(ids[0] ?? null);
      }
    },
    [
      selectedIdsRef,
      pendingIdsRef,
      setAnchor,
      clearSelection,
      setManySelected,
    ]
  );

  const handleContextAction = React.useCallback(
    (entry: S3Entry, action: ContextAction) => {
      const id = entryId(entry);
      const sel = selectedIdsRef.current!;
      const h = actionsRef.current;
      const ensureInSelection = () => {
        if (!sel.has(id)) {
          setManySelected([id]);
          setAnchor(id);
        }
      };

      switch (action) {
        case "preview": {
          if (entry.type !== "object") return;
          // Siblings = visible files (folders aren't previewable). Captured at
          // open time so prev/next walks the user's current sort/filter view.
          const siblings = visibleRef.current!
            .filter((e): e is S3ObjectEntry => e.type === "object")
            .map((e) => e.key);
          openPreview(entry.key, siblings);
          return;
        }
        case "download":
          if (sel.size > 1 && sel.has(id)) h.handleDownloadSelected();
          else h.downloadEntry(entry);
          return;
        case "download-zip":
          h.handleDownloadAsZip(entry);
          return;
        case "open-new-tab":
          h.handleOpenInNewTab(entry);
          return;
        case "copy-link":
          h.handleCopyLink(entry);
          return;
        case "share":
          if (entry.type === "object") openShare(entry.key);
          return;
        case "rename":
          setRenameTarget(entry);
          setRenameOpen(true);
          return;
        case "move":
          ensureInSelection();
          setMoveOpen(true);
          return;
        case "copy-to":
          ensureInSelection();
          setCopyToOpen(true);
          return;
        case "delete":
          ensureInSelection();
          setDeleteOpen(true);
          return;
      }
    },
    [
      selectedIdsRef,
      visibleRef,
      setAnchor,
      setManySelected,
      openPreview,
      openShare,
      setRenameTarget,
      setRenameOpen,
      setMoveOpen,
      setCopyToOpen,
      setDeleteOpen,
    ]
  );

  return { handleSelectRow, handleSelectAll, handleContextAction };
}
