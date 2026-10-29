import type { catalogue } from "../db/schema";
import { parseCsv } from "./collection-csv";

export type CatalogueGame = typeof catalogue.$inferInsert;

// Lower case, accents and punctuation removed, words split by single spaces, with a leading space.
// "Dune: Imperium – Uprising" becomes " dune imperium uprising", and "Can't Stop" becomes " cant stop".
export function searchKey(name: string) {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return " " + words;
}

function positiveInt(value: string | undefined) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Reads BGG's ranks data dump (boardgamegeek.com/data_dumps/bg_ranks, unzipped).
// Skips games nobody has rated: about 40,000 rows, mostly games that never came out.
export function parseRanksCsv(text: string): CatalogueGame[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  for (const column of ["id", "name", "rank", "usersrated", "is_expansion"]) {
    if (!header?.includes(column)) {
      throw new Error("This isn't BoardGameGeek's ranks file. Download it from boardgamegeek.com/data_dumps/bg_ranks, unzip it and try again.");
    }
  }
  const col = (row: string[], name: string) => row[header.indexOf(name)];

  const games: CatalogueGame[] = [];
  for (const row of rows) {
    const bggId = positiveInt(col(row, "id"));
    const usersRated = positiveInt(col(row, "usersrated"));
    const name = col(row, "name")?.trim();
    if (!bggId || !usersRated || !name) continue;
    games.push({
      bggId,
      name,
      search: searchKey(name),
      year: positiveInt(col(row, "yearpublished")),
      rank: positiveInt(col(row, "rank")),
      usersRated,
      kind: col(row, "is_expansion") === "1" ? "expansion" : "base",
    });
  }
  return games;
}
