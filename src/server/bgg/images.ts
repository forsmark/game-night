import { and, eq, gt, isNull, notInArray } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { games, shelf } from "../db/schema";
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
