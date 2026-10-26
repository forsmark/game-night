import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "../db/client";
import { members, sessions } from "../db/schema";
import { magicLink, newLinkToken } from "../auth/sessions";
import { requireHost, sessionMiddleware, type SessionEnv } from "../middleware/session";
import { MEEPLE_COLORS } from "../../shared/meeples";

const color = z.enum(MEEPLE_COLORS as [string, ...string[]]);
const createBody = z.object({ name: z.string().trim().min(1).max(40), color: color.optional() });
const updateBody = z.object({ name: z.string().trim().min(1).max(40).optional(), color: color.optional() });

const badRequest = { error: { code: "BAD_REQUEST", message: "Invalid request body" } };

// The first colour nobody uses yet, so new players look different at the table.
export function nextFreeColor(db: AppDb) {
  const used = new Set(db.select({ color: members.color }).from(members).all().map((m) => m.color));
  return MEEPLE_COLORS.find((c) => !used.has(c)) ?? MEEPLE_COLORS[used.size % MEEPLE_COLORS.length];
}

function toDto(member: typeof members.$inferSelect) {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    color: member.color,
    link: magicLink(member.linkToken),
  };
}

export function membersRoutes(db: AppDb) {
  const app = new Hono<SessionEnv>();
  app.use("*", sessionMiddleware(db), requireHost);

  app.get("/", (c) => c.json(db.select().from(members).orderBy(asc(members.createdAt)).all().map(toDto)));

  app.post("/", async (c) => {
    const parsed = createBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json(badRequest, 400);

    const member = {
      id: randomUUID(),
      name: parsed.data.name,
      role: "guest" as const,
      color: parsed.data.color ?? nextFreeColor(db),
      linkToken: newLinkToken(),
      createdAt: new Date().toISOString(),
    };
    db.insert(members).values(member).run();
    return c.json(toDto(member), 201);
  });

  app.patch("/:id", async (c) => {
    const parsed = updateBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json(badRequest, 400);
    db.update(members).set(parsed.data).where(eq(members.id, c.req.param("id"))).run();
    return c.json({ ok: true });
  });

  // Replaces the member's link and signs them out everywhere. Use it when a link leaks.
  app.post("/:id/new-link", (c) => {
    const id = c.req.param("id");
    db.update(members).set({ linkToken: newLinkToken() }).where(eq(members.id, id)).run();
    db.delete(sessions).where(eq(sessions.memberId, id)).run();
    const member = db.select().from(members).where(eq(members.id, id)).get();
    return member ? c.json(toDto(member)) : c.json({ error: { code: "NOT_FOUND", message: "No such member" } }, 404);
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    if (id === c.get("member").id) {
      return c.json({ error: { code: "BAD_REQUEST", message: "You can't remove yourself" } }, 400);
    }
    db.delete(members).where(eq(members.id, id)).run();
    return c.json({ ok: true });
  });

  return app;
}
