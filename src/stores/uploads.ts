import { create } from "zustand";
import { runUpload } from "@/lib/upload-worker";
import {
  ABORT_PRIORITY,
  globalUploadQueue,
} from "@/lib/upload-queue";
import {
  deleteResume,
  fingerprint,
  getResume,
  pruneStaleResume,
  pushCompletedPart,
  setResume,
  type ResumePart,
} from "@/lib/upload-resume";

/**
 * State machine for one upload. Multipart uploads stay in `uploading` across
 * many parts; failure of an individual part triggers per-part retry, only
 * file-level exhaustion flips to `failed`.
 *
 * `paused` = user-initiated pause, multipart only. The worker is aborted but
 * the resume entry (uploadId + completed parts) is kept on the server and in
 * localStorage. Resume rebuilds the AbortController and re-queues — same path
 * as `retry`. Single-PUT uploads can't pause since S3 has no resume primitive
 * for them; the UI hides the button.
 */
export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

/** Files at or above this size use S3 multipart; below it use a single PUT.
 *  Same threshold Uppy's @uppy/aws-s3 uses by default — under 100 MB the
 *  overhead of multipart (create + N round trips + complete) isn't worth it. */
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024;

/**
 * One part of a multipart upload. The worker mutates `uploaded` via live
 * progress ticks (sum across parts → `bytesUploaded` on the item). `done` and
 * `etag` flip together when the backend confirms the part.
 */
export interface UploadPart {
  partNumber: number;
  /** Byte size of this part. Last part may be smaller than partSize. */
  size: number;
  /** Bytes successfully delivered so far. Reset to 0 if a part retries. */
  uploaded: number;
  /** Set only when the backend acks the part. */
  etag?: string;
  done: boolean;
}

export type UploadStrategy = "single" | "multipart";

export interface UploadItem {
  id: string;
  connectionId: string;
  bucket: string;
  key: string;
  /** Prefix uploaded *to* — used to scope query invalidation. */
  prefix: string;
  fileName: string;
  size: number;
  contentType: string;
  /** Held by reference — never serialized. */
  file: File;
  /** File.lastModified mirror — needed to compute the resume fingerprint. */
  lastModified: number;

  status: UploadStatus;
  bytesUploaded: number;
  /** Smoothed (EMA) — direct values from XHR.progress are too jittery. */
  speedBps: number;
  etaSeconds: number | null;

  attempt: number;
  lastError?: string;

  /** File-level controller. All in-flight part XHRs listen to its signal. */
  controller: AbortController;

  /** "single" = one PUT to /upload. "multipart" = N PUTs to /multipart/part. */
  strategy: UploadStrategy;
  /** Backend session id, populated after CreateMultipartUpload. */
  uploadId?: string;
  /** Chosen at start time; the last part may be smaller. */
  partSize?: number;
  /** Per-part live state, only present when strategy === "multipart". */
  parts?: UploadPart[];

  createdAt: number;
  completedAt?: number;
}

type CompletionListener = (item: UploadItem) => void;
const completionListeners = new Set<CompletionListener>();
export function onUploadCompleted(listener: CompletionListener): () => void {
  completionListeners.add(listener);
  return () => {
    completionListeners.delete(listener);
  };
}

interface UploadsState {
  items: Record<string, UploadItem>;
  order: string[];
  queue: string[];
  active: Set<string>;
  maxConcurrent: number;
  actions: {
    addFiles: (
      target: { connectionId: string; bucket: string; prefix: string },
      files: File[]
    ) => string[];
    retry: (id: string) => void;
    cancel: (id: string) => void;
    /** Pause a multipart upload. No-op for single PUT. */
    pause: (id: string) => void;
    /** Resume a paused upload. */
    resume: (id: string) => void;
    /** Pause every multipart upload currently uploading. */
    pauseAll: () => void;
    /** Resume every paused upload. */
    resumeAll: () => void;
    clearFinished: () => void;
    cancelAll: () => void;
    // Worker-only actions below — UI shouldn't call them.
    _markUploading: (id: string) => void;
    _setProgress: (
      id: string,
      bytes: number,
      speedBps: number,
      etaSeconds: number | null
    ) => void;
    /** Worker sets the multipart bootstrap state after CreateMultipartUpload (or after resume reuse). */
    _setMultipartState: (
      id: string,
      uploadId: string,
      partSize: number,
      parts: UploadPart[]
    ) => void;
    /** Worker calls this when the backend acks a part. Updates store + persists to localStorage. */
    _markPartDone: (id: string, partNumber: number, etag: string) => void;
    _markCompleted: (id: string) => void;
    _markFailed: (id: string, error: string) => void;
    _markCanceled: (id: string) => void;
    _runQueue: () => void;
  };
}

