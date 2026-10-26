import { Hono } from "hono";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "../db/client";
import { games, shelf } from "../db/schema";
import { BggError, ensureGames, fetchCollectionIds, searchGames, type BggGame } from "../bgg/client";
import { parseCollectionCsv } from "../bgg/collection-csv";
import { requireHost, sessionMiddleware, type SessionEnv } from "../middleware/session";
import { getEnv } from "../env";

export type ExpansionDto = { bggId: number; name: string; minPlayers: number; maxPlayers: number };

export type GameDto = Omit<typeof games.$inferSelect, "bestWith" | "fetchedAt"> & {
  bestWith: number[];
  onShelf: boolean;
  // Expansions for this game that are on the shelf.
  expansions: ExpansionDto[];
  // The most players the game seats with those expansions.
  maxWithExpansions: number;
};

export function toGameDto(game: typeof games.$inferSelect, onShelf: boolean, expansions: ExpansionDto[] = []): GameDto {
  const { fetchedAt: _fetchedAt, ...rest } = game;
  return {
    ...rest,
    bestWith: JSON.parse(game.bestWith),
    onShelf,
    expansions,
    maxWithExpansions: Math.max(game.maxPlayers, ...expansions.map((e) => e.maxPlayers)),
  };
}

// Expansions on the shelf, grouped by the base game they belong to.
export function shelfExpansions(db: AppDb) {
  const rows = db
    .select({ bggId: games.bggId, name: games.name, minPlayers: games.minPlayers, maxPlayers: games.maxPlayers, baseId: games.baseId })
    .from(shelf)
    .innerJoin(games, eq(games.bggId, shelf.bggId))
    .where(and(eq(games.kind, "expansion"), sql`${games.baseId} is not null`))
    .orderBy(asc(games.name))
    .all();
  const byBase = new Map<number, ExpansionDto[]>();
  for (const { baseId, ...expansion } of rows) {
    if (!byBase.has(baseId!)) byBase.set(baseId!, []);
    byBase.get(baseId!)!.push(expansion);
  }
  return byBase;
}

// Saves games from a CSV import. The CSV has no thumbnails, so keep any we already have,
// and keep a base-game link the host set by hand when the CSV can't match one.
function saveImported(db: AppDb, list: BggGame[]) {
  for (const game of list) {
    db.insert(games)
      .values(game)
      .onConflictDoUpdate({
        target: games.bggId,
        set: {
          ...game,
          thumbnail: sql`coalesce(excluded.thumbnail, ${games.thumbnail})`,
          baseId: sql`coalesce(excluded.base_id, ${games.baseId})`,
        },
      })
      .run();
  }
}

export function shelfIds(db: AppDb) {
  return new Set(db.select({ bggId: shelf.bggId }).from(shelf).all().map((s) => s.bggId));
}

export function bggErrorResponse(error: unknown) {
  if (error instanceof BggError) return { error: { code: "BGG", message: error.message } };
  throw error;
}

const addBody = z.object({ bggId: z.number().int().refine((id) => id !== 0) });

// A game typed in by hand, for when BGG can't be reached or doesn't know the game.
const manualBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    minPlayers: z.number().int().min(1).max(99),
    maxPlayers: z.number().int().min(1).max(99),
    minTime: z.number().int().min(1).max(1440).nullable().default(null),
    maxTime: z.number().int().min(1).max(1440).nullable().default(null),
    weight: z.number().min(1).max(5).nullable().default(null),
    // A BGG game link, or just its id. Keeps the real id so the box image can be fetched later.
    bggLink: z.string().trim().max(300).nullable().default(null),
    baseId: z.number().int().nullable().default(null),
  })
  .refine((g) => g.maxPlayers >= g.minPlayers, { message: "The most players can't be fewer than the fewest" })
  .refine((g) => !g.minTime || !g.maxTime || g.maxTime >= g.minTime, { message: "The longest play time can't be shorter than the shortest" });

export function bggIdFromLink(link: string | null) {
  if (!link) return null;
  const match = link.match(/boardgame(?:expansion)?\/(\d+)/) ?? link.match(/^(\d+)$/);
  return match ? Number(match[1]) : null;
}
const importBody = z.object({ username: z.string().trim().min(1).max(60) });
const csvBody = z.object({ csv: z.string().min(1).max(5_000_000), replace: z.boolean().default(false) });
const baseBody = z.object({ baseId: z.number().int().positive().nullable() });

