import { and, eq, gt, inArray, isNull, notInArray } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { gameImages, games, shelf } from "../db/schema";
import { getEnv } from "../env";
import { BggError, fetchThings, THING_BATCH } from "./client";
import { fetchGeekdoImage } from "./geekdo";

// The CSV import has no box images, so shelf games come in without one. This fills them in
// the background, a game at a time, because a whole collection takes minutes at a polite pace.
// Tests set delayMs to 0.
export const imageFill = { delayMs: 1000 };

let running: Promise<void> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Shelf games with a BGG id and no image, leaving out the ones this run already tried.
function missing(db: AppDb, tried: Set<number>, limit: number) {
  return db
    .select({ bggId: games.bggId })
    .from(shelf)
    .innerJoin(games, eq(games.bggId, shelf.bggId))
    .where(and(isNull(games.thumbnail), gt(games.bggId, 0), tried.size ? notInArray(games.bggId, [...tried]) : undefined))
    .limit(limit)
    .all()
    .map((g) => g.bggId);
}

export function countMissingImages(db: AppDb) {
  return missing(db, new Set(), 100_000).length;
}

// Sets only the image, and only where there is none, so the CSV's numbers and a host's edits stay.
function saveImage(db: AppDb, bggId: number, thumbnail: string | null) {
  if (!thumbnail) return;
  db.update(games).set({ thumbnail }).where(and(eq(games.bggId, bggId), isNull(games.thumbnail))).run();
}

async function run(db: AppDb) {
  // Each game is tried once per run, so a game BGG has no image for doesn't loop forever.
  // Games added while the run goes are picked up, because the list is read again each time.
  const tried = new Set<number>();
  const useToken = Boolean(getEnv().bggToken);
  for (let first = true; ; first = false) {
    const batch = missing(db, tried, useToken ? THING_BATCH : 1);
    if (batch.length === 0) return;
    if (!first) await sleep(imageFill.delayMs);
    for (const id of batch) tried.add(id);
    try {
      if (useToken) {
        for (const game of await fetchThings(batch)) saveImage(db, game.bggId, game.thumbnail);
      } else {
        saveImage(db, batch[0], await fetchGeekdoImage(batch[0]));
      }
    } catch (error) {
      // BGG is down or refusing. Stop rather than keep asking. The next import or restart tries again.
      if (error instanceof BggError) {
        console.log(`Stopped fetching box images: ${error.message}`);
        return;
      }
      throw error;
    }
  }
}

// Starts filling images unless a run is already going. Returns how many shelf games still need one.
export function startImageFill(db: AppDb) {
  const pending = countMissingImages(db);
  if (pending > 0 && !running) {
    running = run(db)
      .catch((error) => console.error("Fetching box images failed", error))
      .finally(() => {
        running = null;
      });
  }
  return pending;
}

// For tests: resolves when the current run is done.
export function imageFillDone() {
  return running ?? Promise.resolve();
}

// Images for search results: from games the app knows, then the cache. Ids with no entry here
// haven't been asked about yet.
export function cachedImages(db: AppDb, bggIds: number[]) {
  const images: Record<number, string | null> = {};
  if (bggIds.length === 0) return images;
  for (const row of db.select({ bggId: gameImages.bggId, url: gameImages.url }).from(gameImages).where(inArray(gameImages.bggId, bggIds)).all()) {
    images[row.bggId] = row.url;
  }
  for (const row of db.select({ bggId: games.bggId, thumbnail: games.thumbnail }).from(games).where(inArray(games.bggId, bggIds)).all()) {
    if (row.thumbnail) images[row.bggId] = row.thumbnail;
  }
  return images;
}

// One search-image request to BGG at a time, so fast typing doesn't send a burst.
let searchQueue: Promise<unknown> = Promise.resolve();

// Asks BGG for the images of up to THING_BATCH games in one request and caches every answer,
// including "no image", so each game is asked about once. Needs the token.
export function fetchSearchImages(db: AppDb, bggIds: number[]) {
  const ids = bggIds.filter((id) => id > 0).slice(0, THING_BATCH);
  const job = searchQueue.then(async () => {
    // Another request may have fetched some of these while this one waited.
    const missingIds = ids.filter((id) => !(id in cachedImages(db, [id])));
    if (missingIds.length === 0) return;
    const found = new Map((await fetchThings(missingIds, { stats: false })).map((g) => [g.bggId, g.thumbnail]));
    const now = new Date().toISOString();
    for (const bggId of missingIds) {
      const url = found.get(bggId) ?? null;
      db.insert(gameImages).values({ bggId, url, fetchedAt: now }).onConflictDoUpdate({ target: gameImages.bggId, set: { url, fetchedAt: now } }).run();
    }
  });
  searchQueue = job.catch(() => {});
  return job;
}
