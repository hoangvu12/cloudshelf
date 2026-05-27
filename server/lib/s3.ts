import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
  type StorageClass,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  Bucket,
  CreateConnectionInput,
  DeleteObjectsResult,
  ListObjectsPage,
  ObjectHead,
  ObjectTag,
  ObjectVersion,
  PresignedUrl,
  S3Connection,
  S3Entry,
  VersioningStatus,
} from "../types.ts";

/**
 * Build an S3 client for a given saved or unsaved connection.
 * Resolves the effective endpoint by honoring `forceSSL` (rewrites http→https).
 */
export function createS3Client(
  conn: S3Connection | CreateConnectionInput
): S3Client {
  const endpoint = conn.forceSSL
    ? conn.endpoint.replace(/^http:\/\//i, "https://")
    : conn.endpoint;

  return new S3Client({
    endpoint,
    region: conn.region,
    credentials: {
      accessKeyId: conn.accessKeyId,
      secretAccessKey: conn.secretAccessKey,
    },
    forcePathStyle: conn.forcePathStyle,
  });
}

/** Validate that the credentials/endpoint actually work by listing buckets. */
export async function probeConnection(
  conn: S3Connection | CreateConnectionInput
): Promise<{ ok: true; bucketCount: number } | { ok: false; error: string }> {
  const client = createS3Client(conn);
  try {
    const out = await client.send(new ListBucketsCommand({}));
    return { ok: true, bucketCount: out.Buckets?.length ?? 0 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    client.destroy();
  }
}

/** List buckets for a saved connection. */
export async function listBucketsForConnection(
  conn: S3Connection
): Promise<Bucket[]> {
  const client = createS3Client(conn);
  try {
    const out = await client.send(new ListBucketsCommand({}));
    return (out.Buckets ?? [])
      .filter((b) => b.Name)
      .map((b) => ({
        name: b.Name!,
        createdAt:
          b.CreationDate?.toISOString() ?? new Date(0).toISOString(),
      }));
  } finally {
    client.destroy();
  }
}

/**
 * Create a new bucket under a saved connection. Region is taken from the
 * connection's S3 client; we deliberately don't set a LocationConstraint here
 * because (a) for most S3-compatible endpoints it's ignored, and (b) for AWS,
 * the SDK already passes the client's region. Naming rules are validated on
 * the client; we surface any upstream error verbatim so users see the real
 * reason (BucketAlreadyExists, InvalidBucketName, …).
 */
export async function createBucketForConnection(
  conn: S3Connection,
  name: string
): Promise<{ name: string }> {
  const client = createS3Client(conn);
  try {
    await client.send(new CreateBucketCommand({ Bucket: name }));
    return { name };
  } finally {
    client.destroy();
  }
}

/** S3 caps a single ListObjectsV2 page at 1000 keys. */
const PAGE_SIZE = 1000;
/** Default lifetime for presigned URLs — long enough for a coffee, short enough to be safe. */
const PRESIGN_TTL_SECONDS = 60 * 15;

/**
 * Normalize a folder prefix so it's either empty (root) or trailing-slash. The
 * UI passes paths like "photos/2025/vacation" — we add the slash so S3's
 * Delimiter logic treats it as a folder boundary rather than a key match.
 */
function normalizePrefix(prefix: string): string {
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : prefix + "/";
}

/**
 * List one page of objects + sub-prefixes under `prefix`. Uses Delimiter "/" so
 * everything beneath the prefix collapses into CommonPrefixes — those become
 * "folder" rows in the UI. Pass back `nextContinuationToken` to keep paging.
 */
export async function listObjectsForConnection(
  conn: S3Connection,
  bucket: string,
  prefix: string,
  continuationToken?: string
): Promise<ListObjectsPage> {
  const client = createS3Client(conn);
  try {
    const normalized = normalizePrefix(prefix);
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalized || undefined,
        Delimiter: "/",
        MaxKeys: PAGE_SIZE,
        ContinuationToken: continuationToken,
      })
    );

    const prefixes: S3Entry[] = (out.CommonPrefixes ?? [])
      .filter((p) => p.Prefix)
      .map((p) => ({ type: "prefix" as const, prefix: p.Prefix! }));

    const objects: S3Entry[] = (out.Contents ?? [])
      // Skip the prefix's own zero-byte folder marker so we don't show "./" twice.
      .filter((o) => o.Key && o.Key !== normalized)
      .map((o) => ({
        type: "object" as const,
        key: o.Key!,
        size: o.Size ?? 0,
        lastModified:
          o.LastModified?.toISOString() ?? new Date(0).toISOString(),
        etag: o.ETag ?? undefined,
        storageClass: o.StorageClass ?? undefined,
      }));

    return {
      entries: [...prefixes, ...objects],
      prefix: normalized,
      nextContinuationToken: out.NextContinuationToken,
      isTruncated: out.IsTruncated ?? false,
    };
  } finally {
    client.destroy();
  }
}