export function gamesRoutes(db: AppDb) {
  const app = new Hono<SessionEnv>();
  app.use("*", sessionMiddleware(db));

  // Whether BGG lookups work on this server. The app falls back to typing games in by hand.
  app.get("/status", (c) => c.json({ bgg: Boolean(getEnv().bggToken) }));

  app.post("/manual", async (c) => {
    const parsed = manualBody.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Check the game details" } }, 400);
    }
    const input = parsed.data;
    const linkedId = bggIdFromLink(input.bggLink);
    if (input.bggLink && !linkedId) {
      return c.json({ error: { code: "BAD_REQUEST", message: "That doesn't look like a BoardGameGeek game link" } }, 400);
    }
    if (input.baseId !== null) {
      if (c.get("member").role !== "host") {
        return c.json({ error: { code: "FORBIDDEN", message: "Only the host can add expansions" } }, 403);
      }
      if (db.select().from(games).where(eq(games.bggId, input.baseId)).get()?.kind !== "base") {
        return c.json({ error: { code: "BAD_REQUEST", message: "Pick a base game for the expansion" } }, 400);
      }
    }

    // Reuse a game we already know, by BGG id or by name, instead of making a copy.
    const existing =
      (linkedId && db.select().from(games).where(eq(games.bggId, linkedId)).get()) ||
      db.select().from(games).where(sql`lower(${games.name}) = lower(${input.name})`).get();
    if (existing) return c.json({ bggId: existing.bggId, created: false });

    // Games without a BGG id get negative ids, so they never clash with real ones.
    const lowest = db.select({ id: sql<number>`min(${games.bggId})` }).from(games).get()?.id ?? 0;
    const bggId = linkedId ?? Math.min(lowest, 0) - 1;
    db.insert(games)
      .values({
        bggId,
        name: input.name,
        year: null,
        minPlayers: input.minPlayers,
        maxPlayers: input.maxPlayers,
        bestWith: "[]",
        minTime: input.minTime,
        maxTime: input.maxTime ?? input.minTime,
        weight: input.weight,
        thumbnail: null,
        kind: input.baseId === null ? "base" : "expansion",
        baseId: input.baseId,
        fetchedAt: new Date().toISOString(),
      })
      .run();
    return c.json({ bggId, created: true }, 201);
  });

  // Searches the games this app already knows (the shelf, and games typed in before),
  // then BoardGameGeek when a token is set. BGG being off or down never fails the search.
  app.get("/search", async (c) => {
    const q = c.req.query("q")?.trim() ?? "";
    if (q.length < 2) return c.json({ results: [], bgg: "ok" });
    const owned = shelfIds(db);

    const local = db
      .select({ bggId: games.bggId, name: games.name, year: games.year, kind: games.kind })
      .from(games)
      // Escape LIKE wildcards so "%" and "_" in a name match themselves.
      .where(sql`lower(${games.name}) like ${"%" + q.toLowerCase().replace(/[\\%_]/g, "\\$&") + "%"} escape '\\'`)
      .orderBy(asc(games.name))
      .limit(15)
      .all()
      .map((g) => ({ ...g, onShelf: owned.has(g.bggId), source: "known" as const }))
      .sort((a, b) => Number(b.onShelf) - Number(a.onShelf));

    if (!getEnv().bggToken) return c.json({ results: local, bgg: "off" });
    try {
      const known = new Set(local.map((g) => g.bggId));
      const remote = (await searchGames(q))
        .filter((r) => !known.has(r.bggId))
        .slice(0, 25)
        .map((r) => ({ ...r, kind: null, onShelf: owned.has(r.bggId), source: "bgg" as const }));
      return c.json({ results: [...local, ...remote], bgg: "ok" });
    } catch (error) {
      return c.json({ results: local, bgg: "error", message: bggErrorResponse(error).error.message });
    }
  });

  return app;
}

