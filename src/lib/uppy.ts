/**
 * Singleton Uppy instance + @uppy/aws-s3 wiring.
 *
 * Backend routes (unchanged from the pre-Uppy worker):
 *   - POST   /multipart/start
 *   - POST   /presign/part      (per part, presigned PUT URL)
 *   - GET    /multipart/parts   (resume: list already-uploaded parts)
 *   - POST   /multipart/complete
 *   - DELETE /multipart         (abort)
 *   - POST   /presign/upload    (single-shot < 100MB)
 *
 * Resume across page reload uses the existing upload-resume.ts localStorage
 * format (uploadId + completed part etags, keyed by file fingerprint). The
 * createMultipartUpload callback short-circuits to a saved uploadId when
 * present; Uppy's listParts call then skips the parts that already landed.
 */

import Uppy, { type UppyFile } from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import GoldenRetriever from "@uppy/golden-retriever";
import ThumbnailGenerator from "@uppy/thumbnail-generator";
import Compressor from "@uppy/compressor";
import {
  deleteResume,
  fingerprint,
  pruneStaleResume,
  pushCompletedPart,
  setResume,
} from "./upload-resume";
import { usePrefsStore } from "@/stores/prefs";

/** Files at or above this size use S3 multipart; below it use a single PUT.
 *  Same threshold @uppy/aws-s3 uses by default — under 100 MB the overhead of
 *  multipart (create + N round trips + complete) isn't worth it. */
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024;

export interface UploadMeta {
  connectionId: string;
  bucket: string;
  /** Full object key (prefix + filename). */
  key: string;
  /** Prefix the file is being uploaded *into* — used for query invalidation. */
  prefix: string;
}

type AnyMeta = Record<string, unknown>;

function readMeta(file: UppyFile<AnyMeta, AnyMeta>): UploadMeta {
  const m = file.meta as Partial<UploadMeta>;
  if (!m.connectionId || !m.bucket || !m.key) {
    throw new Error("Uppy file is missing connectionId/bucket/key meta");
  }
  return {
    connectionId: m.connectionId,
    bucket: m.bucket,
    key: m.key,
    prefix: m.prefix ?? "",
  };
}

function fpFor(file: UppyFile<AnyMeta, AnyMeta>): string {
  const meta = readMeta(file);
  const data = file.data as File;
  return fingerprint({
    connectionId: meta.connectionId,
    bucket: meta.bucket,
    key: meta.key,
    size: file.size ?? 0,
    lastModified: data.lastModified,
  });
}

