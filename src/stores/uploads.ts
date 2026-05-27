/**
 * Reactive view over the singleton Uppy instance, exposed to the UI as a
 * Zustand store with the same shape the old worker-backed store had. The
 * panel + dropzone read from `useUploadsStore` / `useUploadItem` and don't
 * need to know Uppy exists.
 *
 * What this layer adds on top of Uppy:
 *   - EMA-smoothed speed + stall detection (Uppy reports raw bytes; the
 *     panel's "Stalled · retrying…" UX needs derived metrics).
 *   - A "canceled" status. Uppy drops files on removeFile(); we keep a small
 *     frozen snapshot so the row stays visible until clearFinished.
 *   - completion listeners (onUploadCompleted) that match the old contract,
 *     so object-browser can invalidate queries for the right bucket/prefix.
 */
import * as React from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { UppyFile } from "@uppy/core";
import { getUppy, MULTIPART_THRESHOLD, type UploadMeta } from "@/lib/uppy";
import type { UploadInputFile } from "@/components/upload-dropzone";
import { fingerprint, getResume } from "@/lib/upload-resume";
import { normalizePrefix } from "@/lib/object-path";
import { usePrefsStore } from "@/stores/prefs";
import { useUploadSessionStore } from "@/stores/upload-session";
import type { S3ObjectEntry, S3PrefixEntry } from "@server/types";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export type UploadStrategy = "single" | "multipart" | "server-stream";

/** Public shape the UI reads. Kept narrow on purpose — only the fields the
 *  panel and object-browser actually use. Internal Uppy state isn't leaked. */
/** Uppy's meta is typed as Record<string, unknown>; this lets UploadMeta
 *  satisfy that bound when we cast at the addFile boundary. */
type UploadMetaIndexed = UploadMeta & Record<string, unknown>;

export interface UploadItem {
  id: string;
  connectionId: string;
  bucket: string;
  key: string;
  prefix: string;
  fileName: string;
  /** Path relative to the destination prefix. Equals `fileName` for top-level
   *  uploads; for folder uploads it preserves the subdirectory chain so the
   *  panel can show users where a file is landing. */
  relativePath: string;
  size: number;
  contentType: string;
  status: UploadStatus;
  bytesUploaded: number;
  speedBps: number;
  etaSeconds: number | null;
  lastError?: string;
  strategy: UploadStrategy;
  /** Data-URL thumbnail from @uppy/thumbnail-generator; only populated for
   *  image files. Undefined while the thumbnail is still being generated or
   *  for non-image content. */
  preview?: string;
}

type AnyMeta = Record<string, unknown>;

interface UploadsState {
  items: Record<string, UploadItem>;
  order: string[];
  actions: {
    addFiles: (
      target: { connectionId: string; bucket: string; prefix: string },
      items: UploadInputFile[]
    ) => string[];
    /** Register a server-side upload (e.g. from-URL) that isn't backed by
     *  Uppy. Returns the synthetic id used by `finishServerUpload`. The row
     *  renders with `strategy: "server-stream"`, which the panel treats as
     *  an indeterminate progress state — animated sweep bar, no byte counter,
     *  no speed/ETA. Pass `size` and `contentType` when known (e.g. from a
     *  preflight HEAD) so the row's meta line and icon match the real file. */
    addServerUpload: (input: {
      connectionId: string;
      bucket: string;
      prefix: string;
      key: string;
      fileName: string;
      size?: number;
      contentType?: string;
    }) => string;
    /** Patch a server-side upload row in place (e.g. fill in `size` and
     *  `contentType` from a preflight HEAD that resolves after the row was
     *  added). No-ops if the id isn't a known server upload. */
    updateServerUpload: (
      id: string,
      patch: Partial<Pick<UploadItem, "size" | "contentType" | "fileName">>
    ) => void;
    /** Resolve a server-side upload as completed or failed. */
    finishServerUpload: (
      id: string,
      status: "completed" | "failed",
      error?: string
    ) => void;
    retry: (id: string) => void;
    cancel: (id: string) => void;
    pause: (id: string) => void;
    resume: (id: string) => void;
    pauseAll: () => void;
    resumeAll: () => void;
    clearFinished: () => void;
    cancelAll: () => void;
  };
}