export function shelfRoutes(db: AppDb) {
  const app = new Hono<SessionEnv>();
  app.use("*", sessionMiddleware(db));

  app.get("/", (c) => {
    const rows = db
      .select({ game: games })
      .from(shelf)
      .innerJoin(games, eq(games.bggId, shelf.bggId))
      .orderBy(asc(games.name))
      .all();
    const expansions = shelfExpansions(db);
    return c.json(rows.map((r) => toGameDto(r.game, true, expansions.get(r.game.bggId))));
  });

  // Imports a BGG collection export. With replace, games missing from the file leave the shelf.
  app.post("/import-csv", requireHost, async (c) => {
    const parsed = csvBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "BAD_REQUEST", message: "Choose a CSV file" } }, 400);
    let list: BggGame[];
    try {
      list = parseCollectionCsv(parsed.data.csv);
    } catch (error) {
      return c.json({ error: { code: "BAD_REQUEST", message: (error as Error).message } }, 400);
    }

    const before = shelfIds(db);
    const now = new Date().toISOString();
    db.transaction(() => {
      saveImported(db, list);
      if (parsed.data.replace) db.delete(shelf).run();
      for (const { bggId } of list) db.insert(shelf).values({ bggId, addedAt: now }).onConflictDoNothing().run();
    });

    const expansions = list.filter((g) => g.kind === "expansion");
    return c.json({
      added: list.filter((g) => !before.has(g.bggId)).length,
      removed: parsed.data.replace ? [...before].filter((id) => !list.some((g) => g.bggId === id)).length : 0,
      baseGames: list.length - expansions.length,
      expansions: expansions.length,
      unmatched: expansions.filter((g) => !g.baseId).map((g) => g.name),
    });
  });

  // Sets which base game an expansion belongs to, when the import couldn't tell.
  app.patch("/:bggId", requireHost, async (c) => {
    const parsed = baseBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "BAD_REQUEST", message: "Invalid request body" } }, 400);
    const bggId = Number(c.req.param("bggId"));
    const expansion = db.select().from(games).where(eq(games.bggId, bggId)).get();
    if (expansion?.kind !== "expansion") {
      return c.json({ error: { code: "BAD_REQUEST", message: "Only an expansion can belong to a base game" } }, 400);
    }
    const { baseId } = parsed.data;
    if (baseId !== null && db.select().from(games).where(eq(games.bggId, baseId)).get()?.kind !== "base") {
      return c.json({ error: { code: "BAD_REQUEST", message: "Pick a base game" } }, 400);
    }
    db.update(games).set({ baseId }).where(eq(games.bggId, bggId)).run();
    return c.json({ ok: true });
  });

  app.post("/", requireHost, async (c) => {
    const parsed = addBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "BAD_REQUEST", message: "Invalid request body" } }, 400);
    try {
      await ensureGames(db, [parsed.data.bggId]);
    } catch (error) {
      return c.json(bggErrorResponse(error), 502);
    }
    db.insert(shelf).values({ bggId: parsed.data.bggId, addedAt: new Date().toISOString() }).onConflictDoNothing().run();
    return c.json({ ok: true }, 201);
  });

  app.post("/import", requireHost, async (c) => {
    const parsed = importBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "BAD_REQUEST", message: "Enter a BGG username" } }, 400);
    try {
      const ids = await fetchCollectionIds(parsed.data.username);
      const before = shelfIds(db);
      // Refresh every game, so CSV imports get thumbnails and BGG's own expansion links.
      await ensureGames(db, ids, { refresh: true });
      const now = new Date().toISOString();
      // ensureGames skips ids BGG did not return, so add only games that now exist.
      const known = ids.length
        ? db.select({ bggId: games.bggId }).from(games).where(inArray(games.bggId, ids)).all()
        : [];
      for (const { bggId } of known) {
        db.insert(shelf).values({ bggId, addedAt: now }).onConflictDoNothing().run();
      }
      return c.json({ added: known.filter((g) => !before.has(g.bggId)).length, total: known.length });
    } catch (error) {
      return c.json(bggErrorResponse(error), 502);
    }
  });

  app.delete("/:bggId", requireHost, (c) => {
    db.delete(shelf).where(eq(shelf.bggId, Number(c.req.param("bggId")))).run();
    return c.json({ ok: true });
  });

  return app;
}
