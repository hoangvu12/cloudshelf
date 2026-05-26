import { Hono } from "hono";
import { z } from "zod";
import { deleteCookie, setSignedCookie } from "hono/cookie";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  getSessionSecret,
  newSessionPayload,
  readSession,
  serializeSession,
  verifyCredentials,
} from "../lib/auth.ts";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRoute = new Hono();

authRoute.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const ok = verifyCredentials(parsed.data.username, parsed.data.password);
  if (!ok) {
    // Small fixed delay to take some edge off online guessing — not a real
    // rate-limiter, but the app is single-user so a determined attacker is
    // out of scope. The reverse-proxy in front (if any) should handle abuse.
    await new Promise((r) => setTimeout(r, 250));
    return c.json({ error: "Invalid username or password" }, 401);
  }

  const payload = newSessionPayload(parsed.data.username);
  const isHttps =
    new URL(c.req.url).protocol === "https:" ||
    c.req.header("x-forwarded-proto") === "https";

  await setSignedCookie(
    c,
    SESSION_COOKIE,
    serializeSession(payload),
    getSessionSecret(),
    {
      httpOnly: true,
      secure: isHttps,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    }
  );

  return c.json({ user: payload.user });
});

authRoute.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoute.get("/me", async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user: session.user });
});