// ─── EMA / stall machinery ─────────────────────────────────────────────────
// Same constants the old worker used so the speed display feels identical.
const SPEED_EMA_ALPHA = 0.3;
const STALL_MS = 5000;

interface Sample {
  lastBytes: number;
  lastTime: number;
  smoothedSpeed: number;
  /** When forward progress last advanced — used by the stall guard. */
  lastProgressTime: number;
}
const samples = new Map<string, Sample>();

function deriveSpeedEta(
  id: string,
  bytesUploaded: number,
  total: number
): { speedBps: number; etaSeconds: number | null } {
  const now = performance.now();
  const prev = samples.get(id);
  if (!prev) {
    samples.set(id, {
      lastBytes: bytesUploaded,
      lastTime: now,
      smoothedSpeed: 0,
      lastProgressTime: now,
    });
    return { speedBps: 0, etaSeconds: null };
  }
  const dt = now - prev.lastTime;
  const db = bytesUploaded - prev.lastBytes;
  if (db > 0) prev.lastProgressTime = now;
  const stalled = now - prev.lastProgressTime > STALL_MS;
  if (stalled) {
    prev.lastTime = now;
    prev.lastBytes = bytesUploaded;
    prev.smoothedSpeed = 0;
    return { speedBps: 0, etaSeconds: null };
  }
  if (dt < 50) {
    // Too soon to recompute; reuse the last smoothed speed to avoid jitter.
    return {
      speedBps: prev.smoothedSpeed,
      etaSeconds: speedToEta(prev.smoothedSpeed, total - bytesUploaded),
    };
  }
  const instant = (db / dt) * 1000;
  const smoothed =
    prev.smoothedSpeed === 0
      ? instant
      : SPEED_EMA_ALPHA * instant + (1 - SPEED_EMA_ALPHA) * prev.smoothedSpeed;
  prev.lastBytes = bytesUploaded;
  prev.lastTime = now;
  prev.smoothedSpeed = smoothed;
  return {
    speedBps: smoothed,
    etaSeconds: speedToEta(smoothed, total - bytesUploaded),
  };
}

function speedToEta(speedBps: number, remaining: number): number | null {
  if (speedBps <= 0 || remaining <= 0) return null;
  return remaining / speedBps;
}

// ─── Completion listeners ──────────────────────────────────────────────────
type CompletionListener = (item: UploadItem) => void;
const completionListeners = new Set<CompletionListener>();
export function onUploadCompleted(listener: CompletionListener): () => void {
  completionListeners.add(listener);
  return () => {
    completionListeners.delete(listener);
  };
}

// ─── Canceled-row snapshots ────────────────────────────────────────────────
// Uppy removes files from its state on removeFile; we keep a frozen copy so
// the UI can show the canceled row until clearFinished sweeps it away.
const canceledSnapshots = new Map<string, UploadItem>();

// ─── Server-side upload rows ───────────────────────────────────────────────
// Virtual rows for uploads that don't go through Uppy (today: the from-URL
// flow). They render alongside Uppy-backed rows so the user sees one unified
// transfer list. clearFinished sweeps the completed/failed ones.
const serverUploads = new Map<string, UploadItem>();
let serverUploadSeq = 0;

// ─── Thumbnail previews ────────────────────────────────────────────────────
// data-URL previews keyed by file id, emitted by @uppy/thumbnail-generator.
// Kept out-of-band from the items map so refresh() doesn't tear them down.
const previews = new Map<string, string>();

// ─── Status derivation ─────────────────────────────────────────────────────
function deriveStatus(file: UppyFile<AnyMeta, AnyMeta>): UploadStatus {
  if (file.error) return "failed";
  if (file.progress.uploadComplete) return "completed";
  if (file.isPaused) return "paused";
  if (file.progress.uploadStarted) return "uploading";
  return "queued";
}