/**
 * Create a zero-byte object whose key ends in "/" so the prefix shows up as a
 * folder in subsequent listings. S3 has no real folders; this is the standard
 * convention every S3 file manager uses.
 */
export async function createFolderForConnection(
  conn: S3Connection,
  bucket: string,
  prefix: string
): Promise<{ prefix: string }> {
  const normalized = normalizePrefix(prefix);
  const client = createS3Client(conn);
  try {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: normalized, Body: "" })
    );
    return { prefix: normalized };
  } finally {
    client.destroy();
  }
}

/**
 * Bulk delete in chunks of 1000 (S3's per-request cap). Per-key errors come
 * back in `errors` and don't throw — the UI surfaces them as warnings while
 * still treating successful deletes as deleted.
 */
export async function deleteObjectsForConnection(
  conn: S3Connection,
  bucket: string,
  keys: string[]
): Promise<DeleteObjectsResult> {
  if (keys.length === 0) return { deleted: 0, errors: [] };
  const client = createS3Client(conn);
  try {
    let deleted = 0;
    const errors: { key: string; message: string }[] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const out = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: false,
          },
        })
      );
      deleted += out.Deleted?.length ?? 0;
      for (const err of out.Errors ?? []) {
        errors.push({
          key: err.Key ?? "?",
          message: err.Message ?? "Unknown error",
        });
      }
    }
    return { deleted, errors };
  } finally {
    client.destroy();
  }
}

/**
 * Server-side copy used to power both Rename (copy then delete source) and
 * Move (same, but to a different prefix). `CopySource` must be URL-encoded
 * except for the "/" separators.
 */
export async function copyObjectForConnection(
  conn: S3Connection,
  bucket: string,
  sourceKey: string,
  destKey: string
): Promise<void> {
  const client = createS3Client(conn);
  try {
    const encoded = encodeURIComponent(sourceKey).replace(/%2F/g, "/");
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: destKey,
        CopySource: `/${bucket}/${encoded}`,
      })
    );
  } finally {
    client.destroy();
  }
}

/**
 * Presigned GET — the browser downloads or streams directly from S3 without
 * the bytes ever flowing through this server. Also doubles as "Copy share link".
 */
export async function presignDownloadUrl(
  conn: S3Connection,
  bucket: string,
  key: string,
  expiresSeconds: number = PRESIGN_TTL_SECONDS
): Promise<PresignedUrl> {
  const client = createS3Client(conn);
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresSeconds }
    );
    return {
      url,
      expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    };
  } finally {
    client.destroy();
  }
}

/**
 * Mint a presigned PUT URL for a single-shot upload. The browser does the
 * actual data transfer directly to the S3 backend — this server never sees the
 * bytes. ContentType is deliberately NOT included in the signed headers so the
 * browser can send whatever Content-Type it likes (typically the File's own
 * `.type`) without invalidating the signature; S3 stores whatever the PUT sent.
 *
 * Same TTL as downloads (15 min). Single-PUT uploads finish within that for
 * any reasonable size; larger files take the multipart path with per-part
 * presigning.
 */
