import {
  useUploadsStore,
  type UploadItem,
  type UploadPart,
} from "@/stores/uploads";
import {
  COMPLETE_PRIORITY,
  CREATE_PRIORITY,
  globalUploadQueue,
  LIST_PRIORITY,
  PART_PRIORITY,
} from "./upload-queue";

/**
 * Upload worker — runs one file to completion via either a single PUT or S3
 * multipart, depending on the item's strategy. Single + multipart share the
 * same outer contract (progress polling, EMA speed/ETA, retry policy, abort)
 * so the panel and store don't care which path ran.
 *
 * Transport: each PUT goes browser → S3 backend *directly*, using a presigned
 * URL minted by our server. Bytes never touch our process, so XHR
 * `upload.onprogress` reports honest wire bytes and backend errors surface as
 * real HTTP responses (not wrapped 502s from a proxy timeout). The multipart
 * control plane (CreateMultipartUpload / ListParts / Complete / Abort) still
 * goes through the server — those are small JSON round-trips and benefit from
 * the server's uniform error envelope.
 *
 * Design references:
 *   - Single-PUT progress polling: teldrive's upload-file.ts (per-event writes
 *     to a local var, 150ms interval flushes to store)
 *   - Multipart driver: Uppy's MultipartUploader (deferred Blob slicing, null
 *     out chunks after upload to avoid Chromium ERR_OUT_OF_MEMORY, per-part
 *     concurrency via a small pool, parts skipped on resume)
 */

const PROGRESS_TICK_MS = 150;
const SPEED_EMA_ALPHA = 0.3;
/** After this long without forward progress, treat the upload as stalled and
 *  report speed=0 / eta=null. Stops the EMA from decaying to a few B/s during
 *  a retry loop and producing 18000h ETAs. */
const STALL_MS = 5000;

// Retry backoff — same delays Uppy uses for AWS S3 multipart. First retry is
// immediate (transient blip), then 1s / 3s / 5s with jitter. 5 total attempts
// (1 initial + 4 retries).
const FILE_RETRY_DELAYS_MS = [0, 1000, 3000, 5000];
const FILE_MAX_ATTEMPTS = 5;
const PART_RETRY_DELAYS_MS = [0, 1000, 3000, 5000];
const PART_MAX_ATTEMPTS = 5;

// Multipart sizing — S3 requires ≥5 MB per part (except the last), ≤10k parts.
// 5 MB minimum is what Uppy defaults to as well.
const DEFAULT_PART_SIZE = 5 * 1024 * 1024;
const MAX_PARTS = 10_000;
/** Per-file part-worker count. The real rate limiter is the global queue's
 *  6-slot cap; this just sets how many workers a single file may spawn so it
 *  can fully consume those slots when running alone. With multiple active
 *  files, their workers fairly contend for slots in the global queue. */
const PART_CONCURRENCY = 6;

export async function runUpload(id: string): Promise<void> {
  const item = useUploadsStore.getState().items[id];
  if (!item) return;
  if (item.strategy === "multipart") {
    await runMultipart(id);
  } else {
    await runSingle(id);
  }
}

// ─── Single PUT ─────────────────────────────────────────────────────────────

async function runSingle(id: string): Promise<void> {
  for (let attempt = 0; attempt < FILE_MAX_ATTEMPTS; attempt++) {
    const item = useUploadsStore.getState().items[id];
    if (!item) return;
    if (item.status === "canceled" || item.status === "paused") return;
    try {
      await runSingleOnce(item);
      useUploadsStore.getState().actions._markCompleted(id);
      return;
    } catch (err) {
      if (isAbort(err)) {
        // Pause aborts the controller too — leave status alone in that case
        // so the row stays "paused" instead of flipping to "canceled".
        if (useUploadsStore.getState().items[id]?.status === "paused") return;
        useUploadsStore.getState().actions._markCanceled(id);
        return;
      }
      const status = getStatus(err);
      const nonRetriable = isNonRetriable(status);
      const lastAttempt = attempt === FILE_MAX_ATTEMPTS - 1;
      if (nonRetriable || lastAttempt) {
        useUploadsStore.getState().actions._markFailed(id, errorMessage(err));
        return;
      }
      const base = FILE_RETRY_DELAYS_MS[attempt] ?? 5000;
      await sleep(base * jitter());
    }
  }
}