const MAX_CONCURRENT = 3;

function joinKey(prefix: string, name: string): string {
  const norm = prefix && !prefix.endsWith("/") ? prefix + "/" : prefix;
  return `${norm}${name}`;
}

// Drop stale resume entries on module load. Runs once per page load — cheap.
if (typeof window !== "undefined") {
  pruneStaleResume();
}

/**
 * Build the initial parts list when we have a saved partSize. Each part is
 * pre-marked done if its (partNumber, size) matches what localStorage knows
 * was already on S3. The worker still verifies with ListParts before trusting
 * these, so a stale entry just means a (cheap) ListParts round-trip.
 */
function buildPartsFromResume(
  size: number,
  partSize: number,
  saved: ResumePart[]
): UploadPart[] {
  const parts: UploadPart[] = [];
  const totalParts = Math.ceil(size / partSize);
  const byNum = new Map<number, ResumePart>();
  for (const p of saved) byNum.set(p.partNumber, p);
  for (let i = 1; i <= totalParts; i++) {
    const partBytes = i < totalParts ? partSize : size - (totalParts - 1) * partSize;
    const savedPart = byNum.get(i);
    if (savedPart && savedPart.size === partBytes) {
      parts.push({
        partNumber: i,
        size: partBytes,
        uploaded: partBytes,
        etag: savedPart.etag,
        done: true,
      });
    } else {
      parts.push({
        partNumber: i,
        size: partBytes,
        uploaded: 0,
        done: false,
      });
    }
  }
  return parts;
}

