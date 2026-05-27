import { toast } from "sonner";

import { basename, dirname, entryId, normalizePrefix } from "@/lib/object-path";
import {
  useCopyObject,
  useCreateFolder,
  useDeleteObjects,
} from "@/lib/api/objects";
import { useSelectionStore } from "@/stores/selection";
import type { S3Entry, S3ObjectEntry } from "@server/types";

/**
 * Owns the bucket-level mutations (createFolder/copy/delete) plus the dialog
 * confirmation handlers that drive them. Closes its own dialogs via the
 * setters passed in — the dialog *state* still lives in the parent so toolbar
 * buttons + keyboard shortcuts can open them.
 */
export function useObjectBrowserMutations(args: {
  connectionId: string;
  bucket: string;
  prefix: string;
  selectedEntries: S3Entry[];
  renameTarget: S3Entry | null;
  setNewFolderOpen: (open: boolean) => void;
  setRenameOpen: (open: boolean) => void;
  setMoveOpen: (open: boolean) => void;
  setCopyToOpen: (open: boolean) => void;
  setDeleteOpen: (open: boolean) => void;
}) {
  const {
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
  } = args;
  const clearSelection = useSelectionStore((s) => s.clear);

  const createFolder = useCreateFolder(connectionId, bucket, {
    onSuccess: () => toast.success("Folder created"),
    onError: (e) => toast.error(e.message),
  });
  const deleteObjects = useDeleteObjects(connectionId, bucket);
  const copyObject = useCopyObject(connectionId, bucket);

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
    const results = await Promise.allSettled(
      targets.map(async (entry) => {
        await copyObject.mutateAsync({
          sourceKey: entry.key,
          destKey: dest + basename(entry.key),
        });
        await deleteObjects.mutateAsync({ keys: [entry.key] });
      })
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
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
    const results = await Promise.allSettled(
      targets.map((entry) =>
        copyObject.mutateAsync({
          sourceKey: entry.key,
          destKey: dest + basename(entry.key),
        })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
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

  return {
    createFolderPending: createFolder.isPending,
    copyObjectPending: copyObject.isPending,
    deleteObjectsPending: deleteObjects.isPending,
    handleConfirmNewFolder,
    handleConfirmRename,
    handleConfirmMove,
    handleConfirmCopyTo,
    handleConfirmDelete,
  };
}
