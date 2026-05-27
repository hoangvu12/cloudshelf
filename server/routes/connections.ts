import { Hono } from "hono";
import { z } from "zod";
import {
  listConnections,
  getConnection,
  insertConnection,
  updateConnection,
  deleteConnection,
} from "../db.ts";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  copyObjectForConnection,
  createBucketForConnection,
  createFolderForConnection,
  createMultipartUpload,
  deleteObjectsForConnection,
  getObjectTags,
  headObject,
  listBucketsForConnection,
  listMultipartParts,
  listObjectsForConnection,
  presignDownloadUrl,
  presignSingleUpload,
  presignUploadPart,
  probeConnection,
  putObjectTags,
  updateObjectMetadata,
} from "../lib/s3.ts";
import type { S3Connection } from "../types.ts";

const createSchema = z.object({
  name: z.string().trim().min(1),
  endpoint: z.string().trim().url(),
  region: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean(),
  forceSSL: z.boolean(),
});

const patchSchema = createSchema.partial();

export const connectionsRoute = new Hono();

connectionsRoute.get("/", (c) => {
  return c.json(listConnections());
});

connectionsRoute.get("/:id", (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  return c.json(conn);
});

/** Test arbitrary credentials without saving them. */
connectionsRoute.post("/test", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  const result = await probeConnection(parsed.data);
  return c.json(result);
});

/** Create + persist (does NOT test — caller is expected to /test first). */
connectionsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  const now = new Date().toISOString();
  const conn: S3Connection = {
    id: crypto.randomUUID(),
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  };
  insertConnection(conn);
  return c.json(conn, 201);
});

