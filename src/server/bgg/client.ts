import { XMLParser } from "fast-xml-parser";
import { inArray } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { games } from "../db/schema";
import { getEnv } from "../env";
import { fetchGeekdoGame } from "./geekdo";

const API = "https://boardgamegeek.com/xmlapi2";
// BGG rejects /thing requests with more ids than this.
export const THING_BATCH = 20;
const MAX_ATTEMPTS = 6;

export class BggError extends Error {}

export type BggSearchResult = { bggId: number; name: string; year: number | null };
export type BggGame = typeof games.$inferSelect;

const ARRAYS = new Set(["item", "name", "result", "results", "poll", "poll-summary", "link"]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  htmlEntities: true,
  isArray: (name, _jpath, _isLeaf, isAttribute) => !isAttribute && ARRAYS.has(name),
});

export function parseXml(text: string): any {
  return parser.parse(text);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchXml(path: string): Promise<any> {
  const { bggToken } = getEnv();
  if (!bggToken) {
    throw new BggError("BoardGameGeek lookups need a BGG_TOKEN. Add it to .env and restart the server.");
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${bggToken}` } });
    // 202: BGG queued a collection export. 429: too many requests. Both mean "try again shortly".
    if (res.status === 202 || res.status === 429) {
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 401) throw new BggError("BoardGameGeek rejected the BGG_TOKEN.");
    if (!res.ok) throw new BggError(`BoardGameGeek returned HTTP ${res.status}.`);
    return parseXml(await res.text());
  }
  throw new BggError("BoardGameGeek is busy. Try again in a minute.");
}

function value(node: any): string | undefined {
  return node?.value ?? undefined;
}

function int(node: any): number | null {
  const n = Number.parseInt(value(node) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function primaryName(item: any): string {
  const names: any[] = item.name ?? [];
  const primary = names.find((n) => n.type === "primary") ?? names[0];
  // /collection puts the name in the element text, the other endpoints in a value attribute.
  return String(primary?.value ?? primary?.["#text"] ?? `Game ${item.id}`);
}

// Turns "Best with 3–4 players" or "Best with 2, 4 players" into [3, 4] or [2, 4].
export function parseBestWith(summary: string | undefined): number[] {
  const match = summary?.match(/with\s+(.+?)\s+players?/i);
  if (!match) return [];
  const counts = new Set<number>();
  for (const part of match[1].split(/,\s*/)) {
    const [from, to] = part.split(/[–-]/).map((s) => Number.parseInt(s, 10));
    if (!Number.isFinite(from)) continue;
    for (let n = from; n <= (Number.isFinite(to) ? to : from); n++) counts.add(n);
  }
  return [...counts].sort((a, b) => a - b);
}

function bestWith(item: any): number[] {
  const summary = (item["poll-summary"] ?? []).find((p: any) => p.name === "suggested_numplayers");
  const best = (summary?.result ?? []).find((r: any) => r.name === "bestwith");
  return parseBestWith(value(best));
}

export function parseSearch(xml: any): BggSearchResult[] {
  return (xml?.items?.item ?? []).map((item: any) => ({
    bggId: Number(item.id),
    name: primaryName(item),
    year: int(item.yearpublished),
  }));
}

export function parseThings(xml: any, now = new Date().toISOString()): BggGame[] {
  return (xml?.items?.item ?? []).map((item: any) => {
    const minPlayers = int(item.minplayers) ?? 1;
    const minTime = int(item.minplaytime) ?? int(item.playingtime);
    const weight = Number.parseFloat(value(item.statistics?.ratings?.averageweight) ?? "");
    return {
      bggId: Number(item.id),
      name: primaryName(item),
      year: int(item.yearpublished),
      minPlayers,
      maxPlayers: Math.max(int(item.maxplayers) ?? minPlayers, minPlayers),
      bestWith: JSON.stringify(bestWith(item)),
      minTime,
      maxTime: int(item.maxplaytime) ?? minTime,
      weight: weight > 0 ? Math.round(weight * 100) / 100 : null,
      thumbnail: typeof item.thumbnail === "string" ? item.thumbnail.trim() : null,
      kind: item.type === "boardgameexpansion" ? ("expansion" as const) : ("base" as const),
      // On an expansion, the inbound expansion link points at the game it expands.
      baseId:
        item.type === "boardgameexpansion"
          ? Number((item.link ?? []).find((l: any) => l.type === "boardgameexpansion" && l.inbound === "true")?.id) || null
          : null,
      fetchedAt: now,
    };
  });
}

export function parseCollectionIds(xml: any): number[] {
  return (xml?.items?.item ?? []).map((item: any) => Number(item.objectid));
}

// Up to THING_BATCH games from the XML API. Needs the token.
export async function fetchThings(bggIds: number[]): Promise<BggGame[]> {
  return parseThings(await fetchXml(`/thing?stats=1&id=${bggIds.join(",")}`));
}

export async function searchGames(query: string): Promise<BggSearchResult[]> {
  const xml = await fetchXml(`/search?type=boardgame&query=${encodeURIComponent(query)}`);
  return parseSearch(xml);
}

export async function fetchCollectionIds(username: string): Promise<number[]> {
  const xml = await fetchXml(
    `/collection?username=${encodeURIComponent(username)}&own=1`,
  );
  if (xml?.errors) throw new BggError(`BoardGameGeek has no user called "${username}".`);
  return parseCollectionIds(xml);
}

// Makes sure every id has a row in the games table. Fetches only the missing ones,
// or all of them with refresh, for example to add thumbnails to games imported from a CSV.
export async function ensureGames(db: AppDb, bggIds: number[], { refresh = false } = {}) {
  // Negative ids are games typed in by hand. BGG doesn't know them.
  const unique = [...new Set(bggIds)].filter((id) => id > 0);
  if (unique.length === 0) return;
  const known = new Set(
    db
      .select({ bggId: games.bggId })
      .from(games)
      .where(inArray(games.bggId, unique))
      .all()
      .map((g) => g.bggId),
  );
  const missing = refresh ? unique : unique.filter((id) => !known.has(id));

  // Without a token, ask geekdo one game at a time, paced like someone clicking through BGG.
  if (!getEnv().bggToken) {
    for (const [i, bggId] of missing.entries()) {
      if (i > 0) await sleep(1000);
      const game = await fetchGeekdoGame(bggId);
      if (game) db.insert(games).values(game).onConflictDoUpdate({ target: games.bggId, set: game }).run();
    }
    return;
  }

  for (let i = 0; i < missing.length; i += THING_BATCH) {
    if (i > 0) await sleep(2000);
    const batch = missing.slice(i, i + THING_BATCH);
    const fetched = await fetchThings(batch);
    for (const game of fetched) {
      db.insert(games).values(game).onConflictDoUpdate({ target: games.bggId, set: game }).run();
    }
  }
}