function readMeta(file: UppyFile<AnyMeta, AnyMeta>): UploadMeta {
  const m = file.meta as Partial<UploadMeta>;
  return {
    connectionId: m.connectionId ?? "",
    bucket: m.bucket ?? "",
    key: m.key ?? "",
    prefix: m.prefix ?? "",
    relativePath: m.relativePath,
  };
}

/** Coerce Uppy's mixed numeric fields (number | false | null | undefined)
 *  to a plain number. Anything non-numeric becomes 0. */
function num(v: number | false | null | undefined): number {
  return typeof v === "number" ? v : 0;
}

function toItem(file: UppyFile<AnyMeta, AnyMeta>): UploadItem {
  const meta = readMeta(file);
  const status = deriveStatus(file);
  const bytesUploaded = num(file.progress.bytesUploaded);
  const size = num(file.size);
  // Only compute live speed for active rows; finished states freeze speed
  // at the previous sample (rendered as 0 in the UI).
  const { speedBps, etaSeconds } =
    status === "uploading"
      ? deriveSpeedEta(file.id, bytesUploaded, size)
      : { speedBps: 0, etaSeconds: null };
  // file.error is typed as string | undefined in @uppy/core v5; older variants
  // shipped Error objects, so check both defensively.
  const err = file.error as unknown;
  const lastError =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : undefined;
  const fileName = file.name ?? meta.key.split("/").pop() ?? "file";
  return {
    id: file.id,
    connectionId: meta.connectionId,
    bucket: meta.bucket,
    key: meta.key,
    prefix: meta.prefix,
    fileName,
    relativePath: meta.relativePath ?? fileName,
    size,
    contentType: file.type || "application/octet-stream",
    status,
    bytesUploaded,
    speedBps,
    etaSeconds,
    lastError,
    strategy: size >= MULTIPART_THRESHOLD ? "multipart" : "single",
    preview: previews.get(file.id),
  };
}

