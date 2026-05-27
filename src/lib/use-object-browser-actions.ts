import * as React from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { fetchDownloadUrl } from "@/lib/api/objects";
import { trimTrailingSlash } from "@/lib/object-path";
import type { ObjectSortKey, SortDirection } from "@/lib/object-sort";
import type { S3Entry, S3ObjectEntry } from "@server/types";

/**
 * Navigation, sort toggling, and the small toolbar delegates that pick a
 * single entry out of the current selection and route to a per-entry action.
 */
export function useObjectBrowserActions(args: {
  connectionId: string;
  bucket: string;
  visible: S3Entry[];
  visibleRef: React.RefObject<S3Entry[]>;
  selectedEntries: S3Entry[];
  sortKeyRef: React.RefObject<ObjectSortKey>;
  setSortKey: React.Dispatch<React.SetStateAction<ObjectSortKey>>;
  setSortDir: React.Dispatch<React.SetStateAction<SortDirection>>;
  openPreview: (key: string, siblings: string[]) => void;
  openShare: (key: string) => void;
  copyEntryLink: (entry: S3Entry) => Promise<boolean>;
  setRenameTarget: (entry: S3Entry) => void;
  setRenameOpen: (open: boolean) => void;
}) {
  const {
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
  } = args;
  const navigate = useNavigate();

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

  // Plain click on a row. Folders navigate; files open the preview drawer.
  // The context menu's "Open in new tab" uses handleOpenInNewTab instead so
  // it can still bypass the drawer.
  const handleOpen = React.useCallback(
    (entry: S3Entry) => {
      if (entry.type === "prefix") {
        navigateToPrefix(entry.prefix);
        return;
      }
      const siblings = visibleRef.current!
        .filter((e): e is S3ObjectEntry => e.type === "object")
        .map((e) => e.key);
      openPreview(entry.key, siblings);
    },
    [navigateToPrefix, openPreview, visibleRef]
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

  const handleSortChange = React.useCallback(
    (key: ObjectSortKey) => {
      if (key === sortKeyRef.current) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKeyRef, setSortKey, setSortDir]
  );

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

  return {
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
  };
}
