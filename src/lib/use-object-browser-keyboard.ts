import * as React from "react";

import { entryId } from "@/lib/object-path";
import { isEditableTarget } from "@/lib/editable-target";
import type { S3Entry, S3ObjectEntry } from "@server/types";

interface KeyboardArgs {
  // Refs the handler reads through (mutable snapshots — read on each keystroke).
  previewOpenKey: string | null;
  selectedEntries: S3Entry[];
  selectedIdsRef: React.RefObject<ReadonlySet<string>>;
  visibleRef: React.RefObject<S3Entry[]>;
  pendingIdsRef: React.RefObject<ReadonlySet<string>>;
  anchorRef: React.RefObject<string | null>;
  openPickerRef: React.RefObject<(() => void) | null>;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
  // Action callbacks.
  setAnchor: (id: string | null) => void;
  setNewFolderOpen: (open: boolean) => void;
  setDeleteOpen: (open: boolean) => void;
  setRenameOpen: (open: boolean) => void;
  setRenameTarget: (entry: S3Entry) => void;
  handleSelectAll: (entries: S3Entry[]) => void;
  handleCopyLink: (entry: S3Entry) => void;
  clearSelection: () => void;
  closePreview: () => void;
  openPreview: (key: string, siblings: string[]) => void;
  setManySelected: (ids: string[]) => void;
}

/**
 * Window-level keydown router for the object browser. Bound once at mount;
 * all per-render values are routed through a single ref so the effect's
 * listener doesn't re-attach for every selection change.
 */
export function useObjectBrowserKeyboard(args: KeyboardArgs) {
  const ref = React.useRef(args);
  ref.current = args;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inEditable = isEditableTarget(e.target);
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;
      const klow = key.toLowerCase();
      const s = ref.current;

      // ⌘U — upload. Works from anywhere (the picker is benign even mid-typing).
      if (mod && !e.shiftKey && !e.altKey && klow === "u") {
        e.preventDefault();
        s.openPickerRef.current?.();
        return;
      }

      // ⌘⇧N — new folder.
      if (mod && e.shiftKey && !e.altKey && klow === "n") {
        e.preventDefault();
        s.setNewFolderOpen(true);
        return;
      }

      // ⌘A — select all visible. Skip inside text inputs so native select-all
      // still works while the user is editing.
      if (mod && !e.shiftKey && !e.altKey && klow === "a") {
        if (inEditable) return;
        e.preventDefault();
        s.handleSelectAll(s.visibleRef.current!);
        return;
      }

      // ⌘C — copy public link for the single selected file. Yield to the
      // browser if the user has a text selection or is in a text input —
      // otherwise we'd hijack copy-text.
      if (mod && !e.shiftKey && !e.altKey && klow === "c") {
        if (inEditable) return;
        const textSel = window.getSelection?.();
        if (textSel && textSel.toString().length > 0) return;
        const only =
          s.selectedEntries.length === 1 ? s.selectedEntries[0] : null;
        if (!only || only.type !== "object") return;
        e.preventDefault();
        s.handleCopyLink(only);
        return;
      }

      // All remaining shortcuts: non-modifier and outside of editables.
      if (mod || e.altKey) return;
      if (inEditable) return;

      // Esc — clear selection. Preview's own keydown owns Esc when open;
      // bail so we don't also wipe the selection behind it.
      if (key === "Escape") {
        if (s.previewOpenKey !== null) return;
        if (s.selectedIdsRef.current!.size === 0) return;
        e.preventDefault();
        s.clearSelection();
        s.setAnchor(null);
        return;
      }

      // Del / Backspace — open the delete confirmation.
      if (key === "Delete" || key === "Backspace") {
        if (s.selectedIdsRef.current!.size === 0) return;
        e.preventDefault();
        s.setDeleteOpen(true);
        return;
      }

      // F2 — rename when exactly one item is selected.
      if (key === "F2") {
        if (s.selectedEntries.length !== 1) return;
        e.preventDefault();
        s.setRenameTarget(s.selectedEntries[0]!);
        s.setRenameOpen(true);
        return;
      }

      // Space — toggle preview. Opens for the single selected file, closes
      // whatever's currently open.
      if (key === " ") {
        if (s.previewOpenKey !== null) {
          e.preventDefault();
          s.closePreview();
          return;
        }
        const only =
          s.selectedEntries.length === 1 ? s.selectedEntries[0] : null;
        if (!only || only.type !== "object") return;
        e.preventDefault();
        const siblings = s.visibleRef.current!
          .filter((x): x is S3ObjectEntry => x.type === "object")
          .map((x) => x.key);
        s.openPreview(only.key, siblings);
        return;
      }

      // / — focus the filter input. Skipped when the toolbar swapped it out
      // for selection-mode UI (input isn't mounted, ref is null).
      if (key === "/") {
        const input = s.filterInputRef.current;
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }

      // J/K + arrows — move the "cursor" by replacing selection with the
      // adjacent visible entry. Preview owns these keys when it's open so it
      // can step through siblings instead.
      if (s.previewOpenKey !== null) return;
      const goDown = key === "ArrowDown" || klow === "j";
      const goUp = key === "ArrowUp" || klow === "k";
      if (!goDown && !goUp) return;

      const vis = s.visibleRef.current!;
      if (vis.length === 0) return;
      // Arrow nav skips pending rows — landing on a non-selectable row
      // would put the anchor somewhere selection can't act on.
      const pending = s.pendingIdsRef.current!;
      const selectableVis =
        pending.size === 0
          ? vis
          : vis.filter((entry) => !pending.has(entryId(entry)));
      if (selectableVis.length === 0) return;
      e.preventDefault();

      const ids = selectableVis.map(entryId);
      const cursor = s.anchorRef.current;
      const cursorIdx = cursor ? ids.indexOf(cursor) : -1;
      const nextIdx =
        cursorIdx === -1
          ? goDown
            ? 0
            : ids.length - 1
          : goDown
            ? Math.min(cursorIdx + 1, ids.length - 1)
            : Math.max(cursorIdx - 1, 0);
      const nextId = ids[nextIdx]!;
      s.setManySelected([nextId]);
      s.setAnchor(nextId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
