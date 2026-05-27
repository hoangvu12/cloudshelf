/**
 * Browser-side ZIP bundling for "Download as ZIP" on a multi-selection.
 *
 * Flow:
 *   1. Caller picks the entries (files and/or folders) and asks `gatherZipEntries`
 *      to expand any folder into its full recursive object list — uses the
 *      existing paginated listing route, so the server never sees a ZIP request.
 *   2. `downloadEntriesAsZip` mints presigned GETs in parallel-throttled
 *      batches, then streams each response body into `client-zip` one at a time
 *      (downloadZip pulls from the async iterable serially, matching the
 *      browser's per-host connection budget without any extra throttling).
 *   3. The final Blob is handed to a hidden `<a download>` so the OS picks the
 *      filename. Buffered in memory — the 10 GB hard cap below is the wall.
 *
 * Bytes flow browser ↔ S3 directly; the server is touched only for the cheap
 * presign round-trips.
 */
import { downloadZip } from "client-zip";

import { apiFetch } from "@/lib/api/client";
import { fetchDownloadUrl } from "@/lib/api/objects";
import { basename, normalizePrefix } from "@/lib/object-path";
import type { ListObjectsPage, S3Entry, S3ObjectEntry } from "@server/types";

/** Browser per-host connection budget is ~6; mirror it so the presign burst
 *  doesn't queue behind itself. The fetches afterward are serial (client-zip
 *  pulls one at a time), so this only matters for the upfront URL mint. */
const PRESIGN_CONCURRENCY = 6;
/** Soft prompt before the zip starts — large zips buffer in browser memory. */
export const SOFT_WARN_BYTES = 2 * 1024 ** 3;
/** Refuse outright above this — Blob URLs cap around here on most browsers. */
export const HARD_CAP_BYTES = 10 * 1024 ** 3;
/** Generous TTL: a slow link finishing a 9 GB zip can take a while. */
const ZIP_PRESIGN_TTL_SECONDS = 60 * 60;

export interface ZipEntry {
  /** Full S3 key (used for the presign + lookup). */
  key: string;
  /** Path inside the produced ZIP, e.g. "vacation/IMG_4021.jpg". */
  name: string;
  /** Optional: surface S3's LastModified as the ZIP entry mtime. */
  lastModified?: string;
  /** Optional: included so callers can sum for the soft/hard caps. */
  size?: number;
}

export class ZipDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipDownloadError";
  }
}

export function totalZipBytes(entries: ZipEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
}

/**
 * Expand a mixed selection of files + folders into a flat ZipEntry list.
 *
 * Folder names inside the ZIP are made relative to `currentPrefix` so the
 * archive structure mirrors what the user sees in the browser — e.g. selecting
 * `photos/2025/` while browsing `photos/` yields entries like
 * `2025/IMG_4021.jpg` rather than the full key.
 */
export async function gatherZipEntries(
  connectionId: string,
  bucket: string,
  selected: S3Entry[],
  currentPrefix: string
): Promise<ZipEntry[]> {
  const base = normalizePrefix(currentPrefix);
  const stripBase = (key: string) =>
    key.startsWith(base) ? key.slice(base.length) : key;

  const out: ZipEntry[] = [];
  for (const entry of selected) {
    if (entry.type === "object") {
      const name = stripBase(entry.key) || basename(entry.key);
      if (!name) continue;
      out.push({
        key: entry.key,
        name,
        lastModified: entry.lastModified,
        size: entry.size,
      });
      continue;
    }
    const all = await listAllInPrefix(connectionId, bucket, entry.prefix);
    for (const obj of all) {
      const name = stripBase(obj.key);
      if (!name || name.endsWith("/")) continue;
      out.push({
        key: obj.key,
        name,
        lastModified: obj.lastModified,
        size: obj.size,
      });
    }
  }
  return out;
}

/**
 * BFS walk through every sub-prefix under `prefix`, paginating each level via
 * the existing delimiter-based listing endpoint. Slower than a flat
 * `Delimiter=undefined` listing would be, but it keeps Phase 4 fully
 * server-changeless per spec.
 */
async function listAllInPrefix(
  connectionId: string,
  bucket: string,
  prefix: string
): Promise<S3ObjectEntry[]> {
  const queue: string[] = [normalizePrefix(prefix)];
  const out: S3ObjectEntry[] = [];

  while (queue.length > 0) {
    const next = queue.shift()!;
    let token: string | undefined;
    do {
      const qs = new URLSearchParams();
      if (next) qs.set("prefix", next);
      if (token) qs.set("continuationToken", token);
      const page = await apiFetch<ListObjectsPage>(
        `/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/objects?${qs.toString()}`
      );
      for (const e of page.entries) {
        if (e.type === "object") {
          // Skip the bucket's own folder-marker zero-byte object.
          if (e.key === next) continue;
          out.push(e);
        } else {
          queue.push(e.prefix);
        }
      }
      token = page.nextContinuationToken;
    } while (token);
  }

  return out;
}

/**
 * Mint URLs, stream into client-zip, trigger a download. Caller is responsible
 * for the size-cap UX (warn / abort) before getting here.
 */
export async function downloadEntriesAsZip(
  connectionId: string,
  bucket: string,
  entries: ZipEntry[],
  filename: string
): Promise<void> {
  if (entries.length === 0) {
    throw new ZipDownloadError("Nothing to download");
  }

  const urls = new Map<string, string>();
  let cursor = 0;
  async function presignWorker() {
    while (cursor < entries.length) {
      const idx = cursor++;
      const e = entries[idx]!;
      const presigned = await fetchDownloadUrl(
        connectionId,
        bucket,
        e.key,
        ZIP_PRESIGN_TTL_SECONDS
      );
      urls.set(e.key, presigned.url);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(PRESIGN_CONCURRENCY, entries.length) },
      presignWorker
    )
  );

  async function* zipInputs() {
    for (const e of entries) {
      const url = urls.get(e.key);
      if (!url) throw new ZipDownloadError(`Missing presigned URL for ${e.key}`);
      const res = await fetch(url);
      if (!res.ok) {
        throw new ZipDownloadError(
          `Couldn't fetch ${e.name}: HTTP ${res.status}`
        );
      }
      yield {
        name: e.name,
        input: res,
        lastModified: e.lastModified ? new Date(e.lastModified) : undefined,
        size: e.size,
      };
    }
  }

  const blob = await downloadZip(zipInputs()).blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Defer revoke so the browser has time to start the download. 60s is well
    // past any realistic save-dialog dwell.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
