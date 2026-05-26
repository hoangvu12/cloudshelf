/**
 * Resume-state persistence for in-flight multipart uploads.
 *
 * The browser can't keep a File object alive across page reloads, but it CAN
 * remember the S3 multipart UploadId and which parts already landed. When the
 * user re-adds the same file (matched by name + size + lastModified +
 * connection + bucket + key) we look up the saved state, call ListParts to
 * verify the backend still has those parts, and resume from there.
 *
 * Cleaned up on TTL (24h) so abandoned uploads don't leak local storage.
 *
 * Storage shape:
 *   localStorage["cloudshelf:multipart:v1"] = {
 *     [fingerprint]: { uploadId, partSize, completedParts: [...], createdAt }
 *   }
 */

const LS_KEY = "cloudshelf:multipart:v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface ResumePart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface ResumeEntry {
  /** S3 multipart upload identifier returned by CreateMultipartUpload. */
  uploadId: string;
  /** Byte size per part the original upload chose. We honor it on resume so
   *  part boundaries line up with what's already on S3. */
  partSize: number;
  completedParts: ResumePart[];
  /** Unix ms — used for TTL cleanup. */
  createdAt: number;
}

/**
 * Identity for a (file, target) pair. The file's `lastModified` participates
 * so editing the file invalidates the resume — re-uploading a changed file
 * with the old uploadId would silently produce a corrupted object.
 */
export function fingerprint(input: {
  connectionId: string;
  bucket: string;
  key: string;
  size: number;
  lastModified: number;
}): string {
  return [
    input.connectionId,
    input.bucket,
    input.key,
    input.size,
    input.lastModified,
  ].join("::");
}

function readAll(): Record<string, ResumeEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // corrupted entry — drop it
  }
  return {};
}

function writeAll(data: Record<string, ResumeEntry>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // quota / privacy mode — resume is best-effort, swallow
  }
}

export function getResume(fp: string): ResumeEntry | null {
  const all = readAll();
  const entry = all[fp];
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    deleteResume(fp);
    return null;
  }
  return entry;
}

export function setResume(fp: string, entry: ResumeEntry): void {
  const all = readAll();
  all[fp] = entry;
  writeAll(all);
}

/** Patch the completedParts list, preserving uploadId/partSize/createdAt. */
export function pushCompletedPart(fp: string, part: ResumePart): void {
  const all = readAll();
  const entry = all[fp];
  if (!entry) return;
  // Replace if a previous attempt already recorded this partNumber (e.g.
  // re-upload of a failed part); otherwise append.
  const idx = entry.completedParts.findIndex(
    (p) => p.partNumber === part.partNumber
  );
  if (idx >= 0) entry.completedParts[idx] = part;
  else entry.completedParts.push(part);
  writeAll(all);
}

export function deleteResume(fp: string): void {
  const all = readAll();
  if (fp in all) {
    delete all[fp];
    writeAll(all);
  }
}

/**
 * Drop any entries past their TTL. Cheap — call on app boot.
 */
export function pruneStaleResume(): void {
  const all = readAll();
  const now = Date.now();
  let changed = false;
  for (const [fp, entry] of Object.entries(all)) {
    if (now - entry.createdAt > TTL_MS) {
      delete all[fp];
      changed = true;
    }
  }
  if (changed) writeAll(all);
}
