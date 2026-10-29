import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, runMigrations } from "../src/server/db/client";
import { catalogue, games, members, sessions, settings, shelf } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";
import { parseRanksCsv, searchKey } from "../src/server/bgg/ranks-csv";

runMigrations();
const app = createApp(db);
const cookies: Record<string, string> = {};

// Real rows from BGG's ranks file of 2026-10-29, in its own order (by rank).
const HEADER =
  "id,name,yearpublished,rank,bayesaverage,average,usersrated,is_expansion,abstracts_rank,cgs_rank,childrensgames_rank,familygames_rank,partygames_rank,strategygames_rank,thematic_rank,wargames_rank";
const RANKS = `${HEADER}
224517,"Brass: Birmingham",2018,1,8.39051,8.55828,60779,0,,,,,,1,,
397598,"Dune: Imperium – Uprising",2023,5,8.27155,8.69987,20863,0,,,,,,4,,
316554,"Dune: Imperium",2020,6,8.21799,8.40546,60299,0,,,,,,7,,
366013,"Heat: Pedal to the Metal",2022,49,7.79472,7.98979,43895,0,,,,6,,,,
13,Catan,1995,625,6.90117,7.09012,145099,0,,,,210,,597,,
41,"Can't Stop",1980,768,6.79552,6.95282,22346,0,,,,216,,,,
105593,"Cheating Moth",2011,2745,6.08983,6.38958,6829,0,,,,,235,,,
157815,Heat,2015,11930,5.56559,6.26917,289,0,,,,,,,,
290448,"Wingspan: European Expansion",2019,0,7.92224,8.32227,18147,1,,,,,,,,
107,"Peaceful Resistance",1995,0,0,5.80526,19,0,,,,,,,,
946,Rolazone,1999,0,0,0,0,0,,,,,,,,
`;

function call(who: "host" | "guest", method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookies[who] },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function search(q: string) {
  const res = await call("guest", "GET", `/api/games/search?q=${encodeURIComponent(q)}`);
  return (await res.json()) as { results: { bggId: number; name: string; source: string }[]; catalogue: boolean };
}

beforeEach(() => {
  for (const table of [sessions, shelf, games, catalogue, settings, members]) db.delete(table).run();
  for (const role of ["host", "guest"] as const) {
    const id = randomUUID();
    db.insert(members).values({ id, name: role, role, color: "red", linkToken: randomUUID(), createdAt: "" }).run();
    cookies[role] = `session_id=${createSession(db, id).id}`;
  }
});

describe("reading BGG's ranks file", () => {
  it("keeps rated games, marks expansions, and drops ranks BGG gives as 0", () => {
    const list = parseRanksCsv(RANKS);
    // Rolazone has no ratings. Tens of thousands of rows like it would only clutter search.
    expect(list.map((g) => g.bggId)).not.toContain(946);
    expect(list).toHaveLength(10);
    expect(list.find((g) => g.bggId === 290448)).toMatchObject({ kind: "expansion", rank: null });
    // Unranked but rated: still findable, just after the ranked games.
    expect(list.find((g) => g.bggId === 107)).toMatchObject({ kind: "base", rank: null, usersRated: 19 });
    expect(list.find((g) => g.bggId === 224517)).toMatchObject({ name: "Brass: Birmingham", year: 2018, rank: 1 });
  });

  it("refuses other files, such as a collection export, with a message that says where to get the right one", () => {
    expect(() => parseRanksCsv("objectname,objectid,own\nCatan,13,1\n")).toThrow(/data_dumps\/bg_ranks/);
  });

  it("turns names into search keys without punctuation or accents, so people can type names loosely", () => {
    expect(searchKey("Dune: Imperium – Uprising")).toBe(" dune imperium uprising");
    expect(searchKey("Can't Stop")).toBe(" cant stop");
    expect(searchKey("Café International")).toBe(" cafe international");
  });
});

describe("the BGG game list", () => {
  it("lets only the host load it", async () => {
    expect((await call("guest", "POST", "/api/games/catalogue", { csv: RANKS })).status).toBe(403);
    const res = await call("host", "POST", "/api/games/catalogue", { csv: RANKS });
    expect(res.status).toBe(200);
    expect((await res.json()).games).toBe(10);
    const status = await (await call("guest", "GET", "/api/games/status")).json();
    expect(status.catalogue.games).toBe(10);
    expect(status.catalogue.importedAt).not.toBeNull();
  });

  it("replaces the old list on a new upload, so games BGG dropped don't linger", async () => {
    await call("host", "POST", "/api/games/catalogue", { csv: RANKS });
    await call("host", "POST", "/api/games/catalogue", { csv: `${HEADER}\n13,Catan,1995,625,6.9,7.09,145099,0,,,,,,,,\n` });
    expect((await search("brass")).results).toEqual([]);
    expect((await search("catan")).results.map((r) => r.name)).toEqual(["Catan"]);
  });

  it("matches the start of words, so 'heat' finds Heat but not Cheating Moth", async () => {
    await call("host", "POST", "/api/games/catalogue", { csv: RANKS });
    const names = (await search("heat")).results.map((r) => r.name);
    expect(names).toEqual(["Heat: Pedal to the Metal", "Heat"]);
  });

  it("puts better-ranked games first, so the game people mean is at the top", async () => {
    await call("host", "POST", "/api/games/catalogue", { csv: RANKS });
    expect((await search("dune imperium")).results.map((r) => r.bggId)).toEqual([397598, 316554]);
    expect((await search("cant stop")).results.map((r) => r.name)).toEqual(["Can't Stop"]);
  });

  it("lists a game the app already knows once, as known, so its shelf state shows", async () => {
    await call("host", "POST", "/api/games/catalogue", { csv: RANKS });
    db.insert(games)
      .values({ bggId: 13, name: "Catan", minPlayers: 3, maxPlayers: 4, fetchedAt: "" })
      .run();
    const { results, catalogue: loaded } = await search("catan");
    expect(loaded).toBe(true);
    expect(results.map((r) => [r.bggId, r.source])).toEqual([[13, "known"]]);
  });

  it("marks a known game as known even when only the word search finds it", async () => {
    await call("host", "POST", "/api/games/catalogue", { csv: RANKS });
    db.insert(games)
      .values({ bggId: 366013, name: "Heat: Pedal to the Metal", minPlayers: 1, maxPlayers: 6, fetchedAt: "" })
      .run();
    // "heat pedal" isn't in "Heat: Pedal to the Metal" as typed, because of the colon.
    expect((await search("heat pedal")).results.map((r) => [r.bggId, r.source])).toEqual([[366013, "known"]]);
  });
});