// ─── Store ─────────────────────────────────────────────────────────────────
export const useUploadsStore = create<UploadsState>((set) => {
  const uppy = getUppy();

  const refresh = (): void => {
    const files = uppy.getFiles() as UppyFile<AnyMeta, AnyMeta>[];
    const items: Record<string, UploadItem> = {};
    const order: string[] = [];
    for (const f of files) {
      items[f.id] = toItem(f);
      order.push(f.id);
    }
    // Re-attach canceled snapshots so they keep rendering. They come after
    // the live files in render order — same as the old store behavior.
    for (const [id, snap] of canceledSnapshots) {
      if (!items[id]) {
        items[id] = snap;
        order.push(id);
      }
    }
    // Server-side rows (e.g. from-URL) merge in the same way. Inserted at the
    // top so an active from-URL row doesn't hide below already-finished Uppy
    // rows after a clearFinished.
    for (const [id, snap] of serverUploads) {
      if (!items[id]) {
        items[id] = snap;
        order.unshift(id);
      }
    }
    set({ items, order });
  };

  // Subscribe to every Uppy event that can change a file's visible state.
  uppy.on("state-update", refresh);
  uppy.on("file-added", refresh);
  uppy.on("files-added", refresh);
  uppy.on("file-removed", refresh);
  uppy.on("upload-start", refresh);
  uppy.on("upload-progress", refresh);
  uppy.on("upload-success", (file) => {
    refresh();
    if (file) {
      const item = toItem(file as UppyFile<AnyMeta, AnyMeta>);
      for (const l of completionListeners) l(item);
    }
  });
  uppy.on("upload-error", refresh);
  uppy.on("upload-pause", refresh);
  uppy.on("upload-retry", refresh);
  uppy.on("pause-all", refresh);
  uppy.on("resume-all", refresh);
  uppy.on("thumbnail:generated", (file, preview) => {
    previews.set(file.id, preview);
    refresh();
  });
  uppy.on("file-removed", (file) => {
    if (file) previews.delete(file.id);
  });

  return {
    items: {},
    order: [],
    actions: {
      addFiles: ({ connectionId, bucket, prefix }, items) => {
        const ids: string[] = [];
        const norm = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
        const prefs = usePrefsStore.getState();
        const resumeEnabled = prefs.resumeOnReload;
        // Lock the compression decision in at the moment of upload — if the
        // user flips the pref mid-upload, files already in flight should
        // keep whatever behavior they were queued with.
        const compressImages = prefs.compressImages;
        // Same lock-in for storage class: session override beats the
        // persisted default; either becoming undefined later doesn't perturb
        // files already queued with a specific class.
        const sessionStorageClass =
          useUploadSessionStore.getState().storageClass;
        const storageClass =
          sessionStorageClass ?? prefs.defaultStorageClass ?? undefined;
        for (const { file, relativePath } of items) {
          // Treat the relativePath as authoritative — for top-level drops it's
          // just the filename, for folder drops it carries the full subtree.
          const safeRelative = relativePath || file.name;
          const key = `${norm}${safeRelative}`;
          const meta: UploadMetaIndexed = {
            connectionId,
            bucket,
            key,
            prefix,
            // Uppy's generateFileID reads meta.relativePath to disambiguate
            // same-name files in different subdirs — without it, two files
            // both named img1.jpg would collide on the same Uppy fileID.
            relativePath: safeRelative,
            storageClass,
            compressImages,
          };
          let id: string;
          try {
            id = uppy.addFile({
              name: file.name,
              type: file.type || "application/octet-stream",
              data: file,
              meta,
              source: "dropzone",
            });
          } catch (err) {
            // Restriction failure (e.g. duplicate); skip silently — Uppy
            // already surfaced it via its own event.
            console.warn("addFile skipped:", err);
            continue;
          }
          ids.push(id);

          // Cross-reload resume: if we have a saved uploadId for this exact
          // (file, target) pair, hand it to Uppy as `s3Multipart`. The AwsS3
          // plugin reads that on file start and flips MultipartUploader into
          // restore mode, which calls listParts() and skips parts that
          // already landed on S3 — no re-upload of work already done.
          if (resumeEnabled && file.size >= MULTIPART_THRESHOLD) {
            const fp = fingerprint({
              connectionId,
              bucket,
              key,
              size: file.size,
              lastModified: file.lastModified,
            });
            const saved = getResume(fp);
            if (saved) {
              // s3Multipart is set on the file by the AwsS3 plugin at runtime
              // and isn't part of the public UppyFile type, so cast to widen.
              (
                uppy.setFileState as (id: string, state: unknown) => void
              )(id, {
                s3Multipart: { uploadId: saved.uploadId, key },
              });
            }
          }
        }
        return ids;
      },

      addServerUpload: ({
        connectionId,
        bucket,
        prefix,
        key,
        fileName,
        size,
        contentType,
      }) => {
        const id = `server-upload-${++serverUploadSeq}`;
        const item: UploadItem = {
          id,
          connectionId,
          bucket,
          key,
          prefix,
          fileName,
          relativePath: fileName,
          size: size ?? 0,
          contentType: contentType || "application/octet-stream",
          status: "uploading",
          bytesUploaded: 0,
          speedBps: 0,
          etaSeconds: null,
          // strategy: "server-stream" is the signal the panel uses to flip
          // into indeterminate progress UI — we can't observe byte-level
          // progress on this transport, so even a known size doesn't give us
          // a bar to advance.
          strategy: "server-stream",
        };
        serverUploads.set(id, item);
        refresh();
        return id;
      },

      updateServerUpload: (id, patch) => {
        const prev = serverUploads.get(id);
        if (!prev) return;
        serverUploads.set(id, { ...prev, ...patch });
        refresh();
      },

      finishServerUpload: (id, status, error) => {
        const prev = serverUploads.get(id);
        if (!prev) return;
        serverUploads.set(id, {
          ...prev,
          status,
          lastError: error,
        });
        refresh();
      },

      retry: (id) => {
        canceledSnapshots.delete(id);
        void uppy.retryUpload(id);
      },

      cancel: (id) => {
        const file = uppy.getFile(id) as
          | UppyFile<AnyMeta, AnyMeta>
          | undefined;
        if (file) {
          // Snapshot before removal so the row keeps rendering as "canceled"
          // until the user clears it. abortMultipartUpload (server-side) is
          // invoked by Uppy itself as part of removeFile.
          const snap = toItem(file);
          canceledSnapshots.set(id, { ...snap, status: "canceled" });
        }
        uppy.removeFile(id);
        samples.delete(id);
        refresh();
      },

      pause: (id) => {
        // Only multipart can pause; for single-PUT Uppy's pauseResume is a
        // no-op anyway.
        uppy.pauseResume(id);
      },

      resume: (id) => {
        uppy.pauseResume(id);
      },

      pauseAll: () => {
        uppy.pauseAll();
      },

      resumeAll: () => {
        uppy.resumeAll();
      },

      clearFinished: () => {
        // Drop our canceled snapshots first, then ask Uppy to forget anything
        // it considers finished.
        canceledSnapshots.clear();
        for (const [id, snap] of serverUploads) {
          if (snap.status === "completed" || snap.status === "failed") {
            serverUploads.delete(id);
          }
        }
        const files = uppy.getFiles() as UppyFile<AnyMeta, AnyMeta>[];
        for (const f of files) {
          if (f.progress.uploadComplete || f.error) {
            uppy.removeFile(f.id);
            samples.delete(f.id);
            previews.delete(f.id);
          }
        }
        refresh();
      },

      cancelAll: () => {
        uppy.cancelAll();
        canceledSnapshots.clear();
        // Server-side uploads can't be canceled mid-flight (no abort plumbing
        // yet); just clear the rows from the panel. In-flight requests will
        // still complete server-side, but the user has dismissed them.
        serverUploads.clear();
        samples.clear();
        previews.clear();
        refresh();
      },
    },
  };
});