async function runSingleOnce(item: UploadItem): Promise<void> {
  const actions = useUploadsStore.getState().actions;
  actions._markUploading(item.id);

  let bytes = 0;
  const tracker = createSpeedTracker();
  const flush = () => {
    const { speed, eta } = tracker.tick(bytes, item.size);
    useUploadsStore.getState().actions._setProgress(item.id, bytes, speed, eta);
  };

  const ticker = window.setInterval(flush, PROGRESS_TICK_MS);
  try {
    const { url } = await presignSingleUploadUrl(item);
    await globalUploadQueue.run(PART_PRIORITY, item.controller.signal, () =>
      xhrPut({
        url,
        body: item.file,
        contentType: item.contentType,
        signal: item.controller.signal,
        onProgress: (loaded) => {
          bytes = loaded;
        },
      })
    );
    bytes = item.size;
    flush();
  } finally {
    window.clearInterval(ticker);
  }
}

async function presignSingleUploadUrl(
  item: UploadItem
): Promise<{ url: string }> {
  const qs = new URLSearchParams({ key: item.key });
  const url = `/api/connections/${item.connectionId}/buckets/${encodeURIComponent(
    item.bucket
  )}/objects/presign/upload?${qs}`;
  const res = await fetch(url, {
    method: "POST",
    signal: item.controller.signal,
  });
  if (!res.ok) throw await fetchError(res);
  return res.json();
}

// ─── Multipart ──────────────────────────────────────────────────────────────

async function runMultipart(id: string): Promise<void> {
  const initial = useUploadsStore.getState().items[id];
  if (!initial) return;
  if (initial.status === "canceled" || initial.status === "paused") return;
  useUploadsStore.getState().actions._markUploading(id);

  try {
    // 1) Bootstrap: ensure uploadId + parts list exist. May reuse a resume
    //    entry pre-populated by addFiles, may verify with ListParts, or may
    //    have to call CreateMultipartUpload from scratch.
    const bootstrap = await bootstrapMultipart(initial);

    // 2) Per-file progress aggregation across N parts. The worker keeps the
    //    per-part bytes in plain arrays (not state) and the ticker flushes
    //    the sum every 150ms. Same trick as single-PUT: avoid render storms.
    const partBytes: number[] = bootstrap.parts.map((p) =>
      p.done ? p.size : 0
    );
    const tracker = createSpeedTracker(sum(partBytes));
    const flush = () => {
      const totalBytes = sum(partBytes);
      const { speed, eta } = tracker.tick(totalBytes, initial.size);
      useUploadsStore
        .getState()
        .actions._setProgress(id, totalBytes, speed, eta);
    };
    const ticker = window.setInterval(flush, PROGRESS_TICK_MS);

    try {
      // 3) Run a small per-file pool of part uploaders. Each worker pulls the
      //    next undone part. This is the simplest correct way to bound
      //    concurrency without an external library.
      const pending = bootstrap.parts
        .map((p, i) => ({ index: i, part: p }))
        .filter((x) => !x.part.done);
      await runPartPool({
        item: initial,
        bootstrap,
        pending,
        partBytes,
      });

      // 4) Final flush so the row shows 100% before "completed" lands.
      for (let i = 0; i < partBytes.length; i++) {
        partBytes[i] = bootstrap.parts[i].size;
      }
      flush();
    } finally {
      window.clearInterval(ticker);
    }

    // 5) Complete. Pull the latest parts from the store — _markPartDone has
    //    been writing etags as uploads finished.
    const latest = useUploadsStore.getState().items[id];
    if (!latest || !latest.parts || !latest.uploadId) {
      throw new Error("Multipart state lost mid-upload");
    }
    await completeMultipart(latest);
    useUploadsStore.getState().actions._markCompleted(id);
  } catch (err) {
    if (isAbort(err)) {
      // Same as runSingle: pause aborts the controller; preserve status.
      if (useUploadsStore.getState().items[id]?.status === "paused") return;
      useUploadsStore.getState().actions._markCanceled(id);
      return;
    }
    useUploadsStore.getState().actions._markFailed(id, errorMessage(err));
  }
}

interface MultipartBootstrap {
  uploadId: string;
  partSize: number;
  parts: UploadPart[];
}

/**
 * Resolve to a verified multipart state. Three paths:
 *   - Fresh upload: CreateMultipartUpload, build parts from chosen partSize
 *   - Resume from store/localStorage: ListParts to confirm S3 still has the
 *     parts; carry forward any matches, re-mark the rest as undone
 *   - Stale resume: backend says NoSuchUpload → drop and start fresh
 */
