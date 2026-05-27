import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderX, ServerCrash, Settings, UploadCloud } from "@/lib/icons";

import { AppStatusBar } from "@/components/app-shell";
import { BreadcrumbPath } from "@/components/breadcrumb-path";
import { BucketSettingsDialog } from "@/components/bucket-dialogs";
import { EmptyState } from "@/components/empty-state";
import {
  ConfirmDeleteDialog,
  MovePromptDialog,
  NewFolderDialog,
  RenameDialog,
} from "@/components/object-dialogs";
import {
  ObjectList,
  type ContextAction,
} from "@/components/object-list";
import { ObjectGrid } from "@/components/object-grid";
import type { RowClickModifiers } from "@/components/object-row";
import { ObjectToolbar } from "@/components/object-toolbar";
import { UploadDropzone, type UploadInputFile } from "@/components/upload-dropzone";
import { formatBytes, formatCount } from "@/lib/format";
import {
  basename,
  dirname,
  entryId,
  normalizePrefix,
  trimTrailingSlash,
} from "@/lib/object-path";
import {
  sortAndFilterEntries,
  type ObjectSortKey,
  type SortDirection,
} from "@/lib/object-sort";
import {
  fetchDownloadUrl,
  objectKeys,
  useCopyObject,
  useCreateFolder,
  useDeleteObjects,
  useObjects,
} from "@/lib/api/objects";
import { isEditableTarget } from "@/lib/shortcuts";
import {
  downloadEntriesAsZip,
  gatherZipEntries,
  HARD_CAP_BYTES,
  SOFT_WARN_BYTES,
  totalZipBytes,
} from "@/lib/zip-download";
import { useSelectionStore } from "@/stores/selection";
import { usePreviewStore } from "@/stores/preview";
import { usePrefsStore } from "@/stores/prefs";
import { useShareStore } from "@/stores/share";
import { onUploadCompleted, useUploadsStore } from "@/stores/uploads";
import type { S3Entry, S3ObjectEntry } from "@server/types";

/** S3's per-object size ceiling. The worker auto-splits anything over the
 *  multipart threshold so we don't need a separate single-PUT cap. */
const MAX_UPLOAD_BYTES = 5 * 1024 ** 4;

/**
 * The object browser screen: breadcrumb + morphing toolbar + virtualized list,
 * wrapped in a drop zone for uploads. Owns selection, sort, dialog state, the
 * shift-click anchor, and the upload flow. Routes mount this with
 * `{connectionId, bucket, prefix}` from the URL.
 *
 * Sort/filter live here (not in ObjectList) because the *visible order* is
 * the canonical sequence for shift-click range math — the list component is a
 * pure renderer.
 */