export async function presignSingleUpload(
  conn: S3Connection,
  bucket: string,
  key: string,
  expiresSeconds: number = PRESIGN_TTL_SECONDS,
  storageClass?: string
): Promise<PresignedUrl> {
  const client = createS3Client(conn);
  try {
    // StorageClass is baked into the signed URL as an `x-amz-storage-class`
    // query parameter — the browser PUTs to the URL unchanged and S3 honors
    // the class without the client needing to set a separate header. Backends
    // that don't recognize the class typically store as STANDARD anyway, so
    // the upload still succeeds (per Phase 9 acceptance criteria).
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        // SDK types StorageClass as a string-literal union; we accept any
        // string at the route boundary (some S3-compatibles ship custom
        // classes) and cast through here. Wire-level invalid values surface
        // as an upstream 400 via the 502 envelope.
        StorageClass: storageClass as StorageClass | undefined,
      }),
      { expiresIn: expiresSeconds }
    );
    return {
      url,
      expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    };
  } finally {
    client.destroy();
  }
}

// ─── Multipart upload ─────────────────────────────────────────────────────────
//
// Standard S3 multipart flow:
//   1) CreateMultipartUpload  → returns an UploadId
//   2) UploadPart × N         → returns an ETag per part (5 MB min, except last)
//   3) CompleteMultipartUpload(parts: [{PartNumber, ETag}, ...])
//   3') AbortMultipartUpload  → discard parts and free server-side state
//
// This is what unlocks browser-side resume: parts that landed on S3 stay on
// S3 between page reloads. The browser persists {uploadId, completedParts}
// in localStorage and on resume calls ListParts to verify what's still there.

export async function createMultipartUpload(
  conn: S3Connection,
  bucket: string,
  key: string,
  contentType: string | undefined,
  storageClass?: string
): Promise<{ uploadId: string }> {
  const client = createS3Client(conn);
  try {
    const out = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        // StorageClass is fixed at create time and applies to the assembled
        // object once CompleteMultipartUpload runs. Backends that don't
        // recognize the class typically fall back to STANDARD silently.
        // See the cast note in presignSingleUpload.
        StorageClass: storageClass as StorageClass | undefined,
      })
    );
    if (!out.UploadId) throw new Error("Backend did not return UploadId");
    return { uploadId: out.UploadId };
  } finally {
    client.destroy();
  }
}

/**
 * Mint a presigned PUT URL for one part of an in-progress multipart upload.
 * Browser PUTs the part body to this URL directly; the backend returns the
 * ETag via response headers (CORS exposes it). One mint per part — cheap
 * (pure SigV4 computation, no network) and parallelizes with the part pool.
 */
export async function presignUploadPart(
  conn: S3Connection,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  expiresSeconds: number = PRESIGN_TTL_SECONDS
): Promise<PresignedUrl> {
  const client = createS3Client(conn);
  try {
    const url = await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: expiresSeconds }
    );
    return {
      url,
      expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    };
  } finally {
    client.destroy();
  }
}

/**
 * List the parts the backend has already received for an in-progress upload.
 * Used at resume time to skip already-uploaded parts.
 */
export async function listMultipartParts(
  conn: S3Connection,
  bucket: string,
  key: string,
  uploadId: string
): Promise<{ partNumber: number; etag: string; size: number }[]> {
  const client = createS3Client(conn);
  try {
    const parts: { partNumber: number; etag: string; size: number }[] = [];
    let marker: string | undefined;
    for (;;) {
      const out = await client.send(
        new ListPartsCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        })
      );
      for (const p of out.Parts ?? []) {
        if (p.PartNumber != null && p.ETag && p.Size != null) {
          parts.push({
            partNumber: p.PartNumber,
            etag: p.ETag,
            size: p.Size,
          });
        }
      }
      if (!out.IsTruncated || !out.NextPartNumberMarker) break;
      marker = out.NextPartNumberMarker;
    }
    return parts;
  } finally {
    client.destroy();
  }
}

