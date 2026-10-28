import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "../db/client";
import { members, rsvps, settings } from "../db/schema";
import { newLinkToken, shareLink } from "../auth/sessions";
import { freshCode, GROUP_CODE_KEY } from "../auth/sign-in-codes";
import { requireHost, sessionMiddleware, type SessionEnv } from "../middleware/session";
import { startSession } from "./auth";
import { nextFreeColor } from "./members";
import { nextEvent } from "./events";

const DEFAULT_LIMIT = 15;

function getSetting(db: AppDb, key: string) {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

function setSetting(db: AppDb, key: string, value: string) {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

// The group invite: a link for the chat and a short code to type in. Both are created the first
// time anyone asks for them, so installs from before the code existed get one too.
export function getInvite(db: AppDb) {
  let token = getSetting(db, "invite_token");
  if (!token) {
    token = newLinkToken();
    setSetting(db, "invite_token", token);
  }
  let code = getSetting(db, GROUP_CODE_KEY);
  if (!code) {
    code = freshCode(db);
    setSetting(db, GROUP_CODE_KEY, code);
  }
  const limit = Number(getSetting(db, "invite_limit") ?? DEFAULT_LIMIT);
  const used = db.select({ n: sql<number>`count(*)` }).from(members).get()!.n;
  return { token, code, limit, used, link: shareLink("i", token) };
}

const joinBody = z.object({
  name: z.string().trim().min(1).max(40),
  status: z.enum(["yes", "maybe", "no"]).optional(),
});
const limitBody = z.object({ limit: z.number().int().min(2).max(50) });

const invalid = { error: { code: "INVALID_INVITE", message: "This invite link no longer works. Ask the host for the new one." } };
const full = { error: { code: "GROUP_FULL", message: "The group is full. Ask the host to make room." } };

// Public routes for people who open the group link.
export function joinInviteRoutes(db: AppDb) {
  const app = new Hono();

  app.get("/:token", (c) => {
    const invite = getInvite(db);
    if (c.req.param("token") !== invite.token) return c.json(invalid, 404);
    const night = nextEvent(db);
    return c.json({
      full: invite.used >= invite.limit,
      night: night ? { startsAt: night.startsAt, location: night.location } : null,
    });
  });

  app.post("/:token", async (c) => {
    const parsed = joinBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "BAD_REQUEST", message: "Enter your name" } }, 400);

    // No await from here on, so two people joining at once can't both take the last place.
    const invite = getInvite(db);
    if (c.req.param("token") !== invite.token) return c.json(invalid, 404);
    if (invite.used >= invite.limit) return c.json(full, 403);

    const { name, status } = parsed.data;
    const taken = db
      .select({ name: members.name })
      .from(members)
      .where(sql`lower(${members.name}) = lower(${name})`)
      .get();
    if (taken) {
      return c.json(
        {
          error: {
            code: "NAME_TAKEN",
            message: `Someone called ${taken.name} is already in the group. If that's you, copy your personal link from the menu on the device where you joined. If not, add an initial.`,
          },
        },
        409,
      );
    }

    const now = new Date().toISOString();
    const member = {
      id: randomUUID(),
      name,
      role: "guest" as const,
      color: nextFreeColor(db),
      linkToken: newLinkToken(),
      createdAt: now,
    };
    db.insert(members).values(member).run();

    const night = nextEvent(db);
    if (night && status) db.insert(rsvps).values({ eventId: night.id, memberId: member.id, status, updatedAt: now }).run();

    startSession(c, db, member.id);
    return c.json({ id: member.id, name: member.name, role: member.role, color: member.color }, 201);
  });

  return app;
}

// Host settings for the group link.
export function inviteRoutes(db: AppDb) {
  const app = new Hono<SessionEnv>();
  app.use("*", sessionMiddleware(db), requireHost);

  const view = () => {
    const { link, code, limit, used } = getInvite(db);
    return { link, code, limit, used };
  };

  app.get("/", (c) => c.json(view()));

  app.patch("/", async (c) => {
    const parsed = limitBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "BAD_REQUEST", message: "The limit must be between 2 and 50" } }, 400);
    setSetting(db, "invite_limit", String(parsed.data.limit));
    return c.json(view());
  });

  // Replaces the group link and the group code together, since either one lets people join.
  // People who already joined stay signed in.
  app.post("/new-link", (c) => {
    setSetting(db, "invite_token", newLinkToken());
    setSetting(db, GROUP_CODE_KEY, freshCode(db));
    return c.json(view());
  });

  return app;
}
