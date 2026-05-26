import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { S3Connection } from "./types.ts";

const DB_PATH = process.env.CLOUDSHELF_DB ?? join(process.cwd(), "data", "cloudshelf.db");

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      region TEXT NOT NULL,
      access_key_id TEXT NOT NULL,
      secret_access_key TEXT NOT NULL,
      force_path_style INTEGER NOT NULL DEFAULT 1,
      force_ssl INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

// ─── Meta key/value (session secret, etc.) ──────────────────────────────────

export function getMeta(key: string): string | null {
  const row = getDb()
    .query("SELECT value FROM meta WHERE key = ?")
    .get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .query(
      "INSERT INTO meta (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

interface ConnectionRow {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  access_key_id: string;
  secret_access_key: string;
  force_path_style: number;
  force_ssl: number;
  created_at: string;
  updated_at: string;
}

function rowToConnection(row: ConnectionRow): S3Connection {
  return {
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    region: row.region,
    accessKeyId: row.access_key_id,
    secretAccessKey: row.secret_access_key,
    forcePathStyle: row.force_path_style === 1,
    forceSSL: row.force_ssl === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listConnections(): S3Connection[] {
  const rows = getDb()
    .query("SELECT * FROM connections ORDER BY created_at DESC")
    .all() as ConnectionRow[];
  return rows.map(rowToConnection);
}

export function getConnection(id: string): S3Connection | null {
  const row = getDb()
    .query("SELECT * FROM connections WHERE id = ?")
    .get(id) as ConnectionRow | null;
  return row ? rowToConnection(row) : null;
}

export function insertConnection(conn: S3Connection): S3Connection {
  getDb()
    .query(
      `INSERT INTO connections
        (id, name, endpoint, region, access_key_id, secret_access_key,
         force_path_style, force_ssl, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      conn.id,
      conn.name,
      conn.endpoint,
      conn.region,
      conn.accessKeyId,
      conn.secretAccessKey,
      conn.forcePathStyle ? 1 : 0,
      conn.forceSSL ? 1 : 0,
      conn.createdAt,
      conn.updatedAt
    );
  return conn;
}

export function updateConnection(
  id: string,
  patch: Partial<Omit<S3Connection, "id" | "createdAt">>
): S3Connection | null {
  const existing = getConnection(id);
  if (!existing) return null;

  const merged: S3Connection = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .query(
      `UPDATE connections SET
         name = ?, endpoint = ?, region = ?,
         access_key_id = ?, secret_access_key = ?,
         force_path_style = ?, force_ssl = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      merged.name,
      merged.endpoint,
      merged.region,
      merged.accessKeyId,
      merged.secretAccessKey,
      merged.forcePathStyle ? 1 : 0,
      merged.forceSSL ? 1 : 0,
      merged.updatedAt,
      id
    );

  return merged;
}

export function deleteConnection(id: string): boolean {
  const result = getDb()
    .query("DELETE FROM connections WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
