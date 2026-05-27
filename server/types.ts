/**
 * Shared API contract types — used by both the Hono server and the React UI.
 * Frontend imports these via the `@server/*` path alias defined in tsconfig.app.json.
 */

export interface S3Connection {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  /** Stored plaintext in SQLite. Acceptable because the app is single-user / local-use only. */
  accessKeyId: string;
  /** Stored plaintext in SQLite. Acceptable because the app is single-user / local-use only. */
  secretAccessKey: string;
  forcePathStyle: boolean;
  forceSSL: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by POST /api/connections (server generates id/timestamps). */
export type CreateConnectionInput = Omit<
  S3Connection,
  "id" | "createdAt" | "updatedAt"
>;

/** Payload accepted by PATCH /api/connections/:id. */
export type UpdateConnectionInput = Partial<CreateConnectionInput>;

export interface TestConnectionResult {
  ok: boolean;
  bucketCount?: number;
  error?: string;
}

/**
 * One S3 bucket as the UI cares about it. Returned from GET /api/connections/:id/buckets.
 * Size and object count are intentionally not included — S3's ListBuckets doesn't return
 * them, and computing per-bucket totals isn't worth N×ListObjectsV2 paginations.
 */
export interface Bucket {
  /** Bucket name, also used as the stable id within a connection. */
  name: string;
  /** ISO 8601 creation timestamp returned by S3. */
  createdAt: string;
}

/** Uniform error envelope returned by the API on 4xx/5xx. */
export interface ApiError {
  error: string;
  detail?: string;
}

/**
 * One concrete object in a bucket (a file). Returned by GET /api/connections/:id/buckets/:bucket/objects.
 */
export interface S3ObjectEntry {
  type: "object";
  /** Full key, e.g. "photos/2025/vacation/IMG_4021.jpg". */
  key: string;
  /** Size in bytes. */
  size: number;
  /** ISO 8601 last-modified timestamp from S3. */
  lastModified: string;
  etag?: string;
  storageClass?: string;
}

/**
 * A sub-prefix synthesized from CommonPrefixes when listing with Delimiter "/".
 * Renders as a "folder" row even though S3 itself has no folders.
 */
export interface S3PrefixEntry {
  type: "prefix";
  /** Full prefix path including trailing slash, e.g. "photos/2025/". */
  prefix: string;
}

export type S3Entry = S3ObjectEntry | S3PrefixEntry;

/** One page of objects + sub-prefixes under a given prefix. */
export interface ListObjectsPage {
  /** Sub-prefixes first, then objects — matches the WM-style listing convention. */
  entries: S3Entry[];
  /** The normalized prefix the server actually used (always empty or trailing-slash). */
  prefix: string;
  /** Pass back as `continuationToken` to fetch the next page. */
  nextContinuationToken?: string;
  isTruncated: boolean;
}

/** A short-lived signed URL the browser can hit directly. */
export interface PresignedUrl {
  url: string;
  /** ISO 8601 expiry timestamp — purely informational, the URL is self-validating. */
  expiresAt: string;
}

/** Result of a bulk delete. `errors` lists per-key failures from S3 (non-fatal). */
export interface DeleteObjectsResult {
  deleted: number;
  errors: { key: string; message: string }[];
}

/**
 * The fields HEAD-Object surfaces about a single key — fed into the info panel.
 * `userMetadata` keys are lowercased and stripped of the `x-amz-meta-` prefix
 * so the client never has to know the wire-level naming convention.
 */
export interface ObjectHead {
  key: string;
  size: number;
  etag?: string;
  lastModified: string;
  contentType?: string;
  storageClass?: string;
  versionId?: string;
  userMetadata: Record<string, string>;
}

/** One S3 object tag. Up to 10 per object; keys ≤ 128 chars, values ≤ 256. */
export interface ObjectTag {
  key: string;
  value: string;
}

/**
 * Bucket versioning state from `GetBucketVersioning`. "Disabled" is the SDK's
 * way of representing a bucket where versioning has never been enabled — S3
 * reports an empty `Status` field in that case, which we normalize to a
 * three-state union so the client doesn't have to know about the wire quirk.
 */
export type VersioningStatus = "Enabled" | "Suspended" | "Disabled";

/**
 * One entry in `ListObjectVersions` for a given key. Delete markers ride on
 * the same listing as real versions — the UI surfaces them with a "Deleted"
 * badge and disables download/restore for them. `versionId` is the wire-level
 * id S3 uses; on buckets where versioning was never enabled it may be the
 * literal string "null", which is a valid value the SDK round-trips.
 */
export interface ObjectVersion {
  versionId: string;
  isLatest: boolean;
  isDeleteMarker: boolean;
  size: number;
  etag?: string;
  lastModified: string;
  storageClass?: string;
}