// ─── Per-row hook ──────────────────────────────────────────────────────────
export function useUploadItem(id: string): UploadItem | undefined {
  return useUploadsStore((s) => s.items[id]);
}

// ─── Optimistic file-browser entries ───────────────────────────────────────
// Active uploads surface as synthetic rows in the bucket listing so the user
// sees their files appear immediately, before the upload-completed listener
// invalidates the React Query and the real entry shows up. Folder uploads
// collapse into a single synthetic prefix row at the top level — the user
// can't drill in until the listing refreshes, which keeps us from having to
// fake a nested view of files that don't exist on S3 yet.

const ACTIVE_PENDING_STATUSES: ReadonlySet<UploadStatus> = new Set<UploadStatus>(
  ["uploading", "queued", "paused", "failed"]
);

export interface PendingFileInfo {
  kind: "file";
  uploadId: string;
  status: "uploading" | "queued" | "paused" | "failed";
  bytesUploaded: number;
  size: number;
  lastError?: string;
  /** Server-stream uploads (e.g. from-URL) have no byte-level progress. */
  indeterminate: boolean;
}

export interface PendingFolderInfo {
  kind: "folder";
  fileCount: number;
  totalBytes: number;
  bytesUploaded: number;
  anyFailed: boolean;
  anyUploading: boolean;
}

export type PendingInfo = PendingFileInfo | PendingFolderInfo;

/**
 * Synthetic entries to merge into the bucket listing. The selector splits
 * into a *signature* read (only changes when the SET of pending entries
 * changes — adds, removes, or size updates) and a `useMemo` that derives the
 * actual entry shapes. Progress ticks don't move the signature, so the
 * subscribing component doesn't re-render on every byte update; the
 * per-row hook (`usePendingByEntryId`) handles those.
 */
