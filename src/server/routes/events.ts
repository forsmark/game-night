import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "../db/client";
import { events, games, members, nominations, rsvps, shelf, votes } from "../db/schema";
import { ensureGames } from "../bgg/client";
import { plan } from "../planner/plan";
import { requireHost, sessionMiddleware, type SessionEnv } from "../middleware/session";
import { bggErrorResponse, shelfExpansions, shelfIds, toGameDto } from "./games";

const eventBody = z.object({
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  location: z.string().trim().max(120).default(""),
  note: z.string().trim().max(1000).default(""),
  splitAt: z.number().int().min(4).max(20).default(7),
});
const rsvpBody = z.object({ status: z.enum(["yes", "maybe", "no"]) });
const nominateBody = z.object({ bggId: z.number().int().refine((id) => id !== 0), bringing: z.boolean() });
const voteBody = z.object({ approve: z.boolean() });

const badRequest = (message = "Invalid request body") => ({ error: { code: "BAD_REQUEST", message } });
const notFound = { error: { code: "NOT_FOUND", message: "No such game night" } };

function today() {
  // sv-SE formats as YYYY-MM-DD, which sorts like the stored startsAt strings.
  return new Date().toLocaleDateString("sv-SE");
}

// The first night that is today or later.
export function nextEvent(db: AppDb) {
  return db.select().from(events).where(gte(events.startsAt, today())).orderBy(asc(events.startsAt)).get();
}

function eventDetail(db: AppDb, eventId: string, includeMaybes: boolean) {
  const event = db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) return null;

  const allMembers = db
    .select({ id: members.id, name: members.name, color: members.color })
    .from(members)
    .orderBy(asc(members.createdAt))
    .all();
  const rsvpRows = db
    .select({ memberId: rsvps.memberId, status: rsvps.status, updatedAt: rsvps.updatedAt })
    .from(rsvps)
    .where(eq(rsvps.eventId, eventId))
    .orderBy(asc(rsvps.updatedAt))
    .all();
  const nominationRows = db
    .select({ nomination: nominations, game: games })
    .from(nominations)
    .innerJoin(games, eq(games.bggId, nominations.bggId))
    .where(eq(nominations.eventId, eventId))
    .orderBy(asc(nominations.createdAt))
    .all();
  const voteRows = db.select().from(votes).where(eq(votes.eventId, eventId)).all();

  const approvals = new Map<number, Set<string>>();
  for (const v of voteRows) {
    if (!approvals.has(v.bggId)) approvals.set(v.bggId, new Set());
    approvals.get(v.bggId)!.add(v.memberId);
  }

  const owned = shelfIds(db);
  const expansions = shelfExpansions(db);
  const nominated = nominationRows.map(({ nomination, game }) => ({
    // Shelf expansions come along whoever brings the game, since they are at the host's place.
    game: toGameDto(game, owned.has(game.bggId), expansions.get(game.bggId)),
    nominatedBy: nomination.nominatedBy,
    broughtBy: nomination.broughtBy,
    voters: [...(approvals.get(game.bggId) ?? [])],
  }));

  // Seat people in the order they said yes, so early birds keep their seat when the plan shifts.
  const attending = rsvpRows.filter((r) => r.status === "yes" || (includeMaybes && r.status === "maybe"));

  return {
    event,
    members: allMembers,
    rsvps: rsvpRows.map(({ memberId, status }) => ({ memberId, status })),
    nominations: nominated,
    includeMaybes,
    plan: plan({
      attendees: attending.map((r) => r.memberId),
      // An owned expansion can add seats, for example a 5-6 player extension.
      games: nominated.map((n) => ({ ...n.game, maxPlayers: n.game.maxWithExpansions })),
      approvals,
      splitAt: event.splitAt,
    }),
  };
}