function urlFor(connectionId: string, bucket: string, suffix: string): string {
  return `/api/connections/${connectionId}/buckets/${encodeURIComponent(
    bucket
  )}/objects/${suffix}`;
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

/**
 * Compressor that only operates on files whose meta.compressImages is true.
 * Lets the pref toggle (or per-batch override) decide compression per file
 * without us having to add/remove plugins at runtime.
 *
 * The base plugin's prepareUpload is the function registered as a
 * pre-processor; we narrow the fileIDs list before delegating. Filtered-out
 * files still need preprocess-progress/complete emitted so Uppy's
 * preprocessing barrier knows they're done with *this* preprocessor.
 */
class GatedCompressor extends Compressor<AnyMeta, AnyMeta> {
  async prepareUpload(fileIDs: string[]): Promise<void> {
    const toCompress: string[] = [];
    const toSkip: string[] = [];
    for (const id of fileIDs) {
      const file = this.uppy.getFile(id);
      if (file && file.meta.compressImages === true) {
        toCompress.push(id);
      } else {
        toSkip.push(id);
      }
    }
    for (const id of toSkip) {
      const file = this.uppy.getFile(id);
      if (file) this.uppy.emit("preprocess-complete", file);
    }
    if (toCompress.length === 0) return;
    return super.prepareUpload(toCompress);
  }
}

let uppyInstance: Uppy<AnyMeta, AnyMeta> | null = null;

export function getUppy(): Uppy<AnyMeta, AnyMeta> {
  if (uppyInstance) return uppyInstance;
  pruneStaleResume();

  const uppy = new Uppy<AnyMeta, AnyMeta>({
    // Stable ID across page loads — GoldenRetriever uses it to key its
    // localStorage entries, so changing this name throws away any pending
    // upload state.
    id: "cloudshelf",
    autoProceed: true,
    allowMultipleUploadBatches: true,
    debug: false,
  });

  // Auto-restore files after a refresh / crash. Caches blob data in
  // IndexedDB (no Service Worker → no extra public/ file to ship). Without
  // overrides the default limits are 10 MiB per file / 300 MiB total —
  // far too conservative for the kind of media transfers this app sees, so
  // we lift them to roughly what a browser will let IDB hold (a single
  // object can normally exceed 1 GiB; total origin quota is browser-set
  // and ranges from a few GiB upward). Anything past the browser's actual
  // quota fails to write and falls through to the manual re-drop path,
  // which uploads.ts handles via file.s3Multipart from upload-resume.ts.
  const GiB = 1024 * 1024 * 1024;
  uppy.use(GoldenRetriever, {
    serviceWorker: false,
    expires: 24 * 60 * 60 * 1000,
    // maxFileSize / maxTotalSize aren't in the published GoldenRetriever
    // option types but the plugin spreads `indexedDB` straight into its
    // IndexedDBStore constructor (see node_modules/@uppy/golden-retriever
    // /lib/IndexedDBStore.js), which honors both.
    indexedDB: {
      maxFileSize: 2 * GiB,
      maxTotalSize: 5 * GiB,
    } as unknown as { name?: string; version?: number },
  });

  // Generate small data-URL previews for image files so the upload panel can
  // show real thumbnails instead of a generic file icon. Headless usage: no
  // target — we just listen for `thumbnail:generated` in stores/uploads.ts.
  uppy.use(ThumbnailGenerator, {
    thumbnailWidth: 80,
    thumbnailType: "image/jpeg",
    waitForThumbnailsBeforeUpload: false,
  });

  // Image compression, gated per-file on `file.meta.compressImages`. The flag
  // is set in stores/uploads.ts addFiles() from whatever the pref was at the
  // moment the user dropped/picked the files, so the user's intent is locked
  // in even if they toggle the pref mid-upload. GatedCompressor below
  // filters fileIDs by that flag before delegating to Compressor's own
  // prepareUpload, so files explicitly tagged as "don't compress" pass
  // through untouched.
  uppy.use(GatedCompressor, {
    // CompressorJS default is 0.6, aggressive. 0.8 keeps the visible quality
    // intact while still shaving ~30-40% off typical photos.
    quality: 0.8,
    // Skip if the result wouldn't actually save anything (e.g. small PNG
    // screenshots, already-tiny JPEGs).
    convertSize: 1024 * 1024,
  });

  uppy.use(AwsS3, {
    // S3 multipart split decision matches the pre-Uppy worker.
    shouldUseMultipart: (file) => (file.size ?? 0) >= MULTIPART_THRESHOLD,

    getChunkSize: () => usePrefsStore.getState().multipartPartSize,

    // Same backoff schedule as the previous worker (also Uppy's default).
    retryDelays: [0, 1000, 3000, 5000],

    // Single dial for in-flight PUTs across the instance. Multiply the two
    // user prefs to roughly preserve "N files × M parts" total parallelism.
    limit:
      usePrefsStore.getState().concurrentUploads *
      usePrefsStore.getState().concurrentParts,

    // ─── Single-PUT path (file < threshold) ─────────────────────────────────

    getUploadParameters: async (file, options) => {
      const meta = readMeta(file);
      const qs = new URLSearchParams({ key: meta.key });
      const res = await fetch(
        `${urlFor(meta.connectionId, meta.bucket, "presign/upload")}?${qs}`,
        { method: "POST", signal: options?.signal }
      );
      const data = (await jsonOrThrow(res)) as { url: string };
      return {
        method: "PUT" as const,
        url: data.url,
        // Content-Type must match what was used to sign — presignSingleUpload
        // on the server signs with no fixed content-type, so we let the
        // browser send whatever the File knows.
        headers: file.type ? { "Content-Type": file.type } : undefined,
        fields: {},
      };
    },

    // ─── Multipart path ─────────────────────────────────────────────────────

    createMultipartUpload: async (file) => {
      // Restore mode (resume across reload) is wired through file.s3Multipart
      // in uploads.ts — Uppy's MultipartUploader sees that and routes through
      // resumeUploadFile() → listParts() instead of calling here at all. So
      // this path only runs for fresh uploads; always mint a new uploadId.
      const meta = readMeta(file);
      const res = await fetch(
        urlFor(meta.connectionId, meta.bucket, "multipart/start"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: meta.key, contentType: file.type }),
        }
      );
      const data = (await jsonOrThrow(res)) as {
        uploadId: string;
        key: string;
      };
      // Seed the resume entry so a future re-add of this same file finds it
      // and triggers restore mode. partSize is recorded so completedParts
      // can be checked against the right boundaries later.
      setResume(fpFor(file), {
        uploadId: data.uploadId,
        partSize: usePrefsStore.getState().multipartPartSize,
        completedParts: [],
        createdAt: Date.now(),
      });
      return { uploadId: data.uploadId, key: data.key };
    },

    signPart: async (file, { uploadId, key, partNumber, signal }) => {
      const meta = readMeta(file);
      const qs = new URLSearchParams({
        uploadId,
        key,
        partNumber: String(partNumber),
      });
      const res = await fetch(
        `${urlFor(meta.connectionId, meta.bucket, "presign/part")}?${qs}`,
        { method: "POST", signal }
      );
      const data = (await jsonOrThrow(res)) as { url: string };
      return { url: data.url };
    },

    listParts: async (file, { uploadId, key, signal }) => {
      const meta = readMeta(file);
      if (!uploadId || !key) throw new Error("listParts missing uploadId/key");
      const qs = new URLSearchParams({ uploadId, key });
      const res = await fetch(
        `${urlFor(meta.connectionId, meta.bucket, "multipart/parts")}?${qs}`,
        { signal }
      );
      const data = (await jsonOrThrow(res)) as {
        parts: { partNumber: number; etag: string; size: number }[];
      };
      return data.parts.map((p) => ({
        PartNumber: p.partNumber,
        Size: p.size,
        ETag: p.etag,
      }));
    },

    completeMultipartUpload: async (file, { uploadId, key, parts, signal }) => {
      const meta = readMeta(file);
      if (!uploadId || !key) {
        throw new Error("completeMultipartUpload missing uploadId/key");
      }
      const qs = new URLSearchParams({ uploadId, key });
      const res = await fetch(
        `${urlFor(meta.connectionId, meta.bucket, "multipart/complete")}?${qs}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: parts.map((p) => ({
              partNumber: p.PartNumber,
              etag: p.ETag,
            })),
          }),
          signal,
        }
      );
      const data = (await jsonOrThrow(res)) as { location?: string };
      // Resume entry has served its purpose — drop it so it doesn't loiter.
      deleteResume(fpFor(file));
      return { location: data.location };
    },

    abortMultipartUpload: async (file, { uploadId, key, signal }) => {
      const meta = readMeta(file);
      // Drop the local resume entry alongside the server-side abort, so a
      // future re-add starts cleanly instead of trying to reuse a dead upload.
      deleteResume(fpFor(file));
      if (!uploadId || !key) return;
      const qs = new URLSearchParams({ uploadId, key });
      await fetch(
        `${urlFor(meta.connectionId, meta.bucket, "multipart")}?${qs}`,
        { method: "DELETE", signal }
      );
    },
  });

  // GoldenRetriever waits for `restore-confirmed` before resuming any
  // restored uploads — normally Uppy Dashboard emits that after asking the
  // user "do you want to restore?". We're headless, so auto-confirm as soon
  // as `restored` fires. Without this, restored files sit idle and the
  // store's stall guard reports them as "Stalled · retrying…".
  uppy.on("restored", () => {
    uppy.emit("restore-confirmed");
  });

  // Mirror each completed part to localStorage so a page reload can resume
  // from the next missing part. Uppy emits this *after* the server has acked
  // the part with an ETag. The event payload doesn't carry size; we derive
  // it from the configured part size + total file size (last part is
  // smaller).
  uppy.on("s3-multipart:part-uploaded", (file, part) => {
    const typed = file as UppyFile<AnyMeta, AnyMeta>;
    const fp = fpFor(typed);
    const partSize = usePrefsStore.getState().multipartPartSize;
    const totalSize = typeof typed.size === "number" ? typed.size : 0;
    const totalParts = Math.max(1, Math.ceil(totalSize / partSize));
    const size =
      part.PartNumber < totalParts
        ? partSize
        : totalSize - (totalParts - 1) * partSize;
    pushCompletedPart(fp, {
      partNumber: part.PartNumber,
      etag: part.ETag,
      size,
    });
  });

  uppyInstance = uppy;
  return uppy;
}