export async function completeMultipartUpload(
  conn: S3Connection,
  bucket: string,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<{ etag: string | undefined; location: string | undefined }> {
  const client = createS3Client(conn);
  try {
    // S3 requires Parts in strictly ascending PartNumber order — defend
    // against a client that hands us the array out of order.
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const out = await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sorted.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      })
    );
    return { etag: out.ETag, location: out.Location };
  } finally {
    client.destroy();
  }
}

export async function abortMultipartUpload(
  conn: S3Connection,
  bucket: string,
  key: string,
  uploadId: string
): Promise<void> {
  const client = createS3Client(conn);
  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
  } finally {
    client.destroy();
  }
}

// ─── Object info / metadata / tags ─────────────────────────────────────────
//
// HEAD surfaces what's in the response headers (size, ETag, content-type,
// storage class, x-amz-meta-* user metadata). Tags ride on a separate sub-
// resource (?tagging) — they're not part of the HEAD response. Updating
// either userMetadata or contentType requires a CopyObject onto itself with
// `MetadataDirective: REPLACE` because S3 has no PUT-metadata verb.

/**
 * HEAD the object and reshape the SDK's response into a UI-friendly shape.
 * `userMetadata` keys come back lowercased and without the `x-amz-meta-`
 * prefix so the client never has to know S3's wire convention.
 */
export async function headObject(
  conn: S3Connection,
  bucket: string,
  key: string,
  versionId?: string
): Promise<ObjectHead> {
  const client = createS3Client(conn);
  try {
    const out = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId })
    );
    // SDK already lowercases user-metadata keys; mirror that explicitly so the
    // contract holds even if a future SDK version changes.
    const userMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(out.Metadata ?? {})) {
      if (typeof v === "string") userMetadata[k.toLowerCase()] = v;
    }
    return {
      key,
      size: out.ContentLength ?? 0,
      etag: out.ETag ?? undefined,
      lastModified:
        out.LastModified?.toISOString() ?? new Date(0).toISOString(),
      contentType: out.ContentType ?? undefined,
      storageClass: out.StorageClass ?? undefined,
      versionId: out.VersionId ?? undefined,
      userMetadata,
    };
  } finally {
    client.destroy();
  }
}

export async function getObjectTags(
  conn: S3Connection,
  bucket: string,
  key: string,
  versionId?: string
): Promise<ObjectTag[]> {
  const client = createS3Client(conn);
  try {
    const out = await client.send(
      new GetObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId,
      })
    );
    return (out.TagSet ?? [])
      .filter((t) => t.Key != null)
      .map((t) => ({ key: t.Key!, value: t.Value ?? "" }));
  } finally {
    client.destroy();
  }
}

export async function putObjectTags(
  conn: S3Connection,
  bucket: string,
  key: string,
  tags: ObjectTag[],
  versionId?: string
): Promise<void> {
  const client = createS3Client(conn);
  try {
    await client.send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId,
        Tagging: { TagSet: tags.map((t) => ({ Key: t.key, Value: t.value })) },
      })
    );
  } finally {
    client.destroy();
  }
}

/**
 * Replace userMetadata (and optionally contentType) on an existing key. S3 has
 * no in-place metadata update — the conventional trick is CopyObject onto the
 * same key with `MetadataDirective: REPLACE`, which rewrites the headers and
 * keeps the body. Storage class etc. are preserved by default.
 *
 * Same encoding quirk as `copyObjectForConnection`: CopySource is
 * percent-encoded except for "/" separators.
 */
export async function updateObjectMetadata(
  conn: S3Connection,
  bucket: string,
  key: string,
  newMetadata: Record<string, string>,
  newContentType?: string
): Promise<void> {
  const client = createS3Client(conn);
  try {
    const encoded = encodeURIComponent(key).replace(/%2F/g, "/");
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: `/${bucket}/${encoded}`,
        MetadataDirective: "REPLACE",
        Metadata: newMetadata,
        ContentType: newContentType,
      })
    );
  } finally {
    client.destroy();
  }
}

