import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  Bucket,
  CreateConnectionInput,
  DeleteObjectsResult,
  ListObjectsPage,
  PresignedUrl,
  S3Connection,
  S3Entry,
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

/**
 * List buckets for a saved connection. `sizeBytes` and `objectCount` are not
 * populated — S3's ListBuckets doesn't return them, and computing them per
 * bucket would require N parallel ListObjectsV2 calls. The UI renders "—" for
 * the missing values; revisit if/when we add a stats endpoint.
 */
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
 * Presigned PUT — the browser uploads directly to S3. Single-PUT cap is 5 GB;
 * larger files would need multipart, which we'd add via @aws-sdk/lib-storage
 * later if needed. v1 enforces the cap on the client.
 */
export async function presignUploadUrl(
  conn: S3Connection,
  bucket: string,
  key: string,
  contentType: string | undefined,
  expiresSeconds: number = PRESIGN_TTL_SECONDS
): Promise<PresignedUrl> {
  const client = createS3Client(conn);
  try {
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
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
