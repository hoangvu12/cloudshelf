/**
 * Single-user auth: env-var credentials, signed-cookie session.
 *
 *   - Username/password come from CLOUDSHELF_USERNAME / CLOUDSHELF_PASSWORD.
 *   - Comparison is timing-safe (SHA-256 both sides so lengths always match).
 *   - The session is just a signed cookie carrying {user, exp}. No server-side
 *     session table — the HMAC is the source of truth, and `exp` lets the
 *     server reject expired payloads even if the cookie persists.
 *   - The HMAC secret is generated once on first run and stored in the
 *     `meta` table, so sessions survive restarts without any extra env var.
 */

import { createHash, randomBytes } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { getSignedCookie } from "hono/cookie";
import { getMeta, setMeta } from "../db.ts";

export const SESSION_COOKIE = "cloudshelf_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const SESSION_SECRET_KEY = "session_secret";

let cachedSecret: string | null = null;

export function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  const existing = getMeta(SESSION_SECRET_KEY);
  if (existing) {
    cachedSecret = existing;
    return existing;
  }
  const generated = randomBytes(32).toString("hex");
  setMeta(SESSION_SECRET_KEY, generated);
  cachedSecret = generated;
  return generated;
}

export interface ConfiguredCredentials {
  username: string;
  password: string;
}

/**
 * Reads env vars at call time so tests / dev hot-reload pick up changes.
 * Throws if either is missing — the server entrypoint validates at startup
 * and exits with a clear message, so users hit this error early.
 */
export function getConfiguredCredentials(): ConfiguredCredentials {
  const username = process.env.CLOUDSHELF_USERNAME;
  const password = process.env.CLOUDSHELF_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "CLOUDSHELF_USERNAME and CLOUDSHELF_PASSWORD must be set."
    );
  }
  return { username, password };
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

export function verifyCredentials(username: string, password: string): boolean {
  const expected = getConfiguredCredentials();
  // timingSafeEqual requires equal-length buffers — sha256 normalizes lengths.
  const userOk = timingSafeEqual(sha256(username), sha256(expected.username));
  const passOk = timingSafeEqual(sha256(password), sha256(expected.password));
  return userOk && passOk;
}

export interface SessionPayload {
  user: string;
  exp: number; // unix ms
}

export function newSessionPayload(user: string): SessionPayload {
  return { user, exp: Date.now() + SESSION_TTL_SECONDS * 1000 };
}

export function serializeSession(p: SessionPayload): string {
  return JSON.stringify(p);
}

export function parseSession(raw: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionPayload>;
    if (typeof parsed.user !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return { user: parsed.user, exp: parsed.exp };
  } catch {
    return null;
  }
}

/** Returns the session for the current request, or null if unauthenticated. */
export async function readSession(
  c: Parameters<MiddlewareHandler>[0]
): Promise<SessionPayload | null> {
  const raw = await getSignedCookie(c, getSessionSecret(), SESSION_COOKIE);
  if (!raw) return null;
  return parseSession(raw);
}

/**
 * Gate everything matched by the mount path. Public routes (login, health)
 * must be registered as separate `app.use(...)` mounts that don't pass
 * through this middleware.
 */
export const requireSession: MiddlewareHandler = async (c, next) => {
  const session = await readSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("session", session);
  await next();
};