connectionsRoute.patch("/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  const updated = updateConnection(c.req.param("id"), parsed.data);
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

connectionsRoute.delete("/:id", (c) => {
  const ok = deleteConnection(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/** Test an existing, saved connection by id. */
connectionsRoute.post("/:id/test", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const result = await probeConnection(conn);
  return c.json(result);
});

/** List buckets for an existing, saved connection. */
connectionsRoute.get("/:id/buckets", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  try {
    const buckets = await listBucketsForConnection(conn);
    return c.json(buckets);
  } catch (err) {
    return c.json(
      {
        error: "Failed to list buckets",
        detail: err instanceof Error ? err.message : String(err),
      },
      502
    );
  }
});

const createBucketSchema = z.object({ name: z.string().trim().min(1) });

/**
 * Create a new bucket. Naming validity is enforced client-side; here we just
 * pass it through and bubble S3's own errors (e.g. BucketAlreadyExists) so the
 * user sees the real reason rather than a generic 400.
 */
connectionsRoute.post("/:id/buckets", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  const parsed = createBucketSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  try {
    const result = await createBucketForConnection(conn, parsed.data.name);
    return c.json(result, 201);
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

// ─── Objects ────────────────────────────────────────────────────────────────
// Mounted at /api/connections/:id/buckets/:bucket/...
// Every route below routes the call through getConnection() first so deleted
// or unknown connection ids fail fast as a 404 (not a 500 from the SDK).

const folderSchema = z.object({ prefix: z.string().trim().min(1) });
const deleteSchema = z.object({ keys: z.array(z.string().min(1)).min(1) });
const copySchema = z.object({
  sourceKey: z.string().min(1),
  destKey: z.string().min(1),
});

/** Wrap an upstream S3 call so failures surface as a uniform 502 envelope. */
function upstreamError(err: unknown) {
  return {
    error: "Upstream S3 request failed",
    detail: err instanceof Error ? err.message : String(err),
  };
}

/** List one page of objects + sub-prefixes under ?prefix=. */
connectionsRoute.get("/:id/buckets/:bucket/objects", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const prefix = c.req.query("prefix") ?? "";
  const continuationToken = c.req.query("continuationToken") || undefined;
  try {
    const page = await listObjectsForConnection(
      conn,
      c.req.param("bucket"),
      prefix,
      continuationToken
    );
    return c.json(page);
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

/** Create a folder (zero-byte key ending in "/"). */
connectionsRoute.post("/:id/buckets/:bucket/folders", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  const parsed = folderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  try {
    const out = await createFolderForConnection(
      conn,
      c.req.param("bucket"),
      parsed.data.prefix
    );
    return c.json(out, 201);
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

/** Bulk-delete by key list. POST not DELETE because DELETE bodies are spotty. */
connectionsRoute.post("/:id/buckets/:bucket/objects/delete", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  try {
    const result = await deleteObjectsForConnection(
      conn,
      c.req.param("bucket"),
      parsed.data.keys
    );
    return c.json(result);
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

/** Server-side copy. Powers both Rename (same prefix) and Move (different prefix). */
connectionsRoute.post("/:id/buckets/:bucket/objects/copy", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  const parsed = copySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  try {
    await copyObjectForConnection(
      conn,
      c.req.param("bucket"),
      parsed.data.sourceKey,
      parsed.data.destKey
    );
    return c.json({ ok: true });
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

/** Presigned GET URL — browser downloads / shares directly from S3. */
connectionsRoute.get("/:id/buckets/:bucket/objects/download-url", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing ?key=" }, 400);
  try {
    const out = await presignDownloadUrl(conn, c.req.param("bucket"), key);
    return c.json(out);
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

// ─── Multipart upload (resumable) ───────────────────────────────────────────
// Client orchestrates: POST /multipart/start → PUT /multipart/part × N →
// POST /multipart/complete. Cancel = DELETE /multipart. Resume = GET
// /multipart/parts then upload only missing partNumbers. Key + uploadId ride
// in query string on every per-part request so the server stays stateless
// w.r.t. the upload session (the source of truth is the backend's own
// CreateMultipartUpload state).

const multipartStartSchema = z.object({
  key: z.string().min(1),
  contentType: z.string().optional(),
});

const multipartCompleteSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        etag: z.string().min(1),
      })
    )
    .min(1),
});

connectionsRoute.post(
  "/:id/buckets/:bucket/objects/multipart/start",
  async (c) => {
    const conn = getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = multipartStartSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid payload", detail: parsed.error.message },
        400
      );
    }
    try {
      const out = await createMultipartUpload(
        conn,
        c.req.param("bucket"),
        parsed.data.key,
        parsed.data.contentType
      );
      return c.json({ uploadId: out.uploadId, key: parsed.data.key });
    } catch (err) {
      return c.json(upstreamError(err), 502);
    }
  }
);

/**
 * Mint a presigned PUT URL for one part. Browser PUTs the part body directly
 * to the S3 backend using this URL — bytes never touch this server. Cheap to
 * call (pure SigV4 math, no upstream request), so the worker mints on demand
 * per part rather than pre-batching.
 */
connectionsRoute.post(
  "/:id/buckets/:bucket/objects/presign/part",
  async (c) => {
    const conn = getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const uploadId = c.req.query("uploadId");
    const key = c.req.query("key");
    const partNumberStr = c.req.query("partNumber");
    if (!uploadId || !key || !partNumberStr) {
      return c.json(
        { error: "Missing ?uploadId, ?key, or ?partNumber" },
        400
      );
    }
    const partNumber = Number(partNumberStr);
    if (
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10000
    ) {
      return c.json({ error: "partNumber must be 1..10000" }, 400);
    }
    try {
      const out = await presignUploadPart(
        conn,
        c.req.param("bucket"),
        key,
        uploadId,
        partNumber
      );
      return c.json(out);
    } catch (err) {
      return c.json(upstreamError(err), 502);
    }
  }
);

connectionsRoute.get(
  "/:id/buckets/:bucket/objects/multipart/parts",
  async (c) => {
    const conn = getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const uploadId = c.req.query("uploadId");
    const key = c.req.query("key");
    if (!uploadId || !key) {
      return c.json({ error: "Missing ?uploadId or ?key" }, 400);
    }
    try {
      const parts = await listMultipartParts(
        conn,
        c.req.param("bucket"),
        key,
        uploadId
      );
      return c.json({ parts });
    } catch (err) {
      return c.json(upstreamError(err), 502);
    }
  }
);

connectionsRoute.post(
  "/:id/buckets/:bucket/objects/multipart/complete",
  async (c) => {
    const conn = getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const uploadId = c.req.query("uploadId");
    const key = c.req.query("key");
    if (!uploadId || !key) {
      return c.json({ error: "Missing ?uploadId or ?key" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = multipartCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid payload", detail: parsed.error.message },
        400
      );
    }
    try {
      const out = await completeMultipartUpload(
        conn,
        c.req.param("bucket"),
        key,
        uploadId,
        parsed.data.parts
      );
      return c.json({ ok: true, key, etag: out.etag, location: out.location });
    } catch (err) {
      return c.json(upstreamError(err), 502);
    }
  }
);

connectionsRoute.delete(
  "/:id/buckets/:bucket/objects/multipart",
  async (c) => {
    const conn = getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const uploadId = c.req.query("uploadId");
    const key = c.req.query("key");
    if (!uploadId || !key) {
      return c.json({ error: "Missing ?uploadId or ?key" }, 400);
    }
    try {
      await abortMultipartUpload(
        conn,
        c.req.param("bucket"),
        key,
        uploadId
      );
      return c.json({ ok: true });
    } catch (err) {
      return c.json(upstreamError(err), 502);
    }
  }
);

/**
 * Mint a presigned PUT URL for a single-shot upload (files under the
 * multipart threshold). Same rationale as /presign/part: data goes browser →
 * S3 directly, with real progress events and no proxy bandwidth.
 */
connectionsRoute.post(
  "/:id/buckets/:bucket/objects/presign/upload",
  async (c) => {
    const conn = getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const key = c.req.query("key");
    if (!key) return c.json({ error: "Missing ?key=" }, 400);
    try {
      const out = await presignSingleUpload(conn, c.req.param("bucket"), key);
      return c.json(out);
    } catch (err) {
      return c.json(upstreamError(err), 502);
    }
  }
);

// ─── Object info / tags / metadata ─────────────────────────────────────────
// S3 hands user-metadata via `x-amz-meta-*` headers and tags via a separate
// `?tagging` sub-resource. The routes below let the info-panel UI read both
// without each component having to know that wire detail.

/**
 * Tag values are validated against S3's hard limits (10 tags, 128-char keys,
 * 256-char values). Empty values are allowed — S3 stores them as the empty
 * string and they round-trip cleanly.
 */
const tagSchema = z.object({
  tags: z
    .array(
      z.object({
        key: z.string().min(1).max(128),
        value: z.string().max(256),
      })
    )
    .max(10),
});

/**
 * `userMetadata` keys are lowercased and re-validated. Leading `x-amz-meta-`
 * would double-prefix once the SDK adds its own, so we strip it defensively
 * even though the client isn't supposed to send it.
 */
const metadataSchema = z.object({
  contentType: z.string().trim().min(1).optional(),
  userMetadata: z.record(z.string(), z.string()),
});

/** HEAD the object — size/etag/storage-class/content-type/user metadata. */
connectionsRoute.get("/:id/buckets/:bucket/objects/head", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing ?key=" }, 400);
  const versionId = c.req.query("versionId") || undefined;
  try {
    const out = await headObject(conn, c.req.param("bucket"), key, versionId);
    return c.json(out);
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

connectionsRoute.get("/:id/buckets/:bucket/objects/tags", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing ?key=" }, 400);
  const versionId = c.req.query("versionId") || undefined;
  try {
    const tags = await getObjectTags(
      conn,
      c.req.param("bucket"),
      key,
      versionId
    );
    return c.json({ tags });
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

connectionsRoute.put("/:id/buckets/:bucket/objects/tags", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing ?key=" }, 400);
  const versionId = c.req.query("versionId") || undefined;
  const body = await c.req.json().catch(() => null);
  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  try {
    await putObjectTags(
      conn,
      c.req.param("bucket"),
      key,
      parsed.data.tags,
      versionId
    );
    return c.json({ ok: true });
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});

/**
 * Replace contentType + userMetadata on an existing key. Implemented as
 * CopyObject onto itself with `MetadataDirective: REPLACE` server-side
 * (see updateObjectMetadata in lib/s3.ts).
 */
connectionsRoute.put("/:id/buckets/:bucket/objects/metadata", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing ?key=" }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = metadataSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data.userMetadata)) {
    const clean = k.toLowerCase().replace(/^x-amz-meta-/, "");
    if (clean.length === 0) continue;
    normalized[clean] = v;
  }
  try {
    await updateObjectMetadata(
      conn,
      c.req.param("bucket"),
      key,
      normalized,
      parsed.data.contentType
    );
    return c.json({ ok: true });
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});
