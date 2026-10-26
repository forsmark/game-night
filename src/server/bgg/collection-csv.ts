import type { BggGame } from "./client";

// Splits CSV text into rows of fields. Handles quoted fields, "" escapes and newlines inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      (row = []), (field = "");
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

function positive(value: string | undefined) {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Expansions are named "Base game: Expansion" on BGG. Picks the longest base game name
// that starts the expansion's name, so "Small World Underground" never claims "Small World: ...".
export function matchBaseGame(expansionName: string, baseGames: { bggId: number; name: string }[]) {
  const lower = expansionName.toLowerCase();
  let best: { bggId: number; name: string } | null = null;
  for (const base of baseGames) {
    const prefix = base.name.toLowerCase();
    const rest = lower.slice(prefix.length);
    if (lower.startsWith(prefix) && /^\s*[:–—-]/.test(rest) && (!best || base.name.length > best.name.length)) best = base;
  }
  return best?.bggId ?? null;
}

// Reads a BGG collection export ("Export" > "Download CSV" on the collection page).
// Keeps owned items only. The export has no images, so thumbnails stay empty.
export function parseCollectionCsv(text: string, now = new Date().toISOString()): BggGame[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header?.includes("objectid") || !header.includes("objectname")) {
    throw new Error("This isn't a BoardGameGeek collection export. Export it from your collection page and try again.");
  }
  const col = (row: string[], name: string) => row[header.indexOf(name)];

  const games: BggGame[] = rows
    .filter((row) => col(row, "own") === "1" && col(row, "objecttype") !== "item")
    .map((row) => {
      const minPlayers = positive(col(row, "minplayers")) ?? 1;
      const minTime = positive(col(row, "minplaytime")) ?? positive(col(row, "playingtime"));
      const weight = positive(col(row, "avgweight"));
      const bestWith = (col(row, "bggbestplayers") ?? "")
        .split(",")
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => Number.isFinite(n));
      return {
        bggId: Number(col(row, "objectid")),
        name: col(row, "objectname"),
        year: positive(col(row, "yearpublished")),
        minPlayers,
        maxPlayers: Math.max(positive(col(row, "maxplayers")) ?? minPlayers, minPlayers),
        bestWith: JSON.stringify(bestWith),
        minTime,
        maxTime: positive(col(row, "maxplaytime")) ?? minTime,
        weight: weight ? Math.round(weight * 100) / 100 : null,
        thumbnail: null,
        kind: col(row, "itemtype") === "expansion" ? ("expansion" as const) : ("base" as const),
        baseId: null,
        fetchedAt: now,
      };
    });

  const bases = games.filter((g) => g.kind === "base");
  for (const game of games) if (game.kind === "expansion") game.baseId = matchBaseGame(game.name, bases);
  return games;
}