export function eventsRoutes(db: AppDb) {
  const app = new Hono<SessionEnv>();
  app.use("*", sessionMiddleware(db));

  app.get("/", (c) => {
    const rows = db
      .select({
        id: events.id,
        startsAt: events.startsAt,
        location: events.location,
        going: sql<number>`(select count(*) from ${rsvps} where ${rsvps.eventId} = ${events.id} and ${rsvps.status} = 'yes')`,
      })
      .from(events)
      .orderBy(desc(events.startsAt))
      .all();
    return c.json(rows);
  });

  app.get("/next", (c) => c.json({ id: nextEvent(db)?.id ?? null }));

  app.get("/:id", (c) => {
    const detail = eventDetail(db, c.req.param("id"), c.req.query("maybes") === "1");
    return detail ? c.json(detail) : c.json(notFound, 404);
  });

  app.post("/", requireHost, async (c) => {
    const parsed = eventBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json(badRequest(), 400);
    const id = randomUUID();
    db.insert(events)
      .values({ id, ...parsed.data, createdAt: new Date().toISOString() })
      .run();
    // The host is always invited to their own night.
    db.insert(rsvps)
      .values({ eventId: id, memberId: c.get("member").id, status: "yes", updatedAt: new Date().toISOString() })
      .run();
    return c.json({ id }, 201);
  });

  app.patch("/:id", requireHost, async (c) => {
    const parsed = eventBody.partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json(badRequest(), 400);
    db.update(events).set(parsed.data).where(eq(events.id, c.req.param("id"))).run();
    return c.json({ ok: true });
  });

  app.delete("/:id", requireHost, (c) => {
    db.delete(events).where(eq(events.id, c.req.param("id"))).run();
    return c.json({ ok: true });
  });

  app.put("/:id/rsvp", async (c) => {
    const parsed = rsvpBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json(badRequest(), 400);
    const eventId = c.req.param("id");
    if (!db.select().from(events).where(eq(events.id, eventId)).get()) return c.json(notFound, 404);

    const row = { eventId, memberId: c.get("member").id, status: parsed.data.status, updatedAt: new Date().toISOString() };
    const existing = db
      .select()
      .from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.memberId, row.memberId)))
      .get();
    // Keep the original timestamp when someone only switches between yes and maybe,
    // so they keep their place in the seating order.
    if (existing && existing.status !== "no" && row.status !== "no") row.updatedAt = existing.updatedAt;
    db.insert(rsvps)
      .values(row)
      .onConflictDoUpdate({ target: [rsvps.eventId, rsvps.memberId], set: { status: row.status, updatedAt: row.updatedAt } })
      .run();
    return c.json({ ok: true });
  });

  app.post("/:id/nominations", async (c) => {
    const parsed = nominateBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json(badRequest(), 400);
    const eventId = c.req.param("id");
    const me = c.get("member").id;
    const { bggId, bringing } = parsed.data;
    if (!db.select().from(events).where(eq(events.id, eventId)).get()) return c.json(notFound, 404);

    if (!bringing && !db.select().from(shelf).where(eq(shelf.bggId, bggId)).get()) {
      return c.json(badRequest("That game is not on the shelf. Choose “I'll bring it” instead."), 400);
    }
    try {
      await ensureGames(db, [bggId]);
    } catch (error) {
      return c.json(bggErrorResponse(error), 502);
    }
    const game = db.select().from(games).where(eq(games.bggId, bggId)).get();
    if (!game) return c.json(badRequest("BoardGameGeek has no game with that id"), 400);
    if (game.kind === "expansion") {
      return c.json(badRequest("That's an expansion. Suggest the base game instead. Owned expansions show up with it."), 400);
    }

    const existing = db
      .select()
      .from(nominations)
      .where(and(eq(nominations.eventId, eventId), eq(nominations.bggId, bggId)))
      .get();
    if (!existing) {
      db.insert(nominations)
        .values({ eventId, bggId, nominatedBy: me, broughtBy: bringing ? me : null, createdAt: new Date().toISOString() })
        .run();
    } else if (bringing && !existing.broughtBy) {
      db.update(nominations)
        .set({ broughtBy: me })
        .where(and(eq(nominations.eventId, eventId), eq(nominations.bggId, bggId)))
        .run();
    }
    // Suggesting a game counts as wanting to play it.
    db.insert(votes).values({ eventId, bggId, memberId: me }).onConflictDoNothing().run();
    return c.json({ ok: true }, 201);
  });

  app.delete("/:id/nominations/:bggId", (c) => {
    const eventId = c.req.param("id");
    const bggId = Number(c.req.param("bggId"));
    const member = c.get("member");
    const where = and(eq(nominations.eventId, eventId), eq(nominations.bggId, bggId));
    const nomination = db.select().from(nominations).where(where).get();
    if (!nomination) return c.json({ ok: true });
    if (member.role !== "host" && nomination.nominatedBy !== member.id) {
      return c.json({ error: { code: "FORBIDDEN", message: "Only the person who suggested it or the host can remove it" } }, 403);
    }
    db.delete(nominations).where(where).run();
    db.delete(votes).where(and(eq(votes.eventId, eventId), eq(votes.bggId, bggId))).run();
    return c.json({ ok: true });
  });

  app.put("/:id/votes/:bggId", async (c) => {
    const parsed = voteBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json(badRequest(), 400);
    const eventId = c.req.param("id");
    const bggId = Number(c.req.param("bggId"));
    const memberId = c.get("member").id;
    const nominated = db
      .select()
      .from(nominations)
      .where(and(eq(nominations.eventId, eventId), eq(nominations.bggId, bggId)))
      .get();
    if (!nominated) return c.json(badRequest("That game is not on the vote list"), 400);

    if (parsed.data.approve) {
      db.insert(votes).values({ eventId, bggId, memberId }).onConflictDoNothing().run();
    } else {
      db.delete(votes)
        .where(and(eq(votes.eventId, eventId), eq(votes.bggId, bggId), eq(votes.memberId, memberId)))
        .run();
    }
    return c.json({ ok: true });
  });

  return app;
}