export const useUploadsStore = create<UploadsState>((set, get) => ({
  items: {},
  order: [],
  queue: [],
  active: new Set(),
  maxConcurrent: MAX_CONCURRENT,
  actions: {
    addFiles: ({ connectionId, bucket, prefix }, files) => {
      const now = Date.now();
      const newIds: string[] = [];
      set((s) => {
        const items = { ...s.items };
        const order = [...s.order];
        const queue = [...s.queue];
        for (const file of files) {
          const id = crypto.randomUUID();
          const key = joinKey(prefix, file.name);
          const strategy: UploadStrategy =
            file.size >= MULTIPART_THRESHOLD ? "multipart" : "single";

          // Resume check: only meaningful for multipart (single PUT can't resume).
          let uploadId: string | undefined;
          let partSize: number | undefined;
          let parts: UploadPart[] | undefined;
          let bytesUploaded = 0;
          if (strategy === "multipart") {
            const fp = fingerprint({
              connectionId,
              bucket,
              key,
              size: file.size,
              lastModified: file.lastModified,
            });
            const saved = getResume(fp);
            if (saved) {
              uploadId = saved.uploadId;
              partSize = saved.partSize;
              parts = buildPartsFromResume(
                file.size,
                saved.partSize,
                saved.completedParts
              );
              bytesUploaded = parts
                .filter((p) => p.done)
                .reduce((sum, p) => sum + p.size, 0);
            }
          }

          items[id] = {
            id,
            connectionId,
            bucket,
            key,
            prefix,
            fileName: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            file,
            lastModified: file.lastModified,
            status: "queued",
            bytesUploaded,
            speedBps: 0,
            etaSeconds: null,
            attempt: 0,
            controller: new AbortController(),
            strategy,
            uploadId,
            partSize,
            parts,
            createdAt: now,
          };
          order.push(id);
          queue.push(id);
          newIds.push(id);
        }
        return { items, order, queue };
      });
      get().actions._runQueue();
      return newIds;
    },

    retry: (id) => {
      const item = get().items[id];
      if (!item || item.status !== "failed") return;
      // Keep uploadId + parts so multipart can resume just the missing parts.
      // For single-PUT, parts is undefined and the whole body gets re-sent.
      set((s) => {
        const resetParts = item.parts?.map((p) =>
          p.done ? p : { ...p, uploaded: 0 }
        );
        const bytesUploaded = resetParts
          ? resetParts.filter((p) => p.done).reduce((sum, p) => sum + p.size, 0)
          : 0;
        return {
          items: {
            ...s.items,
            [id]: {
              ...item,
              status: "queued",
              bytesUploaded,
              speedBps: 0,
              etaSeconds: null,
              lastError: undefined,
              controller: new AbortController(),
              parts: resetParts,
            },
          },
          queue: [...s.queue, id],
        };
      });
      get().actions._runQueue();
    },

    cancel: (id) => {
      const item = get().items[id];
      if (!item) return;
      if (item.status === "completed" || item.status === "canceled") return;
      item.controller.abort();
      // Fire-and-forget cleanup of any backend multipart session + local resume entry.
      cleanupMultipartIfPresent(item);
      set((s) => {
        const active = new Set(s.active);
        active.delete(id);
        return {
          items: {
            ...s.items,
            [id]: { ...item, status: "canceled" },
          },
          queue: s.queue.filter((q) => q !== id),
          active,
        };
      });
      get().actions._runQueue();
    },

    pause: (id) => {
      const item = get().items[id];
      if (!item) return;
      // Single-PUT can't pause: S3 has no resume primitive for it. UI hides
      // the button, but guard here too so a stray call is a clean no-op.
      if (item.strategy !== "multipart") return;
      if (item.status !== "uploading" && item.status !== "queued") return;
      // Aborts in-flight part XHRs and any queued globalUploadQueue waiters.
      // We do NOT delete the resume entry — pause must be reversible.
      item.controller.abort();
      set((s) => {
        const active = new Set(s.active);
        active.delete(id);
        return {
          items: {
            ...s.items,
            [id]: {
              ...item,
              status: "paused",
              speedBps: 0,
              etaSeconds: null,
            },
          },
          queue: s.queue.filter((q) => q !== id),
          active,
        };
      });
      get().actions._runQueue();
    },

    resume: (id) => {
      const item = get().items[id];
      if (!item || item.status !== "paused") return;
      // Same shape as retry: fresh controller, reset live bytes on non-done
      // parts (their in-flight bytes were wasted by the pause-abort), keep
      // done parts and their etags so we only re-upload what's missing.
      set((s) => {
        const resetParts = item.parts?.map((p) =>
          p.done ? p : { ...p, uploaded: 0 }
        );
        const bytesUploaded = resetParts
          ? resetParts.filter((p) => p.done).reduce((sum, p) => sum + p.size, 0)
          : item.bytesUploaded;
        return {
          items: {
            ...s.items,
            [id]: {
              ...item,
              status: "queued",
              bytesUploaded,
              speedBps: 0,
              etaSeconds: null,
              controller: new AbortController(),
              parts: resetParts,
            },
          },
          queue: [...s.queue, id],
        };
      });
      get().actions._runQueue();
    },

    pauseAll: () => {
      const s = get();
      for (const id of s.order) {
        const it = s.items[id];
        if (!it) continue;
        if (it.strategy !== "multipart") continue;
        if (it.status !== "uploading" && it.status !== "queued") continue;
        get().actions.pause(id);
      }
    },

    resumeAll: () => {
      const s = get();
      for (const id of s.order) {
        if (s.items[id]?.status === "paused") get().actions.resume(id);
      }
    },

    clearFinished: () => {
      set((s) => {
        const items = { ...s.items };
        const order: string[] = [];
        for (const id of s.order) {
          const it = items[id];
          const finished =
            it.status === "completed" ||
            it.status === "canceled" ||
            it.status === "failed";
          if (finished) delete items[id];
          else order.push(id);
        }
        return { items, order };
      });
    },

    cancelAll: () => {
      const s = get();
      for (const id of s.order) {
        const it = s.items[id];
        if (!it) continue;
        if (it.status === "completed" || it.status === "canceled") continue;
        it.controller.abort();
        cleanupMultipartIfPresent(it);
      }
      set({ items: {}, order: [], queue: [], active: new Set() });
    },

    _markUploading: (id) => {
      set((s) => {
        const item = s.items[id];
        if (!item) return s;
        return {
          items: {
            ...s.items,
            [id]: {
              ...item,
              status: "uploading",
              attempt: item.attempt + 1,
            },
          },
        };
      });
    },

    _setProgress: (id, bytes, speedBps, etaSeconds) => {
      set((s) => {
        const item = s.items[id];
        if (!item) return s;
        return {
          items: {
            ...s.items,
            [id]: { ...item, bytesUploaded: bytes, speedBps, etaSeconds },
          },
        };
      });
    },

    _setMultipartState: (id, uploadId, partSize, parts) => {
      set((s) => {
        const item = s.items[id];
        if (!item) return s;
        const bytesUploaded = parts
          .filter((p) => p.done)
          .reduce((sum, p) => sum + p.size, 0);
        return {
          items: {
            ...s.items,
            [id]: { ...item, uploadId, partSize, parts, bytesUploaded },
          },
        };
      });
    },

    _markPartDone: (id, partNumber, etag) => {
      // Updating zustand on each part complete is fine — parts complete at
      // most ~10/sec even on fast networks, well under render-storm territory.
      let updatedItem: UploadItem | undefined;
      set((s) => {
        const item = s.items[id];
        if (!item || !item.parts) return s;
        const parts = item.parts.map((p) =>
          p.partNumber === partNumber
            ? { ...p, etag, done: true, uploaded: p.size }
            : p
        );
        const next = { ...item, parts };
        updatedItem = next;
        return { items: { ...s.items, [id]: next } };
      });
      // Mirror to localStorage so a page reload preserves the resume state.
      if (updatedItem && updatedItem.uploadId && updatedItem.partSize) {
        const part = updatedItem.parts?.find(
          (p) => p.partNumber === partNumber
        );
        if (part) {
          const fp = fingerprint({
            connectionId: updatedItem.connectionId,
            bucket: updatedItem.bucket,
            key: updatedItem.key,
            size: updatedItem.size,
            lastModified: updatedItem.lastModified,
          });
          const doneCount = updatedItem.parts!.filter((p) => p.done).length;
          if (doneCount === 1) {
            // First completed part — initialize the whole entry.
            setResume(fp, {
              uploadId: updatedItem.uploadId,
              partSize: updatedItem.partSize,
              completedParts: [{ partNumber, etag, size: part.size }],
              createdAt: Date.now(),
            });
          } else {
            pushCompletedPart(fp, { partNumber, etag, size: part.size });
          }
        }
      }
    },

    _markCompleted: (id) => {
      const finalItem = get().items[id];
      set((s) => {
        const item = s.items[id];
        if (!item) return s;
        const active = new Set(s.active);
        active.delete(id);
        return {
          items: {
            ...s.items,
            [id]: {
              ...item,
              status: "completed",
              bytesUploaded: item.size,
              speedBps: 0,
              etaSeconds: 0,
              completedAt: Date.now(),
            },
          },
          active,
        };
      });
      if (finalItem) {
        // Resume entry has served its purpose — drop it so it doesn't loiter.
        if (finalItem.strategy === "multipart" && finalItem.uploadId) {
          const fp = fingerprint({
            connectionId: finalItem.connectionId,
            bucket: finalItem.bucket,
            key: finalItem.key,
            size: finalItem.size,
            lastModified: finalItem.lastModified,
          });
          deleteResume(fp);
        }
        for (const l of completionListeners) l(finalItem);
      }
      get().actions._runQueue();
    },

    _markFailed: (id, error) => {
      set((s) => {
        const item = s.items[id];
        if (!item) return s;
        const active = new Set(s.active);
        active.delete(id);
        return {
          items: {
            ...s.items,
            [id]: { ...item, status: "failed", lastError: error },
          },
          active,
        };
      });
      // Don't delete resume entry on failure — user might Retry, and the
      // already-uploaded parts on S3 are worth keeping.
      get().actions._runQueue();
    },

    _markCanceled: (id) => {
      set((s) => {
        const item = s.items[id];
        if (!item || item.status === "canceled") return s;
        const active = new Set(s.active);
        active.delete(id);
        return {
          items: {
            ...s.items,
            [id]: { ...item, status: "canceled" },
          },
          active,
        };
      });
      get().actions._runQueue();
    },

    _runQueue: () => {
      const s = get();
      const slots = s.maxConcurrent - s.active.size;
      if (slots <= 0 || s.queue.length === 0) return;
      const toStart = s.queue.slice(0, slots);
      set((s2) => {
        const queue = s2.queue.slice(toStart.length);
        const active = new Set(s2.active);
        for (const id of toStart) active.add(id);
        return { queue, active };
      });
      for (const id of toStart) runUpload(id);
    },
  },
}));