export function usePendingEntriesForPrefix(
  connectionId: string,
  bucket: string,
  currentPrefix: string
): { files: S3ObjectEntry[]; folders: S3PrefixEntry[] } {
  const norm = normalizePrefix(currentPrefix);
  const signature = useUploadsStore((s) => {
    const parts: string[] = [];
    for (const id of s.order) {
      const it = s.items[id];
      if (!it) continue;
      if (it.connectionId !== connectionId || it.bucket !== bucket) continue;
      if (!ACTIVE_PENDING_STATUSES.has(it.status)) continue;
      if (!it.key.startsWith(norm)) continue;
      const suffix = it.key.slice(norm.length);
      if (!suffix) continue;
      const slash = suffix.indexOf("/");
      if (slash === -1) {
        // Size is part of the signature so server-stream rows that learn
        // their size mid-flight refresh their synthetic entry.
        parts.push(`f:${it.key}:${it.size}`);
      } else {
        parts.push(`d:${norm}${suffix.slice(0, slash + 1)}`);
      }
    }
    parts.sort();
    return parts.join("|");
  });

  return React.useMemo(() => {
    const fileSeen = new Set<string>();
    const files: S3ObjectEntry[] = [];
    const folderSet = new Set<string>();
    const state = useUploadsStore.getState();
    // One timestamp shared across all synthetic rows in this memo eval, so
    // they sort consistently against each other under a modified-date sort.
    const lastModified = new Date().toISOString();
    for (const id of state.order) {
      const it = state.items[id];
      if (!it) continue;
      if (it.connectionId !== connectionId || it.bucket !== bucket) continue;
      if (!ACTIVE_PENDING_STATUSES.has(it.status)) continue;
      if (!it.key.startsWith(norm)) continue;
      const suffix = it.key.slice(norm.length);
      if (!suffix) continue;
      const slash = suffix.indexOf("/");
      if (slash === -1) {
        if (fileSeen.has(it.key)) continue;
        fileSeen.add(it.key);
        files.push({
          type: "object",
          key: it.key,
          size: it.size,
          lastModified,
        });
      } else {
        folderSet.add(norm + suffix.slice(0, slash + 1));
      }
    }
    const folders: S3PrefixEntry[] = Array.from(folderSet).map((prefix) => ({
      type: "prefix",
      prefix,
    }));
    return { files, folders };
    // signature captures every store change relevant to entry identity; the
    // other deps are inputs from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, connectionId, bucket, norm]);
}

/**
 * Per-row pending status. Files match exactly on key; folders aggregate
 * every active upload whose key sits under the prefix. Returns `undefined`
 * when `enabled` is false — that's the cheap path for non-pending rows so
 * progress ticks don't force every visible row through this scan.
 */
export function usePendingByEntryId(
  connectionId: string,
  bucket: string,
  entryId: string,
  enabled: boolean
): PendingInfo | undefined {
  return useUploadsStore(
    useShallow((s): PendingInfo | undefined => {
      if (!enabled) return undefined;
      const isFolder = entryId.endsWith("/");
      if (!isFolder) {
        for (const id of s.order) {
          const it = s.items[id];
          if (!it) continue;
          if (it.connectionId !== connectionId) continue;
          if (it.bucket !== bucket) continue;
          if (it.key !== entryId) continue;
          if (!ACTIVE_PENDING_STATUSES.has(it.status)) continue;
          return {
            kind: "file",
            uploadId: it.id,
            status: it.status as PendingFileInfo["status"],
            bytesUploaded: it.bytesUploaded,
            size: it.size,
            lastError: it.lastError,
            indeterminate: it.strategy === "server-stream",
          };
        }
        return undefined;
      }
      let fileCount = 0;
      let totalBytes = 0;
      let bytesUploaded = 0;
      let anyFailed = false;
      let anyUploading = false;
      for (const id of s.order) {
        const it = s.items[id];
        if (!it) continue;
        if (it.connectionId !== connectionId) continue;
        if (it.bucket !== bucket) continue;
        if (!it.key.startsWith(entryId)) continue;
        if (!ACTIVE_PENDING_STATUSES.has(it.status)) continue;
        fileCount += 1;
        totalBytes += it.size;
        bytesUploaded += it.bytesUploaded;
        if (it.status === "failed") anyFailed = true;
        if (it.status === "uploading") anyUploading = true;
      }
      if (fileCount === 0) return undefined;
      return {
        kind: "folder",
        fileCount,
        totalBytes,
        bytesUploaded,
        anyFailed,
        anyUploading,
      };
    })
  );
}
