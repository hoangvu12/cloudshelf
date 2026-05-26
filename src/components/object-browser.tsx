import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderX, ServerCrash, UploadCloud } from "lucide-react";

import { AppStatusBar } from "@/components/app-shell";
import { BreadcrumbPath } from "@/components/breadcrumb-path";
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
import { UploadDropzone } from "@/components/upload-dropzone";
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
import { useSelectionStore } from "@/stores/selection";
import { usePreviewStore } from "@/stores/preview";
import { usePrefsStore } from "@/stores/prefs";
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
  /** Captured at the moment "Rename" is invoked so the dialog has a stable target. */
  const [renameTarget, setRenameTarget] = React.useState<S3Entry | null>(null);

  // Imperative handle into react-dropzone's file picker so the "Upload" button
  // and dropzone share one entry point.
  const openPickerRef = React.useRef<(() => void) | null>(null);

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

  const handleOpen = React.useCallback(
    async (entry: S3Entry) => {
      if (entry.type === "prefix") {
        navigateToPrefix(entry.prefix);
        return;
      }
      try {
        const { url } = await fetchDownloadUrl(connectionId, bucket, entry.key);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't open file");
      }
    },
    [navigateToPrefix, connectionId, bucket]
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

  const handleCopyLink = async (entry: S3Entry) => {
    if (entry.type !== "object") {
      toast.info("Folders don't have a shareable link");
      return;
    }
    try {
      const { url } = await fetchDownloadUrl(connectionId, bucket, entry.key);
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Expires in 15 minutes" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy link");
    }
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

  const handleUploadFiles = (files: File[]) => {
    const oversized = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized.length) {
      toast.error(
        `${oversized.length} file${oversized.length === 1 ? "" : "s"} exceed S3's 5 TB per-object limit`
      );
    }
    let accepted = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (accepted.length === 0) return;

    // Best-effort overwrite check against the currently-loaded listing.
    // Doesn't catch collisions in not-yet-fetched pages or other clients
    // creating keys concurrently, but covers the common case.
    if (usePrefsStore.getState().overwriteWarning) {
      const existingNames = new Set(
        entries
          .filter((e): e is S3ObjectEntry => e.type === "object")
          .map((e) => basename(e.key))
      );
      const colliders = accepted.filter((f) => existingNames.has(f.name));
      if (colliders.length > 0) {
        const sample = colliders
          .slice(0, 5)
          .map((f) => `  • ${f.name}`)
          .join("\n");
        const more =
          colliders.length > 5 ? `\n  …and ${colliders.length - 5} more` : "";
        const ok = window.confirm(
          `${colliders.length} file${colliders.length === 1 ? "" : "s"} already exist in this folder. Overwrite?\n\n${sample}${more}`
        );
        if (!ok) {
          accepted = accepted.filter((f) => !existingNames.has(f.name));
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
    handleCopyLink,
  });
  contextHandlersRef.current = {
    downloadEntry,
    handleDownloadSelected,
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
        case "open-new-tab":
          handleOpen(entry);
          return;
        case "copy-link":
          h.handleCopyLink(entry);
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
    [handleOpen, setManySelected, openPreview]
  );

  // ─── Toolbar action delegates ───────────────────────────────────────────
  const handleRenameFromToolbar = () => {
    if (selectedEntries.length !== 1) return;
    setRenameTarget(selectedEntries[0]!);
    setRenameOpen(true);
  };
  const handleCopyLinkFromToolbar = () => {
    if (selectedEntries.length !== 1) return;
    handleCopyLink(selectedEntries[0]!);
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

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <UploadDropzone
      prefix={prefix}
      onFiles={handleUploadFiles}
      openRef={openPickerRef}
    >
      <div className="border-ctp-surface0 bg-ctp-base flex h-12 shrink-0 items-center border-b px-4">
        <BreadcrumbPath
          bucket={bucket}
          prefix={prefix}
          onNavigate={navigateToPrefix}
        />
      </div>

      <ObjectToolbar
        selectedCount={selectedIds.size}
        totalCount={entries.length}
        totalBytes={totalBytes}
        filter={filter}
        onFilterChange={setFilter}
        onUpload={() => openPickerRef.current?.()}
        onNewFolder={() => setNewFolderOpen(true)}
        onClearSelection={() => {
          clearSelection();
          setAnchor(null);
        }}
        onPreview={handlePreviewFromToolbar}
        canPreview={canPreviewFromToolbar}
        onDownloadSelected={handleDownloadSelected}
        onCopyLink={handleCopyLinkFromToolbar}
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
                <span className="text-ctp-mauve">
                  {selectedIds.size} selected
                </span>
              )}
            </>
          ) : null
        }
        right={<span>⌘K to search · shift-click for range · drag to upload</span>}
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
            className="bg-ctp-surface0/40 h-9 animate-pulse rounded"
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
