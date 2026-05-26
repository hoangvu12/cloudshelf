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
  copyObjectForConnection,
  createFolderForConnection,
  deleteObjectsForConnection,
  listBucketsForConnection,
  listObjectsForConnection,
  presignDownloadUrl,
  presignUploadUrl,
  probeConnection,
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
const uploadUrlSchema = z.object({
  key: z.string().min(1),
  contentType: z.string().optional(),
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

/** Presigned PUT URL — browser uploads directly to S3 (single PUT, ≤5 GB). */
connectionsRoute.post("/:id/buckets/:bucket/objects/upload-url", async (c) => {
  const conn = getConnection(c.req.param("id"));
  if (!conn) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", detail: parsed.error.message }, 400);
  }
  try {
    const out = await presignUploadUrl(
      conn,
      c.req.param("bucket"),
      parsed.data.key,
      parsed.data.contentType
    );
    return c.json(out);
  } catch (err) {
    return c.json(upstreamError(err), 502);
  }
});