// ─── Versioning ────────────────────────────────────────────────────────────
//
// Versioning is a bucket-level subresource — once enabled it's per-key history
// for everything inside. S3 reports the bucket state via `GetBucketVersioning`
// (empty Status = never enabled). Per-object history is enumerated via
// `ListObjectVersions`, which interleaves real versions with delete markers in
// the same response; the SDK splits them into two arrays for us and we merge
// back into one chronological list keyed by versionId.
//
// "Restore" doesn't have a dedicated S3 verb. The canonical recipe is
// CopyObject from `bucket/key?versionId=X` onto the same key without a
// versionId, which writes a brand new latest version whose bytes mirror the
// historical one. That's what restoreObjectVersion does below.

/**
 * Fetch the bucket's versioning state and normalize it to the three-state
 * union. S3 returns an empty `Status` field for buckets where versioning has
 * never been turned on — we surface that as "Disabled" rather than undefined
 * so the client has a single shape to switch on.
 */
export async function getBucketVersioning(
  conn: S3Connection,
  bucket: string
): Promise<VersioningStatus> {
  const client = createS3Client(conn);
  try {
    const out = await client.send(
      new GetBucketVersioningCommand({ Bucket: bucket })
    );
    if (out.Status === "Enabled") return "Enabled";
    if (out.Status === "Suspended") return "Suspended";
    return "Disabled";
  } finally {
    client.destroy();
  }
}

/**
 * Flip versioning on or off. S3's API has no "Disabled" target — once enabled
 * the only off-switch is "Suspended" (existing versions stay, new writes don't
 * create new versions). Surface that wire constraint in the type so the UI
 * never accidentally sends "Disabled".
 */
export async function setBucketVersioning(
  conn: S3Connection,
  bucket: string,
  status: "Enabled" | "Suspended"
): Promise<void> {
  const client = createS3Client(conn);
  try {
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: status },
      })
    );
  } finally {
    client.destroy();
  }
}

/**
 * List every version + delete marker for a single key. The S3 API is keyed by
 * `prefix`, not exact match, so we filter to entries whose `Key` matches the
 * requested key exactly. Paginated via `KeyMarker` + `VersionIdMarker`; we
 * loop until `IsTruncated` clears so callers get one flat list.
 */
export async function listObjectVersions(
  conn: S3Connection,
  bucket: string,
  key: string
): Promise<ObjectVersion[]> {
  const client = createS3Client(conn);
  try {
    const out: ObjectVersion[] = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    for (;;) {
      const page = await client.send(
        new ListObjectVersionsCommand({
          Bucket: bucket,
          Prefix: key,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        })
      );
      for (const v of page.Versions ?? []) {
        // Prefix-listing can pull in sibling keys (e.g. "foo" matches "foobar").
        // Filter to exact-key matches so the caller never has to.
        if (v.Key !== key || !v.VersionId) continue;
        out.push({
          versionId: v.VersionId,
          isLatest: v.IsLatest ?? false,
          isDeleteMarker: false,
          size: v.Size ?? 0,
          etag: v.ETag ?? undefined,
          lastModified:
            v.LastModified?.toISOString() ?? new Date(0).toISOString(),
          storageClass: v.StorageClass ?? undefined,
        });
      }
      for (const dm of page.DeleteMarkers ?? []) {
        if (dm.Key !== key || !dm.VersionId) continue;
        out.push({
          versionId: dm.VersionId,
          isLatest: dm.IsLatest ?? false,
          isDeleteMarker: true,
          size: 0,
          lastModified:
            dm.LastModified?.toISOString() ?? new Date(0).toISOString(),
        });
      }
      if (!page.IsTruncated) break;
      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
      // Defensive: if the SDK reports truncated but doesn't hand back markers,
      // bail rather than spin forever.
      if (!keyMarker && !versionIdMarker) break;
    }
    // Newest first — `LastModified` is the only stable ordering we have across
    // backends (some S3-compatibles don't honor the "latest first" contract).
    out.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return out;
  } finally {
    client.destroy();
  }
}

