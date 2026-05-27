/**
 * Activity-log routes.
 *
 * Single-user audit surface: GET to read newest-first with limit/offset
 * pagination, DELETE to clear. Writes happen implicitly via `logActivity` calls
 * from inside the mutating routes in `connections.ts`.
 */

import { Hono } from "hono";
import { z } from "zod";
import { clearActivity, listActivity } from "../db.ts";

export const activityRoute = new Hono();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

activityRoute.get("/", (c) => {
  const parsed = querySchema.safeParse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  if (!parsed.success) {
    return c.json({ error: "Invalid query", detail: parsed.error.message }, 400);
  }
  const { limit, offset } = parsed.data;
  const { rows, total } = listActivity(limit, offset);
  return c.json({ rows, total, limit, offset });
});

activityRoute.delete("/", (c) => {
  const removed = clearActivity();
  return c.json({ ok: true, removed });
});
