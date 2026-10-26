import type { Game } from "./queries/games";

const LOCALE = "en-GB";

function parseLocal(startsAt: string) {
  const [date, time] = startsAt.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function formatNight(startsAt: string) {
  const date = parseLocal(startsAt);
  return {
    weekday: date.toLocaleDateString(LOCALE, { weekday: "long" }),
    day: date.toLocaleDateString(LOCALE, { day: "numeric", month: "short" }),
    full: date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    time: startsAt.split("T")[1],
  };
}

export function countdown(startsAt: string) {
  const start = parseLocal(startsAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "already played";
  if (days === 0) return "tonight";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function formatPlayers(game: Pick<Game, "minPlayers" | "maxPlayers">) {
  return game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} players`
    : `${game.minPlayers}–${game.maxPlayers} players`;
}

// "Cascadia: Landmarks" on Cascadia's card reads better as "Landmarks".
export function expansionName(expansion: string, baseGame: string) {
  return expansion.toLowerCase().startsWith(baseGame.toLowerCase())
    ? expansion.slice(baseGame.length).replace(/^\s*[:–—-]\s*/, "") || expansion
    : expansion;
}

// "1–4 players, 6 with Landmarks" when an owned expansion adds seats.
export function formatPlayersWithExpansions(game: Pick<Game, "name" | "minPlayers" | "maxPlayers" | "maxWithExpansions" | "expansions">) {
  const base = formatPlayers(game);
  if (game.maxWithExpansions <= game.maxPlayers) return base;
  const adds = game.expansions.find((e) => e.maxPlayers === game.maxWithExpansions);
  return `${base}, ${game.maxWithExpansions} with ${adds ? expansionName(adds.name, game.name) : "expansions"}`;
}

export function formatTime(game: Pick<Game, "minTime" | "maxTime">) {
  if (!game.minTime) return null;
  return !game.maxTime || game.maxTime === game.minTime ? `${game.minTime} min` : `${game.minTime}–${game.maxTime} min`;
}

// BGG weight runs from 1 (light) to 5 (heavy).
export function formatWeight(weight: number | null) {
  if (!weight) return null;
  if (weight < 1.8) return "Light";
  if (weight < 2.6) return "Medium-light";
  if (weight < 3.4) return "Medium";
  if (weight < 4.2) return "Medium-heavy";
  return "Heavy";
}

export function formatBestWith(bestWith: number[]) {
  if (bestWith.length === 0) return null;
  const first = bestWith[0];
  const last = bestWith[bestWith.length - 1];
  const contiguous = last - first === bestWith.length - 1;
  return `Best with ${contiguous && bestWith.length > 1 ? `${first}–${last}` : bestWith.join(", ")}`;
}

// Games typed in by hand without a BGG link have negative ids and no BGG page.
export function bggUrl(bggId: number) {
  return bggId > 0 ? `https://boardgamegeek.com/boardgame/${bggId}` : null;
}
