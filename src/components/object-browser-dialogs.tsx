import { Settings } from "@/lib/icons";

import { AppStatusBar } from "@/components/app-shell";
import { BreadcrumbPath } from "@/components/breadcrumb-path";
import { BucketSettingsDialog } from "@/components/bucket-dialogs";
import {
  ConfirmDeleteDialog,
  MovePromptDialog,
  NewFolderDialog,
  RenameDialog,
} from "@/components/object-dialogs";
import { UploadFromUrlDialog } from "@/components/upload-from-url-dialog";
import { formatBytes, formatCount } from "@/lib/format";
import { basename, entryId } from "@/lib/object-path";
import type { S3Entry } from "@server/types";

/** Top breadcrumb bar with the bucket-settings cog. */
export function ObjectBrowserHeader(props: {
  bucket: string;
  prefix: string;
  onNavigatePrefix: (target: string) => void;
  onNavigateHome: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="border-border bg-background flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
      <BreadcrumbPath
        bucket={props.bucket}
        prefix={props.prefix}
        onNavigatePrefix={props.onNavigatePrefix}
        onNavigateHome={props.onNavigateHome}
      />
      <button
        type="button"
        onClick={props.onOpenSettings}
        className="hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 rounded p-1.5 focus:outline-none"
        aria-label="Bucket settings"
        title="Bucket settings (versioning, …)"
      >
        <Settings className="size-4" />
      </button>
    </div>
  );
}

/** Footer status bar: counts + selection + global keyboard hints. */
export function ObjectBrowserStatusBar(props: {
  hasData: boolean;
  entryCount: number;
  visibleCount: number;
  totalBytes: number;
  selectedSize: number;
  filter: string;
  hasNextPage: boolean;
}) {
  return (
    <AppStatusBar
      left={
        props.hasData ? (
          <>
            <span>
              {formatCount(props.entryCount)} items
              {props.filter && props.entryCount !== props.visibleCount
                ? ` (${props.visibleCount} shown)`
                : ""}
              {props.hasNextPage ? "+" : ""}
            </span>
            <span>{formatBytes(props.totalBytes)} total</span>
            {props.selectedSize > 0 && (
              <span className="text-primary-text">
                {props.selectedSize} selected
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
  );
}

/**
 * The bottom-of-tree dialog stack for ObjectBrowser. Lifted out of the main
 * component as a presentation seam — it consumes props only, no hooks of its
 * own.
 */
export function ObjectBrowserDialogs(props: {
  connectionId: string;
  bucket: string;
  prefix: string;
  selectedCount: number;
  renameTarget: S3Entry | null;
  newFolderOpen: boolean;
  renameOpen: boolean;
  moveOpen: boolean;
  copyToOpen: boolean;
  deleteOpen: boolean;
  bucketSettingsOpen: boolean;
  uploadFromUrlOpen: boolean;
  createFolderPending: boolean;
  copyObjectPending: boolean;
  deleteObjectsPending: boolean;
  setNewFolderOpen: (open: boolean) => void;
  setRenameOpen: (open: boolean) => void;
  setMoveOpen: (open: boolean) => void;
  setCopyToOpen: (open: boolean) => void;
  setDeleteOpen: (open: boolean) => void;
  setBucketSettingsOpen: (open: boolean) => void;
  setUploadFromUrlOpen: (open: boolean) => void;
  onConfirmNewFolder: (name: string) => void;
  onConfirmRename: (newName: string) => Promise<void>;
  onConfirmMove: (destPrefix: string) => Promise<void>;
  onConfirmCopyTo: (destPrefix: string) => Promise<void>;
  onConfirmDelete: () => void;
}) {
  return (
    <>
      <NewFolderDialog
        open={props.newFolderOpen}
        onOpenChange={props.setNewFolderOpen}
        basePrefix={props.prefix}
        pending={props.createFolderPending}
        onSubmit={props.onConfirmNewFolder}
      />
      <RenameDialog
        open={props.renameOpen}
        onOpenChange={props.setRenameOpen}
        initialName={
          props.renameTarget ? basename(entryId(props.renameTarget)) : ""
        }
        pending={props.copyObjectPending || props.deleteObjectsPending}
        onSubmit={props.onConfirmRename}
      />
      <MovePromptDialog
        open={props.moveOpen}
        onOpenChange={props.setMoveOpen}
        defaultPrefix={props.prefix}
        count={props.selectedCount}
        pending={props.copyObjectPending || props.deleteObjectsPending}
        onSubmit={props.onConfirmMove}
        mode="move"
      />
      <MovePromptDialog
        open={props.copyToOpen}
        onOpenChange={props.setCopyToOpen}
        defaultPrefix={props.prefix}
        count={props.selectedCount}
        pending={props.copyObjectPending}
        onSubmit={props.onConfirmCopyTo}
        mode="copy"
      />
      <ConfirmDeleteDialog
        open={props.deleteOpen}
        onOpenChange={props.setDeleteOpen}
        count={props.selectedCount}
        pending={props.deleteObjectsPending}
        onConfirm={props.onConfirmDelete}
      />
      <BucketSettingsDialog
        open={props.bucketSettingsOpen}
        onOpenChange={props.setBucketSettingsOpen}
        connectionId={props.connectionId}
        bucket={props.bucket}
      />
      <UploadFromUrlDialog
        open={props.uploadFromUrlOpen}
        onOpenChange={props.setUploadFromUrlOpen}
        connectionId={props.connectionId}
        bucket={props.bucket}
        prefix={props.prefix}
      />
    </>
  );
}