async function bootstrapMultipart(
  item: UploadItem
): Promise<MultipartBootstrap> {
  if (item.uploadId && item.partSize && item.parts) {
    // Resume path — verify with ListParts.
    try {
      const remoteParts = await listMultipartParts(item, item.uploadId);
      const remoteByNum = new Map(remoteParts.map((p) => [p.partNumber, p]));
      const parts = item.parts.map<UploadPart>((p) => {
        const remote = remoteByNum.get(p.partNumber);
        if (remote && remote.size === p.size) {
          return {
            ...p,
            uploaded: p.size,
            etag: remote.etag,
            done: true,
          };
        }
        return { ...p, uploaded: 0, etag: undefined, done: false };
      });
      useUploadsStore
        .getState()
        .actions._setMultipartState(
          item.id,
          item.uploadId,
          item.partSize,
          parts
        );
      return { uploadId: item.uploadId, partSize: item.partSize, parts };
    } catch (err) {
      // Common case: backend GC'd the multipart session. Fall through to fresh.
      const status = getStatus(err);
      if (status !== 404) {
        // Any other failure: surface — we can't safely retry without ListParts
        // because we'd risk uploading parts beyond S3's 10k cap on top of
        // unknown existing ones.
        throw err;
      }
    }
  }

  // Fresh CreateMultipartUpload.
  const partSize = pickPartSize(item.size);
  const parts = buildParts(item.size, partSize);
  const { uploadId } = await createMultipartUpload(item);
  useUploadsStore
    .getState()
    .actions._setMultipartState(item.id, uploadId, partSize, parts);
  return { uploadId, partSize, parts };
}

function pickPartSize(fileSize: number): number {
  // Same shape as Uppy's getChunkSize default: keep parts at the 5 MB minimum
  // until the file is too big to fit in 10k parts, then grow proportionally.
  return Math.max(DEFAULT_PART_SIZE, Math.ceil(fileSize / MAX_PARTS));
}

function buildParts(size: number, partSize: number): UploadPart[] {
  const totalParts = Math.max(1, Math.ceil(size / partSize));
  const parts: UploadPart[] = [];
  for (let i = 1; i <= totalParts; i++) {
    const partBytes =
      i < totalParts ? partSize : size - (totalParts - 1) * partSize;
    // S3 forbids 0-byte parts; pickPartSize is chosen to make this impossible
    // for non-empty files, but the last-part math is defensive.
    if (partBytes <= 0) continue;
    parts.push({
      partNumber: i,
      size: partBytes,
      uploaded: 0,
      done: false,
    });
  }
  return parts;
}

interface PoolArgs {
  item: UploadItem;
  bootstrap: MultipartBootstrap;
  pending: { index: number; part: UploadPart }[];
  partBytes: number[];
}

/**
 * Fixed-size pool: PART_CONCURRENCY workers each pulling the next pending
 * part off a shared cursor until the list is exhausted. Any error from a
 * worker propagates up (Promise.all rejects on first), which aborts the
 * whole multipart upload — the file-level controller stops the others.
 */
function runPartPool({
  item,
  bootstrap,
  pending,
  partBytes,
}: PoolArgs): Promise<void> {
  let cursor = 0;
  const next = () => {
    if (cursor >= pending.length) return null;
    return pending[cursor++];
  };
  const worker = async (): Promise<void> => {
    for (let task = next(); task !== null; task = next()) {
      if (item.controller.signal.aborted) {
        throw abortError();
      }
      await uploadOnePartWithRetry({
        item,
        uploadId: bootstrap.uploadId,
        partSize: bootstrap.partSize,
        part: task.part,
        onLiveBytes: (b) => {
          partBytes[task.index] = b;
        },
      });
      // Make sure the live tally lands on exact size when the part completes —
      // the last progress event might fire below total due to throttling.
      partBytes[task.index] = task.part.size;
    }
  };
  const workers = Array.from(
    { length: Math.min(PART_CONCURRENCY, pending.length || 1) },
    worker
  );
  return Promise.all(workers).then(() => undefined);
}

interface PartUploadArgs {
  item: UploadItem;
  uploadId: string;
  partSize: number;
  part: UploadPart;
  onLiveBytes: (loaded: number) => void;
}

async function uploadOnePartWithRetry(args: PartUploadArgs): Promise<void> {
  for (let attempt = 0; attempt < PART_MAX_ATTEMPTS; attempt++) {
    if (args.item.controller.signal.aborted) throw abortError();
    try {
      const etag = await uploadOnePart(args);
      useUploadsStore
        .getState()
        .actions._markPartDone(args.item.id, args.part.partNumber, etag);
      return;
    } catch (err) {
      if (isAbort(err)) throw err;
      const status = getStatus(err);
      const nonRetriable = isNonRetriable(status);
      const lastAttempt = attempt === PART_MAX_ATTEMPTS - 1;
      if (nonRetriable || lastAttempt) {
        throw new Error(
          `Part ${args.part.partNumber} failed: ${errorMessage(err)}`
        );
      }
      // Reset the live tally so the bar doesn't visually rewind weirdly.
      args.onLiveBytes(0);
      const base = PART_RETRY_DELAYS_MS[attempt] ?? 8000;
      await sleep(base * jitter());
    }
  }
}

