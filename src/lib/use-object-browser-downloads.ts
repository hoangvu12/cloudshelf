import { toast } from "sonner";

import { formatBytes, formatCount } from "@/lib/format";
import { basename, entryId } from "@/lib/object-path";
import { fetchDownloadUrl } from "@/lib/api/objects";
import {
  downloadEntriesAsZip,
  gatherZipEntries,
  HARD_CAP_BYTES,
  SOFT_WARN_BYTES,
  totalZipBytes,
} from "@/lib/zip-download";
import type { S3Entry, S3ObjectEntry } from "@server/types";

export function useObjectBrowserDownloads(args: {
  connectionId: string;
  bucket: string;
  prefix: string;
  selectedEntries: S3Entry[];
  selectedIdsRef: React.RefObject<ReadonlySet<string>>;
}) {
  const { connectionId, bucket, prefix, selectedEntries, selectedIdsRef } = args;

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
      ? selectedIdsRef.current!.has(entryId(targetEntry))
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

  return {
    downloadEntry,
    handleDownloadSelected,
    handleDownloadAsZip,
    copyEntryLink,
    handleCopyLink,
  };
}
