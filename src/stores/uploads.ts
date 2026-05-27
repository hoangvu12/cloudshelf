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
import { create } from "zustand";
import type { UppyFile } from "@uppy/core";
import { getUppy, MULTIPART_THRESHOLD, type UploadMeta } from "@/lib/uppy";
import type { UploadInputFile } from "@/components/upload-dropzone";
import { fingerprint, getResume } from "@/lib/upload-resume";
import { usePrefsStore } from "@/stores/prefs";
import { useUploadSessionStore } from "@/stores/upload-session";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export type UploadStrategy = "single" | "multipart";

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