async function uploadOnePart({
  item,
  uploadId,
  partSize,
  part,
  onLiveBytes,
}: PartUploadArgs): Promise<string> {
  const start = (part.partNumber - 1) * partSize;
  const end = start + part.size;
  // Defer the Blob slice until we're actually about to upload — keeps memory
  // bounded to (PART_CONCURRENCY × partSize) of in-flight Blob refs at peak.
  const blob = item.file.slice(start, end);
  // Mint a fresh URL per attempt: if a previous attempt sat in retry backoff
  // long enough for the URL to expire (15min TTL), the next attempt would
  // otherwise fail with SignatureDoesNotMatch.
  const { url } = await presignPartUrl(item, uploadId, part.partNumber);
  const res = await globalUploadQueue.run(
    PART_PRIORITY,
    item.controller.signal,
    () =>
      xhrPut({
        url,
        body: blob,
        contentType: "application/octet-stream",
        signal: item.controller.signal,
        onProgress: onLiveBytes,
      })
  );
  // S3 returns the ETag in a response header; CORS on telegram-s3 exposes it
  // via Access-Control-Expose-Headers. Header names are case-insensitive but
  // we check both for paranoia across backends.
  const etag = res.header("etag") ?? res.header("ETag");
  if (!etag) {
    throw new Error("Backend did not return ETag header (CORS not exposing it?)");
  }
  return etag;
}

async function presignPartUrl(
  item: UploadItem,
  uploadId: string,
  partNumber: number
): Promise<{ url: string }> {
  const qs = new URLSearchParams({
    uploadId,
    key: item.key,
    partNumber: String(partNumber),
  });
  const url = `/api/connections/${item.connectionId}/buckets/${encodeURIComponent(
    item.bucket
  )}/objects/presign/part?${qs}`;
  const res = await fetch(url, {
    method: "POST",
    signal: item.controller.signal,
  });
  if (!res.ok) throw await fetchError(res);
  return res.json();
}

// ─── HTTP wrappers ──────────────────────────────────────────────────────────

interface XhrArgs {
  url: string;
  body: Blob;
  contentType: string;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
}

interface XhrResult {
  body: string;
  /** Case-insensitive header lookup. Null when the header isn't present (which
   *  includes CORS-blocked: cross-origin XHR can only see headers whitelisted
   *  by Access-Control-Expose-Headers). */
  header: (name: string) => string | null;
}

/**
 * One PUT request with `xhr.upload.onprogress` events. Returns body + a header
 * accessor so multipart can pull the ETag from response headers (single PUT
 * doesn't need either, but doesn't pay extra to receive them).
 */
function xhrPut(args: XhrArgs): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", args.url, true);
    xhr.setRequestHeader("Content-Type", args.contentType);

    const onAbort = () => xhr.abort();
    args.signal.addEventListener("abort", onAbort);
    const cleanup = () => args.signal.removeEventListener("abort", onAbort);
    if (args.signal.aborted) {
      onAbort();
      cleanup();
      reject(abortError());
      return;
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) args.onProgress(e.loaded);
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          body: xhr.responseText,
          header: (name) => xhr.getResponseHeader(name),
        });
      } else reject(httpError(xhr));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error during upload"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(abortError());
    };
    xhr.send(args.body);
  });
}

// ─── Multipart control-plane HTTPs (small JSON requests) ────────────────────

async function createMultipartUpload(
  item: UploadItem
): Promise<{ uploadId: string }> {
  const url = `/api/connections/${item.connectionId}/buckets/${encodeURIComponent(
    item.bucket
  )}/objects/multipart/start`;
  return globalUploadQueue.run(
    CREATE_PRIORITY,
    item.controller.signal,
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: item.key, contentType: item.contentType }),
        signal: item.controller.signal,
      });
      if (!res.ok) throw await fetchError(res);
      return res.json();
    }
  );
}

