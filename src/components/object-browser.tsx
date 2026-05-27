import * as React from "react";
import { FolderX, ServerCrash, UploadCloud } from "@/lib/icons";

import { EmptyState } from "@/components/empty-state";
import {
  ObjectBrowserDialogs,
  ObjectBrowserHeader,
  ObjectBrowserStatusBar,
} from "@/components/object-browser-dialogs";
import {
  ObjectList,
  type ContextAction,
} from "@/components/object-list";
import { ObjectGrid } from "@/components/object-grid";
import type { RowClickModifiers } from "@/components/object-row";
import { ObjectToolbar } from "@/components/object-toolbar";
import { UploadDropzone } from "@/components/upload-dropzone";
import {
  type ObjectSortKey,
  type SortDirection,
} from "@/lib/object-sort";
import { useObjects } from "@/lib/api/objects";
import { useObjectBrowserActions } from "@/lib/use-object-browser-actions";
import { useObjectBrowserData } from "@/lib/use-object-browser-data";
import { useObjectBrowserDownloads } from "@/lib/use-object-browser-downloads";
import { useObjectBrowserKeyboard } from "@/lib/use-object-browser-keyboard";
import { useObjectBrowserMutations } from "@/lib/use-object-browser-mutations";
import { useObjectBrowserSelection } from "@/lib/use-object-browser-selection";
import { useObjectBrowserUploads } from "@/lib/use-object-browser-uploads";
import { useSelectionStore } from "@/stores/selection";
import { usePreviewStore } from "@/stores/preview";
import { usePrefsStore } from "@/stores/prefs";
import { useShareStore } from "@/stores/share";
import type { S3Entry } from "@server/types";

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
  const selectedIds = useSelectionStore((s) => s.selected);
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const setManySelected = useSelectionStore((s) => s.setMany);
  const clearSelection = useSelectionStore((s) => s.clear);
  const openShare = useShareStore((s) => s.open);

  // Anchor for shift-click range selection — the last entry the user clicked
  // *without* shift. Reset whenever we navigate to a new prefix so a stale
  // anchor can't extend selection across folders. Stored in a ref so the
  // row-click handler can stay referentially stable (React.memo on ObjectRow
  // would otherwise be defeated by the callback identity changing each render).
  const anchorRef = React.useRef<string | null>(null);
  const setAnchor = (id: string | null) => {
    anchorRef.current = id;
  };

  const closePreview = usePreviewStore((s) => s.close);
  const openPreview = usePreviewStore((s) => s.open);
  const previewOpenKey = usePreviewStore((s) => s.openKey);

  // Selection and preview live in Zustand stores outside React's tree, so the
  // parent route remounts this component via `key` on nav change to reset both.
  // The mount-time clear keeps a stale selection from carrying over.
  React.useEffect(() => {
    clearSelection();
    setAnchor(null);
    // Stale preview from a different folder would point at a key the new
    // listing doesn't contain — clearer to dismiss than to show a ghost panel.
    closePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [uploadFromUrlOpen, setUploadFromUrlOpen] = React.useState(false);
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
  const {
    query,
    entries,
    pendingIds,
    visible,
    selectedEntries,
    totalBytes,
  } = useObjectBrowserData({
    connectionId,
    bucket,
    prefix,
    selectedIds,
    sortKey,
    sortDir,
    filter,
  });

  // Refs mirroring values that handlers below need to read without making
  // them dependencies (which would defeat useCallback stability — and stable
  // identities are what let React.memo bail the cascade into ObjectList).
  // Same trick as anchorRef: shift-click range math needs `visible` in the
  // current visible order, but the callback can't take it as a dep without
  // changing identity every render.
  const visibleRef = React.useRef<S3Entry[]>(visible);
  visibleRef.current = visible;
  const selectedIdsRef = React.useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const sortKeyRef = React.useRef(sortKey);
  sortKeyRef.current = sortKey;
  // pending rows are non-selectable: ⌘A / shift-click range / arrow nav all
  // read this ref to skip over them.
  const pendingIdsRef = React.useRef(pendingIds);
  pendingIdsRef.current = pendingIds;

  // ─── Per-entry actions, upload flow ────────────────────────────────────
  const {
    downloadEntry,
    handleDownloadSelected,
    handleDownloadAsZip,
    copyEntryLink,
    handleCopyLink,
  } = useObjectBrowserDownloads({
    connectionId,
    bucket,
    prefix,
    selectedEntries,
    selectedIdsRef,
  });

  const { handleUploadFiles } = useObjectBrowserUploads({
    connectionId,
    bucket,
    prefix,
    entries,
  });

  // ─── Mutations + dialog confirmation handlers ──────────────────────────
  const {
    createFolderPending,
    copyObjectPending,
    deleteObjectsPending,
    handleConfirmNewFolder,
    handleConfirmRename,
    handleConfirmMove,
    handleConfirmCopyTo,
    handleConfirmDelete,
  } = useObjectBrowserMutations({
    connectionId,
    bucket,
    prefix,
    selectedEntries,
    renameTarget,
    setNewFolderOpen,
    setRenameOpen,
    setMoveOpen,
    setCopyToOpen,
    setDeleteOpen,
  });

  // ─── Navigation + sort + toolbar delegates ─────────────────────────────
  const {
    navigate,
    navigateToPrefix,
    handleOpen,
    handleOpenInNewTab,
    handleSortChange,
    handleRenameFromToolbar,
    handleCopyLinkFromToolbar,
    handleShareFromToolbar,
    handlePreviewFromToolbar,
    canPreviewFromToolbar,
  } = useObjectBrowserActions({
    connectionId,
    bucket,
    visible,
    visibleRef,
    selectedEntries,
    sortKeyRef,
    setSortKey,
    setSortDir,
    openPreview,
    openShare,
    copyEntryLink,
    setRenameTarget,
    setRenameOpen,
  });

  // ─── Selection + context-menu dispatch ──────────────────────────────────
  const { handleSelectRow, handleSelectAll, handleContextAction } =
    useObjectBrowserSelection({
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
      downloadEntry,
      handleDownloadSelected,
      handleDownloadAsZip,
      handleCopyLink,
      handleOpenInNewTab,
      setRenameTarget,
      setRenameOpen,
      setMoveOpen,
      setCopyToOpen,
      setDeleteOpen,
    });

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────
  useObjectBrowserKeyboard({
    previewOpenKey,
    selectedEntries,
    selectedIdsRef,
    visibleRef,
    pendingIdsRef,
    anchorRef,
    openPickerRef,
    filterInputRef,
    setAnchor,
    setNewFolderOpen,
    setDeleteOpen,
    setRenameOpen,
    setRenameTarget,
    handleSelectAll,
    handleCopyLink,
    clearSelection,
    closePreview,
    openPreview,
    setManySelected,
  });

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <UploadDropzone
      prefix={prefix}
      onFiles={handleUploadFiles}
      openRef={openPickerRef}
      openFolderRef={openFolderPickerRef}
    >
      <ObjectBrowserHeader
        bucket={bucket}
        prefix={prefix}
        onNavigatePrefix={navigateToPrefix}
        onNavigateHome={() => navigate({ to: "/" })}
        onOpenSettings={() => setBucketSettingsOpen(true)}
      />

      <ObjectToolbar
        selectedCount={selectedIds.size}
        totalCount={entries.length}
        totalBytes={totalBytes}
        filter={filter}
        onFilterChange={setFilter}
        filterInputRef={filterInputRef}
        onUpload={() => openPickerRef.current?.()}
        onUploadFolder={() => openFolderPickerRef.current?.()}
        onUploadFromUrl={() => setUploadFromUrlOpen(true)}
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
        connectionId={connectionId}
        bucket={bucket}
        pendingIds={pendingIds}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        onSelectRow={handleSelectRow}
        onSelectAll={handleSelectAll}
        onOpen={handleOpen}
        onContextAction={handleContextAction}
        onUploadClick={() => openPickerRef.current?.()}
      />

      <ObjectBrowserStatusBar
        hasData={!!query.data}
        entryCount={entries.length}
        visibleCount={visible.length}
        totalBytes={totalBytes}
        selectedSize={selectedIds.size}
        filter={filter}
        hasNextPage={!!query.hasNextPage}
      />

      <ObjectBrowserDialogs
        connectionId={connectionId}
        bucket={bucket}
        prefix={prefix}
        selectedCount={selectedIds.size}
        renameTarget={renameTarget}
        newFolderOpen={newFolderOpen}
        renameOpen={renameOpen}
        moveOpen={moveOpen}
        copyToOpen={copyToOpen}
        deleteOpen={deleteOpen}
        bucketSettingsOpen={bucketSettingsOpen}
        uploadFromUrlOpen={uploadFromUrlOpen}
        createFolderPending={createFolderPending}
        copyObjectPending={copyObjectPending}
        deleteObjectsPending={deleteObjectsPending}
        setNewFolderOpen={setNewFolderOpen}
        setRenameOpen={setRenameOpen}
        setMoveOpen={setMoveOpen}
        setCopyToOpen={setCopyToOpen}
        setDeleteOpen={setDeleteOpen}
        setBucketSettingsOpen={setBucketSettingsOpen}
        setUploadFromUrlOpen={setUploadFromUrlOpen}
        onConfirmNewFolder={handleConfirmNewFolder}
        onConfirmRename={handleConfirmRename}
        onConfirmMove={handleConfirmMove}
        onConfirmCopyTo={handleConfirmCopyTo}
        onConfirmDelete={handleConfirmDelete}
      />
    </UploadDropzone>
  );
}

function BrowserBody({
  query,
  entries,
  visible,
  prefix,
  connectionId,
  bucket,
  pendingIds,
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
  connectionId: string;
  bucket: string;
  pendingIds: ReadonlySet<string>;
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

  if (entries.length === 0 && pendingIds.size === 0) {
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
      connectionId={connectionId}
      bucket={bucket}
      pendingIds={pendingIds}
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
  connectionId: string;
  bucket: string;
  pendingIds: ReadonlySet<string>;
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
        connectionId={props.connectionId}
        bucket={props.bucket}
        pendingIds={props.pendingIds}
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
