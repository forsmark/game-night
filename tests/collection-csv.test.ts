import { describe, expect, it } from "vitest";
import { matchBaseGame, parseCollectionCsv, parseCsv } from "../src/server/bgg/collection-csv";

// Real rows from a BGG export, trimmed to the columns the importer reads.
const CSV = `objectname,objectid,own,objecttype,minplayers,maxplayers,playingtime,maxplaytime,minplaytime,yearpublished,bggbestplayers,avgweight,itemtype
"Cascadia","295947","1","thing","1","4","45","45","30","2021","2,3","1.8441","standalone"
"Cascadia: Landmarks","385318","1","thing","1","6","45","45","30","2023","2","2.2289","expansion"
"Small World","40692","1","thing","2","5","80","80","40","2009","4","2.3453","standalone"
"Small World Underground","97786","1","thing","2","5","90","90","30","2011","4","2.587","standalone"
"Side Effects: Booster Shot","401235","1","thing","2","8","30","30","10","2023","","0","expansion"
"Wingspan","266192","0","thing","1","5","70","70","40","2019","3","2.48","standalone"
`;

describe("parseCollectionCsv", () => {
  it("keeps owned games only", () => {
    const games = parseCollectionCsv(CSV, "now");
    expect(games.map((g) => g.name)).not.toContain("Wingspan");
    expect(games).toHaveLength(5);
  });

  it("links an expansion to its base game so it never shows up as its own game", () => {
    const games = parseCollectionCsv(CSV, "now");
    const landmarks = games.find((g) => g.bggId === 385318)!;
    expect(landmarks).toMatchObject({ kind: "expansion", baseId: 295947, maxPlayers: 6 });
  });

  it("leaves an expansion unlinked when its base game is not in the collection", () => {
    const booster = parseCollectionCsv(CSV, "now").find((g) => g.bggId === 401235)!;
    expect(booster).toMatchObject({ kind: "expansion", baseId: null, weight: null, bestWith: "[]" });
  });

  it("reads a standalone game that shares a name prefix as a base game", () => {
    const underground = parseCollectionCsv(CSV, "now").find((g) => g.bggId === 97786)!;
    expect(underground).toMatchObject({ kind: "base", baseId: null });
  });

  it("reads the numbers the planner and the cards use", () => {
    const cascadia = parseCollectionCsv(CSV, "now").find((g) => g.bggId === 295947)!;
    expect(cascadia).toMatchObject({ minPlayers: 1, maxPlayers: 4, minTime: 30, maxTime: 45, weight: 1.84, year: 2021, bestWith: "[2,3]" });
  });

  it("rejects a file that is not a BGG export", () => {
    expect(() => parseCollectionCsv("name,players\nCatan,4\n")).toThrow(/collection export/);
  });
});

describe("matchBaseGame", () => {
  const bases = [
    { bggId: 1, name: "Small World" },
    { bggId: 2, name: "Small World Underground" },
    { bggId: 3, name: "Terraforming Mars" },
  ];

  it("picks the longest matching base game name", () => {
    expect(matchBaseGame("Small World Underground: Realms", bases)).toBe(2);
    expect(matchBaseGame("Small World: Grand Dames", bases)).toBe(1);
  });

  it("needs the name to continue with a colon or dash, not just any text", () => {
    expect(matchBaseGame("Terraforming Mars Ares Expedition", bases)).toBeNull();
    expect(matchBaseGame("Terraforming Mars – Turmoil", bases)).toBe(3);
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and commas inside fields", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});