export function ObjectBrowser({
  connectionId,
  bucket,
  prefix,
}: {
  connectionId: string;
  bucket: string;
  prefix: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useObjects(connectionId, bucket, prefix);

  const selectedIds = useSelectionStore((s) => s.selected);
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const setManySelected = useSelectionStore((s) => s.setMany);
  const clearSelection = useSelectionStore((s) => s.clear);
  const openShare = useShareStore((s) => s.open);

  // Anchor for shift-click range selection — the last entry the user clicked
  // *without* shift. Reset whenever we navigate to a new prefix so a stale
  // anchor can't extend selection across folders. Mirrored into a ref so the
  // row-click handler can stay referentially stable (React.memo on ObjectRow
  // would otherwise be defeated by the callback identity changing each render).
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const anchorRef = React.useRef<string | null>(null);
  anchorRef.current = anchor;

  const closePreview = usePreviewStore((s) => s.close);
  const openPreview = usePreviewStore((s) => s.open);
  const previewOpenKey = usePreviewStore((s) => s.openKey);

  React.useEffect(() => {
    clearSelection();
    setAnchor(null);
    // Stale preview from a different folder would point at a key the new
    // listing doesn't contain — clearer to dismiss than to show a ghost panel.
    closePreview();
  }, [prefix, bucket, connectionId, clearSelection, closePreview]);

  const [sortKey, setSortKey] = React.useState<ObjectSortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDirection>("asc");
  const [filter, setFilter] = React.useState("");

  // Dialog visibility
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [copyToOpen, setCopyToOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [bucketSettingsOpen, setBucketSettingsOpen] = React.useState(false);
  /** Captured at the moment "Rename" is invoked so the dialog has a stable target. */
  const [renameTarget, setRenameTarget] = React.useState<S3Entry | null>(null);

  // Imperative handle into react-dropzone's file picker so the "Upload" button
  // and dropzone share one entry point.
  const openPickerRef = React.useRef<(() => void) | null>(null);
  // Sibling handle for the folder picker — `<input webkitdirectory>` can't
  // share the file input (the attribute forces directory-only selection),
  // so the dropzone exposes a separate trigger for the toolbar to call.
  const openFolderPickerRef = React.useRef<(() => void) | null>(null);

  // Filter input is rendered inside ObjectToolbar; we hold a ref here so the
  // "/" shortcut can focus it from the page level.
  const filterInputRef = React.useRef<HTMLInputElement>(null);

  // ─── Derived data ───────────────────────────────────────────────────────
  // Flatten infinite-query pages into one list. Pages are appended in order,
  // and S3 returns lexicographic key order, so the result is stable.
  const entries: S3Entry[] = React.useMemo(
    () => query.data?.pages.flatMap((p) => p.entries) ?? [],
    [query.data]
  );

  const visible = React.useMemo(
    () => sortAndFilterEntries(entries, prefix, filter, sortKey, sortDir),
    [entries, prefix, filter, sortKey, sortDir]
  );
  // Same trick as anchorRef: shift-click range math needs `visible` in the
  // current visible order, but the callback can't take it as a dep without
  // changing identity every render.
  const visibleRef = React.useRef<S3Entry[]>(visible);
  visibleRef.current = visible;

  const entryById = React.useMemo(() => {
    const m = new Map<string, S3Entry>();
    for (const e of entries) m.set(entryId(e), e);
    return m;
  }, [entries]);

  const selectedEntries = React.useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => entryById.get(id))
        .filter((e): e is S3Entry => !!e),
    [selectedIds, entryById]
  );

  // Refs mirroring values that handlers below need to read without making
  // them dependencies (which would defeat useCallback stability — and stable
  // identities are what let React.memo bail the cascade into ObjectList).
  const selectedIdsRef = React.useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const sortKeyRef = React.useRef(sortKey);
  sortKeyRef.current = sortKey;

  const totalBytes = entries.reduce(
    (sum, e) => sum + (e.type === "object" ? e.size : 0),
    0
  );

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createFolder = useCreateFolder(connectionId, bucket, {
    onSuccess: () => toast.success("Folder created"),
    onError: (e) => toast.error(e.message),
  });
  const deleteObjects = useDeleteObjects(connectionId, bucket);
  const copyObject = useCopyObject(connectionId, bucket);

  // ─── Navigation ─────────────────────────────────────────────────────────
  const navigateToPrefix = React.useCallback(
    (target: string) => {
      const splat = trimTrailingSlash(target);
      navigate({
        to: "/buckets/$bucketName/$",
        params: { bucketName: bucket, _splat: splat },
      });
    },
    [navigate, bucket]
  );

  // Plain click on a row goes through this. Folders navigate, files open the
  // preview drawer. The context menu's "Open in new tab" uses
  // handleOpenInNewTab instead so it can still bypass the drawer.
  const handleOpen = React.useCallback(
    (entry: S3Entry) => {
      if (entry.type === "prefix") {
        navigateToPrefix(entry.prefix);
        return;
      }
      const siblings = visibleRef.current
        .filter((e): e is S3ObjectEntry => e.type === "object")
        .map((e) => e.key);
      openPreview(entry.key, siblings);
    },
    [navigateToPrefix, openPreview]
  );

  const handleOpenInNewTab = React.useCallback(
    async (entry: S3Entry) => {
      if (entry.type !== "object") return;
      try {
        const { url } = await fetchDownloadUrl(connectionId, bucket, entry.key);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't open file");
      }
    },
    [connectionId, bucket]
  );

  // ─── Selection (modifier-aware) ─────────────────────────────────────────
  // Stable across renders so React.memo on ObjectRow can actually skip the
  // non-affected rows. Reads anchor + visible through refs (which mirror the
  // state) instead of taking them as deps.
  const handleSelectRow = React.useCallback(
    (entry: S3Entry, mods: RowClickModifiers) => {
      const id = entryId(entry);
      const currentAnchor = anchorRef.current;

      if (mods.shift && currentAnchor) {
        // Range select against the *visible* order. If the anchor scrolled out
        // of the current filter, fall back to single-select so we don't silently
        // select nothing.
        const ids = visibleRef.current.map(entryId);
        const a = ids.indexOf(currentAnchor);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a];
          setManySelected(ids.slice(from, to + 1));
          // Anchor intentionally stays — next shift-click re-extends from it.
          return;
        }
      }

      // Plain click and Cmd/Ctrl-click both additively toggle, matching how
      // the checkbox behaves. Range select still requires shift.
      toggleSelection(id);
      setAnchor(id);
    },
    [toggleSelection, setManySelected]
  );

  const handleSelectAll = React.useCallback(
    (vis: S3Entry[]) => {
      const sel = selectedIdsRef.current;
      const ids = vis.map(entryId);
      const allSelected = ids.every((id) => sel.has(id));
      if (allSelected) {
        clearSelection();
        setAnchor(null);
      } else {
        setManySelected(ids);
        setAnchor(ids[0] ?? null);
      }
    },
    [clearSelection, setManySelected]
  );

  // ─── Per-entry actions ──────────────────────────────────────────────────
  const downloadEntry = async (entry: S3Entry) => {
    if (entry.type !== "object") return;
    try {
      const { url } = await fetchDownloadUrl(connectionId, bucket, entry.key);
      const a = document.createElement("a");
      a.href = url;
      a.download = basename(entry.key);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const handleDownloadSelected = async () => {
    const files = selectedEntries.filter(
      (e): e is S3ObjectEntry => e.type === "object"
    );
    if (files.length === 0) {
      toast.info("No files in selection (folders aren't downloadable)");
      return;
    }
    for (const file of files) {
      await downloadEntry(file);
      // Brief stagger so browsers don't lump these into a popup-blocker prompt.
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  /**
   * Bundle the current selection (files + recursive folders) into a single
   * .zip in the browser. Server only sees presign + listing round-trips; the
   * S3 GETs go straight from S3 to the browser, then through client-zip.
   *
   * Soft-warns >2GB (Blob URL memory pressure varies), hard-refuses >10GB.
   * "Select a folder" picks recursion at the toolbar level — the listing
   * here happens after the user has clicked, so the toast doubles as
   * progress feedback for slow folder walks.
   */
  const handleDownloadAsZip = async (
    targetEntry?: S3Entry
  ): Promise<void> => {
    const targets: S3Entry[] = targetEntry
      ? selectedIdsRef.current.has(entryId(targetEntry))
        ? selectedEntries
        : [targetEntry]
      : selectedEntries;
    if (targets.length === 0) {
      toast.info("Nothing selected");
      return;
    }
    const toastId = toast.loading("Preparing ZIP…");
    try {
      const zipEntries = await gatherZipEntries(
        connectionId,
        bucket,
        targets,
        prefix
      );
      if (zipEntries.length === 0) {
        toast.info("Selection has no files", { id: toastId });
        return;
      }
      const bytes = totalZipBytes(zipEntries);
      if (bytes > HARD_CAP_BYTES) {
        toast.error(
          `Selection is ${formatBytes(bytes)} — too large for one ZIP. Use multiple downloads.`,
          { id: toastId }
        );
        return;
      }
      if (bytes > SOFT_WARN_BYTES) {
        // window.confirm so the user can't dismiss it accidentally — at this
        // size the zip buffers in memory and the browser will stutter.
        toast.dismiss(toastId);
        const ok = window.confirm(
          `This ZIP will be ~${formatBytes(bytes)} (${formatCount(zipEntries.length)} files). It buffers in memory before downloading. Continue?`
        );
        if (!ok) return;
      }
      toast.loading(
        `Bundling ${formatCount(zipEntries.length)} file${zipEntries.length === 1 ? "" : "s"} (${formatBytes(bytes)})…`,
        { id: toastId }
      );
      // Single-folder selection: name the zip after the folder. Otherwise
      // fall back to a bucket-stamped filename so the OS doesn't keep
      // suggesting "selection.zip" for every download.
      const filename = (() => {
        if (targets.length === 1 && targets[0]!.type === "prefix") {
          return `${basename(targets[0]!.prefix)}.zip`;
        }
        const date = new Date().toISOString().slice(0, 10);
        return `${bucket}-${date}.zip`;
      })();
      await downloadEntriesAsZip(connectionId, bucket, zipEntries, filename);
      toast.success("Download started", {
        id: toastId,
        description: filename,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZIP failed", {
        id: toastId,
      });
    }
  };

  /**
   * Returns true on success, false otherwise. Errors toast; success is silent
   * so callers can choose their own confirmation (inline button feedback vs.
   * a success toast for the context-menu/shortcut paths that have no button
   * to highlight).
   */
  const copyEntryLink = async (entry: S3Entry): Promise<boolean> => {
    if (entry.type !== "object") {
      toast.info("Folders don't have a shareable link");
      return false;
    }
    try {
      const { url } = await fetchDownloadUrl(connectionId, bucket, entry.key);
      await navigator.clipboard.writeText(url);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy link");
      return false;
    }
  };

  // Context-menu / ⌘C path — no on-screen button to flip into a "Copied"
  // state, so we surface success via toast instead.
  const handleCopyLink = async (entry: S3Entry) => {
    const ok = await copyEntryLink(entry);
    if (ok) toast.success("Link copied", { description: "Expires in 15 minutes" });
  };

  // ─── Upload flow ────────────────────────────────────────────────────────
  // The browser doesn't do the upload anymore — it enqueues into the global
  // upload store and the floating UploadPanel handles progress, retries,
  // cancellation. We only listen for completions targeting *our* current
  // prefix to invalidate the listing.
  const normalizedPrefix = normalizePrefix(prefix);

  React.useEffect(() => {
    return onUploadCompleted((item) => {
      if (
        item.connectionId === connectionId &&
        item.bucket === bucket &&
        item.prefix === normalizedPrefix
      ) {
        queryClient.invalidateQueries({
          queryKey: objectKeys.list(connectionId, bucket, prefix),
        });
      }
    });
  }, [connectionId, bucket, prefix, normalizedPrefix, queryClient]);

  const handleUploadFiles = (items: UploadInputFile[]) => {
    const oversized = items.filter((it) => it.file.size > MAX_UPLOAD_BYTES);
    if (oversized.length) {
      toast.error(
        `${oversized.length} file${oversized.length === 1 ? "" : "s"} exceed S3's 5 TB per-object limit`
      );
    }
    let accepted = items.filter((it) => it.file.size <= MAX_UPLOAD_BYTES);
    if (accepted.length === 0) return;

    // Best-effort overwrite check against the currently-loaded listing. Only
    // applies to *top-level* files — for folder uploads, subdirectory
    // collisions live under not-yet-loaded prefixes and we'd be asking about
    // files the user can't see. Folder-vs-folder merges are deferred to S3's
    // own "last write wins" semantics.
    if (usePrefsStore.getState().overwriteWarning) {
      const existingNames = new Set(
        entries
          .filter((e): e is S3ObjectEntry => e.type === "object")
          .map((e) => basename(e.key))
      );
      const topLevelColliders = accepted.filter(
        (it) =>
          !it.relativePath.includes("/") && existingNames.has(it.file.name)
      );
      if (topLevelColliders.length > 0) {
        const sample = topLevelColliders
          .slice(0, 5)
          .map((it) => `  • ${it.file.name}`)
          .join("\n");
        const more =
          topLevelColliders.length > 5
            ? `\n  …and ${topLevelColliders.length - 5} more`
            : "";
        const ok = window.confirm(
          `${topLevelColliders.length} file${topLevelColliders.length === 1 ? "" : "s"} already exist in this folder. Overwrite?\n\n${sample}${more}`
        );
        if (!ok) {
          const skip = new Set(topLevelColliders.map((it) => it.file.name));
          accepted = accepted.filter(
            (it) => it.relativePath.includes("/") || !skip.has(it.file.name)
          );
          if (accepted.length === 0) return;
        }
      }
    }

    useUploadsStore.getState().actions.addFiles(
      { connectionId, bucket, prefix: normalizedPrefix },
      accepted
    );
  };

  // ─── Dialog confirmation handlers ───────────────────────────────────────
  const handleConfirmNewFolder = (name: string) => {
    createFolder.mutate(
      { prefix: normalizePrefix(prefix) + name },
      { onSettled: () => setNewFolderOpen(false) }
    );
  };

  const handleConfirmRename = async (newName: string) => {
    if (!renameTarget || renameTarget.type !== "object") {
      toast.error("Folder rename isn't supported yet");
      setRenameOpen(false);
      return;
    }
    const sourceKey = renameTarget.key;
    const destKey = dirname(sourceKey) + newName;
    if (destKey === sourceKey) {
      setRenameOpen(false);
      return;
    }
    try {
      await copyObject.mutateAsync({ sourceKey, destKey });
      await deleteObjects.mutateAsync({ keys: [sourceKey] });
      toast.success("Renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setRenameOpen(false);
      clearSelection();
    }
  };

  const handleConfirmMove = async (destPrefix: string) => {
    const targets = selectedEntries.filter(
      (e): e is S3ObjectEntry => e.type === "object"
    );
    if (targets.length === 0) {
      toast.warning("Folder moves aren't supported yet");
      setMoveOpen(false);
      return;
    }
    const dest = normalizePrefix(destPrefix);
    let succeeded = 0;
    let failed = 0;
    for (const entry of targets) {
      try {
        await copyObject.mutateAsync({
          sourceKey: entry.key,
          destKey: dest + basename(entry.key),
        });
        await deleteObjects.mutateAsync({ keys: [entry.key] });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      toast.success(`Moved ${succeeded} file${succeeded === 1 ? "" : "s"}`);
    } else {
      toast.warning(`Moved ${succeeded}, ${failed} failed`);
    }
    setMoveOpen(false);
    clearSelection();
  };

  const handleConfirmCopyTo = async (destPrefix: string) => {
    const targets = selectedEntries.filter(
      (e): e is S3ObjectEntry => e.type === "object"
    );
    if (targets.length === 0) {
      toast.warning("Folder copy isn't supported yet");
      setCopyToOpen(false);
      return;
    }
    const dest = normalizePrefix(destPrefix);
    let succeeded = 0;
    let failed = 0;
    for (const entry of targets) {
      try {
        await copyObject.mutateAsync({
          sourceKey: entry.key,
          destKey: dest + basename(entry.key),
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      toast.success(`Copied ${succeeded} file${succeeded === 1 ? "" : "s"}`);
    } else {
      toast.warning(`Copied ${succeeded}, ${failed} failed`);
    }
    setCopyToOpen(false);
  };

  const handleConfirmDelete = () => {
    const keys = selectedEntries.map(entryId);
    deleteObjects.mutate(
      { keys },
      {
        onSuccess: (result) => {
          const errors = result.errors.length;
          if (errors > 0) {
            toast.warning(
              `Deleted ${result.deleted}, ${errors} failed`,
              { description: result.errors[0]?.message }
            );
          } else {
            toast.success(
              `Deleted ${result.deleted} item${result.deleted === 1 ? "" : "s"}`
            );
          }
          clearSelection();
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => setDeleteOpen(false),
      }
    );
  };

  // ─── Context-menu dispatch ──────────────────────────────────────────────
  // Stable so the memoized ObjectList doesn't re-render when this changes
  // identity. Routes through refs for the inner handlers (which are not
  // themselves memoized) so we don't have to thread useCallback through
  // every single per-entry action.
  const contextHandlersRef = React.useRef({
    downloadEntry,
    handleDownloadSelected,
    handleDownloadAsZip,
    handleCopyLink,
  });
  contextHandlersRef.current = {
    downloadEntry,
    handleDownloadSelected,
    handleDownloadAsZip,
    handleCopyLink,
  };

  const handleContextAction = React.useCallback(
    (entry: S3Entry, action: ContextAction) => {
      const id = entryId(entry);
      const sel = selectedIdsRef.current;
      const h = contextHandlersRef.current;
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
          const siblings = visibleRef.current
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
          handleOpenInNewTab(entry);
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
    [handleOpenInNewTab, setManySelected, openPreview, openShare]
  );

  // ─── Toolbar action delegates ───────────────────────────────────────────
  const handleRenameFromToolbar = () => {
    if (selectedEntries.length !== 1) return;
    setRenameTarget(selectedEntries[0]!);
    setRenameOpen(true);
  };
  const handleCopyLinkFromToolbar = async (): Promise<boolean> => {
    if (selectedEntries.length !== 1) return false;
    return copyEntryLink(selectedEntries[0]!);
  };
  const handleShareFromToolbar = () => {
    const only = selectedEntries.length === 1 ? selectedEntries[0]! : null;
    if (!only || only.type !== "object") return;
    openShare(only.key);
  };
  const handlePreviewFromToolbar = () => {
    const only = selectedEntries.length === 1 ? selectedEntries[0]! : null;
    if (!only || only.type !== "object") return;
    const siblings = visible
      .filter((e): e is S3ObjectEntry => e.type === "object")
      .map((e) => e.key);
    openPreview(only.key, siblings);
  };
  const canPreviewFromToolbar =
    selectedEntries.length === 1 && selectedEntries[0]!.type === "object";

  // ─── Sort ───────────────────────────────────────────────────────────────
  const handleSortChange = React.useCallback((key: ObjectSortKey) => {
    if (key === sortKeyRef.current) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, []);

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────
  // Bound once at mount and reads everything through a ref that's refreshed
  // each render — same pattern as contextHandlersRef. Avoids re-binding the
  // window listener for every selection change, which would be a ton of
  // attach/detach churn on large lists.
  const shortcutsRef = React.useRef({
    previewOpenKey,
    selectedEntries,
    handleCopyLink,
  });
  shortcutsRef.current = {
    previewOpenKey,
    selectedEntries,
    handleCopyLink,
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inEditable = isEditableTarget(e.target);
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;
      const klow = key.toLowerCase();
      const s = shortcutsRef.current;

      // ⌘U — upload. Works from anywhere (the picker is benign even mid-typing).
      if (mod && !e.shiftKey && !e.altKey && klow === "u") {
        e.preventDefault();
        openPickerRef.current?.();
        return;
      }

      // ⌘⇧N — new folder.
      if (mod && e.shiftKey && !e.altKey && klow === "n") {
        e.preventDefault();
        setNewFolderOpen(true);
        return;
      }

      // ⌘A — select all visible. Skip inside text inputs so native select-all
      // still works while the user is editing.
      if (mod && !e.shiftKey && !e.altKey && klow === "a") {
        if (inEditable) return;
        e.preventDefault();
        handleSelectAll(visibleRef.current);
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
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        clearSelection();
        setAnchor(null);
        return;
      }

      // Del / Backspace — open the delete confirmation.
      if (key === "Delete" || key === "Backspace") {
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        setDeleteOpen(true);
        return;
      }

      // F2 — rename when exactly one item is selected.
      if (key === "F2") {
        if (s.selectedEntries.length !== 1) return;
        e.preventDefault();
        setRenameTarget(s.selectedEntries[0]!);
        setRenameOpen(true);
        return;
      }

      // Space — toggle preview. Opens for the single selected file, closes
      // whatever's currently open.
      if (key === " ") {
        if (s.previewOpenKey !== null) {
          e.preventDefault();
          closePreview();
          return;
        }
        const only =
          s.selectedEntries.length === 1 ? s.selectedEntries[0] : null;
        if (!only || only.type !== "object") return;
        e.preventDefault();
        const siblings = visibleRef.current
          .filter((x): x is S3ObjectEntry => x.type === "object")
          .map((x) => x.key);
        openPreview(only.key, siblings);
        return;
      }

      // / — focus the filter input. Skipped when the toolbar swapped it out
      // for selection-mode UI (input isn't mounted, ref is null).
      if (key === "/") {
        const input = filterInputRef.current;
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

      const vis = visibleRef.current;
      if (vis.length === 0) return;
      e.preventDefault();

      const ids = vis.map(entryId);
      const cursor = anchorRef.current;
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
      setManySelected([nextId]);
      setAnchor(nextId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    clearSelection,
    closePreview,
    handleSelectAll,
    openPreview,
    setManySelected,
  ]);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <UploadDropzone
      prefix={prefix}
      onFiles={handleUploadFiles}
      openRef={openPickerRef}
      openFolderRef={openFolderPickerRef}
    >
      <div className="border-border bg-background flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
        <BreadcrumbPath
          bucket={bucket}
          prefix={prefix}
          onNavigatePrefix={navigateToPrefix}
          onNavigateHome={() => navigate({ to: "/" })}
        />
        <button
          type="button"
          onClick={() => setBucketSettingsOpen(true)}
          className="hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 rounded p-1.5 focus:outline-none"
          aria-label="Bucket settings"
          title="Bucket settings (versioning, …)"
        >
          <Settings className="size-4" />
        </button>
      </div>

      <ObjectToolbar
        selectedCount={selectedIds.size}
        totalCount={entries.length}
        totalBytes={totalBytes}
        filter={filter}
        onFilterChange={setFilter}
        filterInputRef={filterInputRef}
        onUpload={() => openPickerRef.current?.()}
        onUploadFolder={() => openFolderPickerRef.current?.()}
        onNewFolder={() => setNewFolderOpen(true)}
        onClearSelection={() => {
          clearSelection();
          setAnchor(null);
        }}
        onPreview={handlePreviewFromToolbar}
        canPreview={canPreviewFromToolbar}
        onDownloadSelected={handleDownloadSelected}
        onDownloadAsZip={() => handleDownloadAsZip()}
        onCopyLink={handleCopyLinkFromToolbar}
        onShare={handleShareFromToolbar}
        onMove={() => setMoveOpen(true)}
        onRename={handleRenameFromToolbar}
        onDelete={() => setDeleteOpen(true)}
      />

      <BrowserBody
        query={query}
        entries={entries}
        visible={visible}
        prefix={prefix}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        onSelectRow={handleSelectRow}
        onSelectAll={handleSelectAll}
        onOpen={handleOpen}
        onContextAction={handleContextAction}
        onUploadClick={() => openPickerRef.current?.()}
      />

      <AppStatusBar
        left={
          query.data ? (
            <>
              <span>
                {formatCount(entries.length)} items
                {filter && entries.length !== visible.length
                  ? ` (${visible.length} shown)`
                  : ""}
                {query.hasNextPage ? "+" : ""}
              </span>
              <span>{formatBytes(totalBytes)} total</span>
              {selectedIds.size > 0 && (
                <span className="text-primary-text">
                  {selectedIds.size} selected
                </span>
              )}
            </>
          ) : null
        }
        right={
          <>
            <span className="whitespace-nowrap">⌘K to search</span>
            <span className="hidden whitespace-nowrap md:inline">
              · shift-click for range · drag to upload
            </span>
          </>
        }
      />

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        basePrefix={prefix}
        pending={createFolder.isPending}
        onSubmit={handleConfirmNewFolder}
      />
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        initialName={renameTarget ? basename(entryId(renameTarget)) : ""}
        pending={copyObject.isPending || deleteObjects.isPending}
        onSubmit={handleConfirmRename}
      />
      <MovePromptDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        defaultPrefix={prefix}
        count={selectedIds.size}
        pending={copyObject.isPending || deleteObjects.isPending}
        onSubmit={handleConfirmMove}
        mode="move"
      />
      <MovePromptDialog
        open={copyToOpen}
        onOpenChange={setCopyToOpen}
        defaultPrefix={prefix}
        count={selectedIds.size}
        pending={copyObject.isPending}
        onSubmit={handleConfirmCopyTo}
        mode="copy"
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        count={selectedIds.size}
        pending={deleteObjects.isPending}
        onConfirm={handleConfirmDelete}
      />
      <BucketSettingsDialog
        open={bucketSettingsOpen}
        onOpenChange={setBucketSettingsOpen}
        connectionId={connectionId}
        bucket={bucket}
      />
    </UploadDropzone>
  );
}

function BrowserBody({
  query,
  entries,
  visible,
  prefix,
  sortKey,
  sortDir,
  onSortChange,
  onSelectRow,
  onSelectAll,
  onOpen,
  onContextAction,
  onUploadClick,
}: {
  query: ReturnType<typeof useObjects>;
  entries: S3Entry[];
  visible: S3Entry[];
  prefix: string;
  sortKey: ObjectSortKey;
  sortDir: SortDirection;
  onSortChange: (key: ObjectSortKey) => void;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onSelectAll: (entries: S3Entry[]) => void;
  onOpen: (entry: S3Entry) => void;
  onContextAction: (entry: S3Entry, action: ContextAction) => void;
  onUploadClick: () => void;
}) {
  // Initial-load skeleton (no pages fetched yet).
  if (query.isPending) {
    return (
      <div className="min-h-0 flex-1 space-y-1 p-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="bg-muted/40 h-9 animate-pulse rounded"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    );
  }

  if (query.error) {
    return (
      <EmptyState
        icon={<ServerCrash />}
        title="Couldn't load this folder"
        description={
          <span className="font-mono text-[11px]">
            {query.error instanceof Error
              ? query.error.message
              : "Unknown error"}
          </span>
        }
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<FolderX />}
        title={prefix ? "This folder is empty" : "This bucket is empty"}
        description="Drop files anywhere on this page or use the upload button."
        action={
          <button
            type="button"
            onClick={onUploadClick}
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-1.5 font-mono text-xs font-bold transition-opacity hover:opacity-90"
          >
            <UploadCloud className="size-4" />
            Upload files
          </button>
        }
      />
    );
  }

  return (
    <BodyRenderer
      visible={visible}
      currentPrefix={prefix}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={onSortChange}
      onSelectRow={onSelectRow}
      onSelectAll={onSelectAll}
      onOpen={onOpen}
      onContextAction={onContextAction}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      onLoadMore={query.fetchNextPage}
    />
  );
}

function BodyRenderer(props: {
  visible: S3Entry[];
  currentPrefix: string;
  sortKey: ObjectSortKey;
  sortDir: SortDirection;
  onSortChange: (key: ObjectSortKey) => void;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onSelectAll: (entries: S3Entry[]) => void;
  onOpen: (entry: S3Entry) => void;
  onContextAction: (entry: S3Entry, action: ContextAction) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const viewMode = usePrefsStore((s) => s.viewMode);
  if (viewMode === "grid") {
    return (
      <ObjectGrid
        visible={props.visible}
        currentPrefix={props.currentPrefix}
        onSelectRow={props.onSelectRow}
        onOpen={props.onOpen}
        onContextAction={props.onContextAction}
        hasNextPage={props.hasNextPage}
        isFetchingNextPage={props.isFetchingNextPage}
        onLoadMore={props.onLoadMore}
      />
    );
  }
  return <ObjectList {...props} />;
}