/**
 * Hard-delete a specific version. With versioning on, a regular DELETE just
 * appends a delete marker — passing `VersionId` is what actually frees the
 * bytes. Used both for "permanently delete this version" and for cleaning up
 * a delete marker (removing the marker un-deletes the key).
 */
export async function deleteObjectVersion(
  conn: S3Connection,
  bucket: string,
  key: string,
  versionId: string
): Promise<void> {
  const client = createS3Client(conn);
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId,
      })
    );
  } finally {
    client.destroy();
  }
}

/**
 * Restore-as-latest: CopyObject from `bucket/key?versionId=X` onto the same
 * key without a versionId. Same encoding quirk as the other CopyObject
 * helpers — CopySource is percent-encoded except for "/" separators, and
 * `versionId=` rides on the CopySource string itself, not as a top-level
 * field (the SDK strictly mirrors the S3 wire format here).
 */
export async function restoreObjectVersion(
  conn: S3Connection,
  bucket: string,
  key: string,
  versionId: string
): Promise<void> {
  const client = createS3Client(conn);
  try {
    const encoded = encodeURIComponent(key).replace(/%2F/g, "/");
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: `/${bucket}/${encoded}?versionId=${encodeURIComponent(versionId)}`,
      })
    );
  } finally {
    client.destroy();
  }
}

// ─── Streaming uploads (server-side) ───────────────────────────────────────
//
// Used by the "Upload from URL" route. We don't go through presigned URLs here
// because the source bytes live on a third-party server the browser can't
// generally reach with CORS — the request fans out from this process, streams
// the upstream response body straight into `Upload` from `@aws-sdk/lib-storage`,
// and never buffers the full payload. `Upload` transparently switches to
// multipart for bodies past the 5 MB SDK threshold, so we don't need a
// separate single-vs-multipart split here.

/** Error thrown when the streamed upload exceeds the per-call byte cap. */
export class StreamSizeExceededError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Stream exceeded ${limit} byte cap`);
    this.name = "StreamSizeExceededError";
    this.limit = limit;
  }
}

/**
 * Wrap a ReadableStream with a byte-counting passthrough that aborts the
 * stream the moment a hard cap is exceeded. Counting happens before the bytes
 * are forwarded downstream so an oversized chunk never leaks into the upload.
 */
function capStream(
  body: ReadableStream<Uint8Array>,
  cap: number
): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > cap) {
          controller.error(new StreamSizeExceededError(cap));
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );
}

/**
 * Stream a body straight into S3 via `@aws-sdk/lib-storage`'s `Upload`. The
 * helper handles single-PUT vs. multipart internally — past the 5 MB
 * threshold it auto-switches to multipart and uploads parts in parallel.
 *
 * `sizeCapBytes` is enforced upstream of the SDK via a passthrough
 * TransformStream so a pathological URL can't OOM the process — chunks past
 * the cap surface as a `StreamSizeExceededError` and abort the underlying
 * multipart upload (the SDK does the AbortMultipartUpload for us on throw).
 */
export async function uploadFromStream(
  conn: S3Connection,
  bucket: string,
  key: string,
  body: ReadableStream<Uint8Array>,
  contentType?: string,
  contentLength?: number,
  sizeCapBytes?: number
): Promise<void> {
  const client = createS3Client(conn);
  try {
    // If the upstream advertised a Content-Length larger than the cap, refuse
    // before we even open the multipart upload — saves one S3 round-trip.
    if (
      sizeCapBytes !== undefined &&
      contentLength !== undefined &&
      contentLength > sizeCapBytes
    ) {
      throw new StreamSizeExceededError(sizeCapBytes);
    }
    const capped =
      sizeCapBytes !== undefined ? capStream(body, sizeCapBytes) : body;
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: capped,
        ContentType: contentType,
      },
    });
    await upload.done();
  } finally {
    client.destroy();
  }
}
