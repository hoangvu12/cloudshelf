/**
 * Global rate-limited queue for S3 traffic, shared across all in-flight
 * uploads. Modeled on Uppy's @uppy/utils/RateLimitedQueue.
 *
 * Why one global queue (not per-file):
 *   - Telegram-s3 has limited capacity per origin; bombing it with 12+
 *     simultaneous PUTs causes 502s from its MTProto layer.
 *   - With a global cap (default 6), one big file uploading alone gets all 6
 *     slots — fastest single-file throughput. When more files start, slots
 *     get round-robin'd between them via FIFO-within-priority.
 *
 * Why priorities:
 *   - `uploadPart` is Infinity so part transfers always jump the queue ahead
 *     of control-plane ops. Effect: dropping 5 files doesn't tie up slots
 *     with 5 simultaneous CreateMultipartUpload calls.
 *   - `createMultipartUpload` is -1 so new file bootstraps wait until active
 *     uploads have a slot to spare — finish one file mostly, then move on.
 *
 * Offline detection:
 *   - We pause the queue on `window.offline` and resume on `online`. Without
 *     this, every in-flight request would time out and burn retry attempts
 *     during e.g. a laptop sleep or train-tunnel scenario.
 */

const LIMIT = 6;

/** Part PUTs always jump the queue. */
export const PART_PRIORITY = Number.POSITIVE_INFINITY;
/** CompleteMultipartUpload — finishing a file is high-value. */
export const COMPLETE_PRIORITY = 1;
/** AbortMultipartUpload — frees server-side state, run it promptly. */
export const ABORT_PRIORITY = 1;
/** ListParts (resume verification). */
export const LIST_PRIORITY = 0;
/** CreateMultipartUpload — lowest; let active uploads finish first. */
export const CREATE_PRIORITY = -1;

interface Waiter {
  priority: number;
  resolve: () => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  cleanup?: () => void;
}

class RateLimitedQueue {
  readonly limit: number;
  private active = 0;
  private waiting: Waiter[] = [];
  private paused = false;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** Acquire a slot, run fn, release. Honors signal: if aborted before the
   *  slot is granted, removes from queue without ever calling fn. */
  async run<T>(
    priority: number,
    signal: AbortSignal | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    await this.acquire(priority, signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.tick();
  }

  private acquire(priority: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (!this.paused && this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { priority, resolve, reject, signal };
      // Higher priority first; FIFO within the same priority. Find the first
      // existing waiter we strictly outrank, insert before it; else push tail.
      const idx = this.waiting.findIndex((w) => priority > w.priority);
      if (idx === -1) this.waiting.push(waiter);
      else this.waiting.splice(idx, 0, waiter);

      if (signal) {
        const onAbort = () => {
          const i = this.waiting.indexOf(waiter);
          if (i !== -1) this.waiting.splice(i, 1);
          reject(abortError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        waiter.cleanup = () => signal.removeEventListener("abort", onAbort);
      }
    });
  }

  private release(): void {
    this.active--;
    this.tick();
  }

  private tick(): void {
    // Defer via microtask so a burst of release()s doesn't recursively dispatch
    // into deeply nested then-chains — same trick Uppy uses.
    queueMicrotask(() => {
      while (
        !this.paused &&
        this.active < this.limit &&
        this.waiting.length > 0
      ) {
        const next = this.waiting.shift()!;
        next.cleanup?.();
        this.active++;
        next.resolve();
      }
    });
  }
}

export const globalUploadQueue = new RateLimitedQueue(LIMIT);

if (typeof window !== "undefined") {
  // Initial state in case we boot offline.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    globalUploadQueue.pause();
  }
  window.addEventListener("offline", () => globalUploadQueue.pause());
  window.addEventListener("online", () => globalUploadQueue.resume());
}

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}
