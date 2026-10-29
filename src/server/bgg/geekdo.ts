import { BggError, type BggGame } from "./client";

// The JSON API BoardGameGeek's own website loads its game pages from. It's undocumented and
// needs no token, so it fills in for the XML API until there is a BGG_TOKEN. It can change or
// go away without notice, so a failed lookup must never break more than that one lookup.
const API = "https://api.geekdo.com/api";
const TIMEOUT_MS = 10_000;

function positiveInt(value: unknown) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The "best with" poll comes as ranges, e.g. [{min: 3, max: 4}].
export function parseBestRanges(ranges: unknown): number[] {
  const counts = new Set<number>();
  for (const range of Array.isArray(ranges) ? ranges : []) {
    const from = positiveInt(range?.min);
    const to = positiveInt(range?.max) ?? from;
    if (!from || !to) continue;
    // Ranges above 20 players are poll noise, and would make a long list.
    for (let n = from; n <= Math.min(to, 20); n++) counts.add(n);
  }
  return [...counts].sort((a, b) => a - b);
}

// item: the geekitems response. dynamic: the dynamicinfo response, or null when that request failed.
export function parseGeekdo(item: any, dynamic: any, now = new Date().toISOString()): BggGame | null {
  const game = item?.item;
  if (!game || !["boardgame", "boardgameexpansion"].includes(game.subtype)) return null;
  const minPlayers = positiveInt(game.minplayers) ?? 1;
  const minTime = positiveInt(game.minplaytime);
  const polls = dynamic?.item?.polls;
  const weight = Number(polls?.boardgameweight?.averageweight);
  const image = game.images?.square200 ?? game.images?.thumb ?? game.imageurl;
  const isExpansion = game.subtype === "boardgameexpansion";
  return {
    bggId: Number(game.objectid),
    name: String(game.name),
    year: positiveInt(game.yearpublished),
    minPlayers,
    maxPlayers: Math.max(positiveInt(game.maxplayers) ?? minPlayers, minPlayers),
    bestWith: JSON.stringify(parseBestRanges(polls?.userplayers?.best)),
    minTime,
    maxTime: positiveInt(game.maxplaytime) ?? minTime,
    weight: weight > 0 ? Math.round(weight * 100) / 100 : null,
    thumbnail: typeof image === "string" && image.startsWith("https://") ? image : null,
    kind: isExpansion ? "expansion" : "base",
    // An expansion can list several games. The first is the one it was made for.
    baseId: isExpansion ? positiveInt(game.links?.expandsboardgame?.[0]?.objectid) : null,
    fetchedAt: now,
  };
}

// Null for 404: BGG has no game with that id.
async function getJson(path: string): Promise<any | null> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "game-night (board game night planner)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new BggError("BoardGameGeek didn't answer. Try again, or add the game by hand.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new BggError(`BoardGameGeek returned HTTP ${res.status}. Try again, or add the game by hand.`);
  return res.json();
}

// Just the box image, for games whose other details came from a CSV. One request instead of two.
export async function fetchGeekdoImage(bggId: number): Promise<string | null> {
  const item = await getJson(`/geekitems?objectid=${bggId}&objecttype=thing`);
  return parseGeekdo(item, null)?.thumbnail ?? null;
}

export async function fetchGeekdoGame(bggId: number): Promise<BggGame | null> {
  const item = await getJson(`/geekitems?objectid=${bggId}&objecttype=thing`);
  if (!item?.item) return null;
  // Weight and "best with" are nice to have. Save the game without them rather than not at all.
  const dynamic = await getJson(`/dynamicinfo?objectid=${bggId}&objecttype=thing`).catch(() => null);
  return parseGeekdo(item, dynamic);
}
