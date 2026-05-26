/**
 * CloudShelf API server.
 *
 * Dev:   `bun --watch server/index.ts` — listens on :3001, Vite proxies /api here.
 * Prod:  `NODE_ENV=production bun server/index.ts` — additionally serves the built
 *        SPA from ./dist on the same port.
 *
 * Architecture (so future-me doesn't forget):
 *   - The browser NEVER talks to S3 directly.
 *   - Browser → this server's /api/* → AWS SDK → S3-compatible endpoint.
 *   - Credentials live in ./data/cloudshelf.db (SQLite). Plaintext is fine because
 *     this app is single-user, local-use only (mirrors C0RE1312/s3-compass).
 *   - File transfers eventually go via pre-signed URLs (browser → S3 direct,
 *     signed by us) to avoid streaming gigabytes through this process.
 */

import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { connectionsRoute } from "./routes/connections.ts";
import { getDb } from "./db.ts";

const PORT = Number(process.env.PORT ?? 3001);
const IS_PROD = process.env.NODE_ENV === "production";

getDb();

const app = new Hono();

app.use("*", logger());

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/connections", connectionsRoute);

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
