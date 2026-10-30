import { Hono } from "hono";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "../db/client";
import { catalogue, games, settings, shelf } from "../db/schema";
import { BggError, ensureGames, fetchCollectionIds, searchGames, THING_BATCH, type BggGame } from "../bgg/client";
import { parseCollectionCsv } from "../bgg/collection-csv";
import { parseRanksCsv, searchKey } from "../bgg/ranks-csv";
import { cachedImages, fetchSearchImages, startImageFill } from "../bgg/images";
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
// The ranks file is about 11 MB.
const ranksBody = z.object({ csv: z.string().min(1).max(30_000_000) });
const CATALOGUE_KEY = "catalogue_imported_at";

function catalogueInfo(db: AppDb) {
  const count = db.select({ n: sql<number>`count(*)` }).from(catalogue).get()?.n ?? 0;
  const importedAt = db.select().from(settings).where(eq(settings.key, CATALOGUE_KEY)).get()?.value ?? null;
  return { games: count, importedAt };
}

// Every word must start a word in the name, so "heat" finds "Heat: Pedal to the Metal" but not
// "Cheating Moth". Ranked games come first, best rank first, then the most rated.
export function searchCatalogue(db: AppDb, query: string, limit = 20) {
  const words = searchKey(query).trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  // searchKey leaves only letters, digits and spaces, so the words can't hold LIKE wildcards.
  const matches = words.map((word) => sql`${catalogue.search} like ${"% " + word + "%"}`);
  return db
    .select({ bggId: catalogue.bggId, name: catalogue.name, year: catalogue.year, kind: catalogue.kind })
    .from(catalogue)
    .where(and(...matches))
    .orderBy(sql`${catalogue.rank} is null`, asc(catalogue.rank), sql`${catalogue.usersRated} desc`)
    .limit(limit)
    .all();
}
const csvBody = z.object({ csv: z.string().min(1).max(5_000_000), replace: z.boolean().default(false) });
const baseBody = z.object({ baseId: z.number().int().positive().nullable() });

export function gamesRoutes(db: AppDb) {
  const app = new Hono<SessionEnv>();
  app.use("*", sessionMiddleware(db));

  // Whether BGG lookups work on this server. The app falls back to typing games in by hand.
  // bgg: whether the XML API token is set. catalogue: the BGG game list search runs on.
  app.get("/status", (c) => c.json({ bgg: Boolean(getEnv().bggToken), catalogue: catalogueInfo(db) }));

  // Loads BGG's ranks file, replacing the list from the last upload.
  app.post("/catalogue", requireHost, async (c) => {
    const parsed = ranksBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "BAD_REQUEST", message: "Choose the ranks CSV file" } }, 400);
    let list: ReturnType<typeof parseRanksCsv>;
    try {
      list = parseRanksCsv(parsed.data.csv);
    } catch (error) {
      return c.json({ error: { code: "BAD_REQUEST", message: (error as Error).message } }, 400);
    }
    if (list.length === 0) return c.json({ error: { code: "BAD_REQUEST", message: "The file has no games in it" } }, 400);

    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.delete(catalogue).run();
      // Seven columns a row stays well under SQLite's limit of 32,766 values per statement.
      for (let i = 0; i < list.length; i += 1000) tx.insert(catalogue).values(list.slice(i, i + 1000)).run();
      tx.insert(settings)
        .values({ key: CATALOGUE_KEY, value: now })
        .onConflictDoUpdate({ target: settings.key, set: { value: now } })
        .run();
    });
    return c.json(catalogueInfo(db));
  });

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

  // Searches the games this app already knows (the shelf, and games typed in before), then the
  // BGG game list, then BoardGameGeek itself when a token is set. BGG being off or down never
  // fails the search.
  app.get("/search", async (c) => {
    const q = c.req.query("q")?.trim() ?? "";
    const hasCatalogue = Boolean(db.select({ id: catalogue.bggId }).from(catalogue).limit(1).get());
    if (q.length < 2) return c.json({ results: [], bgg: "ok", catalogue: hasCatalogue });
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
    const seen = new Set(local.map((g) => g.bggId));
    const fromList = searchCatalogue(db, q).filter((g) => !seen.has(g.bggId));
    // The name search above misses "heat pedal" for "Heat: Pedal to the Metal", so a game the app
    // already has can turn up here. It is still a known game.
    const knownIds = fromList.length
      ? new Set(db.select({ bggId: games.bggId }).from(games).where(inArray(games.bggId, fromList.map((g) => g.bggId))).all().map((g) => g.bggId))
      : new Set<number>();
    const listed = fromList.map((g) => ({
      ...g,
      onShelf: owned.has(g.bggId),
      source: knownIds.has(g.bggId) ? ("known" as const) : ("catalogue" as const),
    }));
    for (const g of listed) seen.add(g.bggId);
    // Box images the app already has. The picker asks /images for the rest.
    const withImages = <T extends { bggId: number }>(list: T[]) => {
      const images = cachedImages(db, list.map((g) => g.bggId));
      return list.map((g) => ({ ...g, thumbnail: images[g.bggId] ?? null }));
    };
    const results = [...local, ...listed];

    if (!getEnv().bggToken) return c.json({ results: withImages(results), bgg: "off", catalogue: hasCatalogue });
    try {
      const remote = (await searchGames(q))
        .filter((r) => !seen.has(r.bggId))
        .slice(0, 25)
        .map((r) => ({ ...r, kind: null, onShelf: owned.has(r.bggId), source: "bgg" as const }));
      return c.json({ results: withImages([...results, ...remote]), bgg: "ok", catalogue: hasCatalogue });
    } catch (error) {
      return c.json({ results: withImages(results), bgg: "error", message: bggErrorResponse(error).error.message, catalogue: hasCatalogue });
    }
  });

  // Box images for search results, by id: ?ids=13,822. At most 20 ids, the most BGG returns
  // in one request. Cached images come back at once. With a token, the rest are fetched from BGG
  // in one request and cached. Without one, they stay missing. A null means BGG has no image.
  app.get("/images", async (c) => {
    const ids = [
      ...new Set(
        (c.req.query("ids") ?? "")
          .split(",")
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ].slice(0, THING_BATCH);
    const missing = ids.filter((id) => !(id in cachedImages(db, ids)));
    if (missing.length > 0 && getEnv().bggToken) {
      try {
        await fetchSearchImages(db, missing);
      } catch (error) {
        // Images are decoration. Answer with what we have rather than fail.
        if (!(error instanceof BggError)) throw error;
      }
    }
    return c.json({ images: cachedImages(db, ids) });
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
      // The file has no box images. They are fetched in the background, about one a second.
      imagesPending: startImageFill(db),
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
