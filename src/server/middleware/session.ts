import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { members } from "../db/schema";
import { getSession } from "../auth/sessions";

export type SessionMember = { id: string; name: string; role: "host" | "guest"; color: string };
export type SessionEnv = { Variables: { member: SessionMember } };

export function sessionMiddleware(db: AppDb) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const sessionId = getCookie(c, "session_id");
    const session = sessionId ? getSession(db, sessionId) : null;
    const member = session ? db.select().from(members).where(eq(members.id, session.memberId)).get() : null;

    if (!member) {
      return c.json({ error: { code: "UNAUTHENTICATED", message: "Open your personal link to sign in" } }, 401);
    }

    c.set("member", { id: member.id, name: member.name, role: member.role, color: member.color });
    await next();
  });
}

export const requireHost = createMiddleware<SessionEnv>(async (c, next) => {
  if (c.get("member").role !== "host") {
    return c.json({ error: { code: "FORBIDDEN", message: "Only the host can do this" } }, 403);
  }
  await next();
});
