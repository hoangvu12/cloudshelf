/**
 * CloudShelf API server.
 *
 * Dev:   `bun --watch server/index.ts` — listens on :3001, Vite proxies /api here.
 * Prod:  `NODE_ENV=production bun server/index.ts` — additionally serves the built
 *        SPA from ./dist on the same port.
 *
 * Architecture (so future-me doesn't forget):
 *   - Control plane (list buckets/objects, copy, delete, create folder,
 *     multipart start/list/complete/abort) goes browser → this server → AWS SDK
 *     → S3-compatible endpoint. Small JSON responses, no body streaming.
 *   - Data plane (single PUT, each multipart part) goes browser → S3 directly
 *     via presigned URLs minted here. Bytes never touch this process — that's
 *     what gives us honest progress, real error surfaces, and no bandwidth
 *     doubling. Requires the backend to send permissive CORS (telegram-s3
 *     does; bucket-level CORS for AWS/R2/MinIO is a one-time setup).
 *   - Credentials live in ./data/cloudshelf.db (SQLite). Plaintext is fine
 *     because this app is single-user, local-use only.
 *   - Single-user auth: CLOUDSHELF_USERNAME/PASSWORD env vars + signed
 *     cookie. See server/lib/auth.ts.
 */

import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { connectionsRoute } from "./routes/connections.ts";
import { authRoute } from "./routes/auth.ts";
import { activityRoute } from "./routes/activity.ts";
import { requireSession } from "./lib/auth.ts";
import { getDb, trimActivity } from "./db.ts";

const PORT = Number(process.env.PORT ?? 3001);
const IS_PROD = process.env.NODE_ENV === "production";

if (!process.env.CLOUDSHELF_USERNAME || !process.env.CLOUDSHELF_PASSWORD) {
  console.error(
    "\n[CloudShelf] CLOUDSHELF_USERNAME and CLOUDSHELF_PASSWORD must be set " +
      "(via .env or the environment) before the server can start.\n"
  );
  process.exit(1);
}

getDb();

// Cap the activity table on each boot. Single-user volumes are low enough that
// running this once at startup (rather than via cron) is plenty — even a heavy
// week tops out well under the 10k row cap.
{
  const removed = trimActivity(10_000);
  if (removed > 0) {
    console.log(`[activity] trimmed ${removed} old rows on startup`);
  }
}

const app = new Hono();

app.use("*", logger());

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoute);

// Gate everything else under /api/* behind the session cookie.
// Registered after the public routes above so they don't pass through.
app.use("/api/*", requireSession);

app.route("/api/connections", connectionsRoute);
app.route("/api/activity", activityRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error", detail: err.message }, 500);
});

if (IS_PROD) {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.use("/favicon.svg", serveStatic({ path: "./dist/favicon.svg" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

console.log(
  `CloudShelf API listening on http://localhost:${PORT}` +
    (IS_PROD ? " (serving SPA from ./dist)" : " (dev mode — UI on Vite)")
);

export default {
  port: PORT,
  fetch: app.fetch,
};
