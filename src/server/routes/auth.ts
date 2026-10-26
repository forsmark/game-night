import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { members } from "../db/schema";
import { createSession, deleteSession, magicLink } from "../auth/sessions";
import { sessionMiddleware, type SessionEnv } from "../middleware/session";
import { getEnv } from "../env";

// Signs the member in on this device.
export function startSession(c: Context, db: AppDb, memberId: string) {
  const session = createSession(db, memberId);
  setCookie(c, "session_id", session.id, {
    httpOnly: true,
    secure: getEnv().nodeEnv === "production",
    // Lax, not Strict: links are opened from a chat app, which is a cross-site navigation.
    sameSite: "Lax",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

// Served at /j/:token. Turns a personal magic link into a session cookie.
export function joinRoute(db: AppDb) {
  const app = new Hono();

  app.get("/:token", (c) => {
    const member = db.select().from(members).where(eq(members.linkToken, c.req.param("token"))).get();
    if (!member) return c.redirect("/?link=invalid");
    startSession(c, db, member.id);
    return c.redirect("/");
  });

  return app;
}

export function authRoutes(db: AppDb) {
  const app = new Hono<SessionEnv>();
  app.use("*", sessionMiddleware(db));

  app.get("/me", (c) => c.json(c.get("member")));

  // The member's own personal link, for signing in on another device.
  app.get("/link", (c) => {
    const member = db.select().from(members).where(eq(members.id, c.get("member").id)).get()!;
    return c.json({ link: magicLink(member.linkToken) });
  });

  app.post("/logout", (c) => {
    const sessionId = getCookie(c, "session_id");
    if (sessionId) deleteSession(db, sessionId);
    deleteCookie(c, "session_id", { path: "/" });
    return c.json({ ok: true });
  });

  return app;
}
