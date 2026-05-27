import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import type { UploadInputFile } from "@/components/upload-dropzone";
import { objectKeys } from "@/lib/api/objects";
import { basename, normalizePrefix } from "@/lib/object-path";
import { isEditableTarget } from "@/lib/editable-target";
import { usePrefsStore } from "@/stores/prefs";
import {
  onUploadCompleted,
  useUploadsStore,
} from "@/stores/uploads";
import type { S3Entry, S3ObjectEntry } from "@server/types";

/** S3's per-object size ceiling. The worker auto-splits anything over the
 *  multipart threshold so we don't need a separate single-PUT cap. */
const MAX_UPLOAD_BYTES = 5 * 1024 ** 4;

export function useObjectBrowserUploads(args: {
  connectionId: string;
  bucket: string;
  prefix: string;
  entries: S3Entry[];
}) {
  const { connectionId, bucket, prefix, entries } = args;
  const queryClient = useQueryClient();

  const normalizedPrefix = normalizePrefix(prefix);

  // Listen for completions targeting *our* current prefix to invalidate the
  // listing. The browser doesn't do the upload itself anymore — the global
  // upload store + floating UploadPanel own progress/retry/cancel.
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

  // Paste-from-clipboard: image bytes pasted into the page (outside text
  // inputs) get routed through the same upload queue as drag-drop. Reads
  // handleUploadFiles through a ref so the listener doesn't rebind on every
  // render.
  const pasteRef = React.useRef(handleUploadFiles);
  pasteRef.current = handleUploadFiles;

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      // Some browsers leave document.activeElement on a focused input even
      // when the event target is the document; double-check.
      if (isEditableTarget(document.activeElement)) return;
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const files: UploadInputFile[] = [];
      const stamp = nowStamp();
      let idx = 0;
      for (const it of Array.from(items)) {
        if (it.kind !== "file") continue;
        const blob = it.getAsFile();
        if (!blob) continue;
        // Only intercept image-type blobs — non-image pastes (e.g. a copied
        // file from Finder) are rare and would surprise users by quietly
        // queuing themselves. Drag-drop is the explicit path for that.
        if (!blob.type.startsWith("image/")) continue;
        const ext = extensionForMime(blob.type) ?? "bin";
        const suffix = idx === 0 ? "" : `-${idx + 1}`;
        const name = `pasted-${stamp}${suffix}.${ext}`;
        // Re-wrap as a File so the rest of the upload pipeline (which reads
        // .name) gets a friendly filename; the underlying blob bytes are
        // unchanged.
        const file = new File([blob], name, {
          type: blob.type,
          lastModified: Date.now(),
        });
        files.push({ file, relativePath: name });
        idx += 1;
      }
      if (files.length === 0) return;
      e.preventDefault();
      pasteRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return { handleUploadFiles, normalizedPrefix };
}

/** File-safe ISO-ish timestamp for `pasted-${stamp}.png` keys. Colons are
 *  legal in S3 but awkward on Windows downloads, so we substitute hyphens. */
function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Map common image MIME types to a sensible file extension. The fallback is
 * undefined (caller falls back to "bin") so an exotic clipboard MIME doesn't
 * land as a misleading `.png`.
 */
function extensionForMime(mime: string): string | undefined {
  const m = mime.toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  if (m === "image/avif") return "avif";
  if (m === "image/bmp") return "bmp";
  if (m === "image/svg+xml") return "svg";
  if (m === "image/heic") return "heic";
  if (m === "image/heif") return "heif";
  if (m === "image/tiff") return "tiff";
  if (m.startsWith("image/")) return m.slice("image/".length);
  return undefined;
}