/**
 * On user cancel: call the multipart abort endpoint to free server-side
 * state and drop the resume entry. Fire-and-forget — we don't block the UI
 * on this. If the abort itself fails (network down, server restarted) the
 * partial upload becomes the backend's garbage to collect.
 */
function cleanupMultipartIfPresent(item: UploadItem): void {
  if (item.strategy !== "multipart" || !item.uploadId) return;
  const fp = fingerprint({
    connectionId: item.connectionId,
    bucket: item.bucket,
    key: item.key,
    size: item.size,
    lastModified: item.lastModified,
  });
  deleteResume(fp);
  const qs = new URLSearchParams({
    uploadId: item.uploadId,
    key: item.key,
  });
  // Routes through the global queue at ABORT_PRIORITY so a cancel-all of many
  // multipart uploads doesn't fire a dozen simultaneous DELETEs alongside
  // still-active part PUTs from other files.
  globalUploadQueue
    .run(ABORT_PRIORITY, undefined, () =>
      fetch(
        `/api/connections/${item.connectionId}/buckets/${encodeURIComponent(
          item.bucket
        )}/objects/multipart?${qs}`,
        { method: "DELETE" }
      )
    )
    .catch(() => {
      // Best effort — server abort might fail, the local cancel still proceeds.
    });
}

/**
 * Per-row subscription. Each row reads only its own item so a progress tick
 * on row #4 doesn't re-render rows #1–3.
 */
export function useUploadItem(id: string): UploadItem | undefined {
  return useUploadsStore((s) => s.items[id]);
}