async function listMultipartParts(
  item: UploadItem,
  uploadId: string
): Promise<{ partNumber: number; etag: string; size: number }[]> {
  const qs = new URLSearchParams({ uploadId, key: item.key });
  const url = `/api/connections/${item.connectionId}/buckets/${encodeURIComponent(
    item.bucket
  )}/objects/multipart/parts?${qs}`;
  return globalUploadQueue.run(
    LIST_PRIORITY,
    item.controller.signal,
    async () => {
      const res = await fetch(url, { signal: item.controller.signal });
      if (!res.ok) throw await fetchError(res);
      const json = (await res.json()) as {
        parts: { partNumber: number; etag: string; size: number }[];
      };
      return json.parts;
    }
  );
}

async function completeMultipart(item: UploadItem): Promise<void> {
  if (!item.uploadId || !item.parts) {
    throw new Error("Cannot complete: missing uploadId or parts");
  }
  const parts = item.parts
    .filter((p) => p.done && p.etag)
    .map((p) => ({ partNumber: p.partNumber, etag: p.etag! }));
  if (parts.length !== item.parts.length) {
    throw new Error(
      `Cannot complete: ${item.parts.length - parts.length} parts incomplete`
    );
  }
  const qs = new URLSearchParams({ uploadId: item.uploadId, key: item.key });
  const url = `/api/connections/${item.connectionId}/buckets/${encodeURIComponent(
    item.bucket
  )}/objects/multipart/complete?${qs}`;
  return globalUploadQueue.run(
    COMPLETE_PRIORITY,
    item.controller.signal,
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts }),
        signal: item.controller.signal,
      });
      if (!res.ok) throw await fetchError(res);
    }
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Stall-aware progress → speed/ETA. Two failure modes the dumb EMA had:
 *   1) Retry resets `bytes` backward (a failing part wipes its live counter).
 *      Feeding `inst = (bytes - lastBytes) / dt` into the EMA when bytes drops
 *      contributes 0 every tick → speed decays toward 0 → ETA blows up to
 *      thousands of hours.
 *   2) Long stalls (server pause, retry backoff) keep `bytes` constant. Same
 *      symptom — EMA crawls toward 0 but never reports the stall *honestly*.
 *
 * Rules:
 *   - Only blend new instant-speed samples when bytes moves forward.
 *   - If no forward motion for STALL_MS, report speed=0 / eta=null. The UI
 *     can then render "Stalled" instead of "4 B/s · 18000h".
 */
function createSpeedTracker(initialBytes = 0): {
  tick: (bytes: number, totalSize: number) => { speed: number; eta: number | null };
} {
  const now0 = performance.now();
  let speed = 0;
  let lastBytes = initialBytes;
  let lastTick = now0;
  let lastForwardTick = now0;
  return {
    tick(bytes, totalSize) {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      if (bytes > lastBytes && dt > 0) {
        const inst = (bytes - lastBytes) / dt;
        speed = speed === 0 ? inst : SPEED_EMA_ALPHA * inst + (1 - SPEED_EMA_ALPHA) * speed;
        lastForwardTick = now;
      } else if (now - lastForwardTick > STALL_MS) {
        speed = 0;
      }
      lastBytes = bytes;
      lastTick = now;
      const remaining = totalSize - bytes;
      const eta = speed > 0 ? remaining / speed : null;
      return { speed, eta };
    },
  };
}

function sum(arr: number[]): number {
  let total = 0;
  for (const n of arr) total += n;
  return total;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(): number {
  return 0.5 + Math.random();
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

function getStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

/** 4xx (except 408 Request Timeout, 429 Too Many Requests) = client error, not worth retrying. */
function isNonRetriable(status: number | undefined): boolean {
  if (status == null) return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function httpError(xhr: XMLHttpRequest): Error {
  const msg =
    parseError(xhr.responseText) ?? `Upload failed (HTTP ${xhr.status})`;
  const err = new Error(msg);
  (err as Error & { status?: number }).status = xhr.status;
  return err;
}

async function fetchError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");
  const msg = parseError(body) ?? `Request failed (HTTP ${res.status})`;
  const err = new Error(msg);
  (err as Error & { status?: number }).status = res.status;
  return err;
}

function parseError(body: string): string | null {
  try {
    const obj = JSON.parse(body);
    if (typeof obj?.detail === "string") return obj.detail;
    if (typeof obj?.error === "string") return obj.error;
  } catch {
    // not JSON
  }
  // S3 backends (telegram-s3 included) return errors as XML:
  //   <Error><Code>SignatureDoesNotMatch</Code><Message>...</Message></Error>
  const msg = body.match(/<Message>([^<]+)<\/Message>/);
  if (msg) {
    const code = body.match(/<Code>([^<]+)<\/Code>/);
    return code ? `${code[1]}: ${msg[1]}` : msg[1];
  }
  return null;
}
