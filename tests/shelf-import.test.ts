import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, runMigrations } from "../src/server/db/client";
import { events, games, members, nominations, rsvps, sessions, shelf, votes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";

runMigrations();
const app = createApp(db);

const CSV = `objectname,objectid,own,objecttype,minplayers,maxplayers,playingtime,maxplaytime,minplaytime,yearpublished,bggbestplayers,avgweight,itemtype
"Cascadia","295947","1","thing","1","4","45","45","30","2021","2,3","1.8441","standalone"
"Cascadia: Landmarks","385318","1","thing","1","6","45","45","30","2023","2","2.2289","expansion"
"Azul","230802","1","thing","2","4","45","45","30","2017","2","1.77","standalone"
`;

let hostCookie = "";
let eventId = "";

function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: hostCookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const table of [votes, nominations, rsvps, sessions, events, shelf, games, members]) db.delete(table).run();
  const hostId = randomUUID();
  db.insert(members).values({ id: hostId, name: "Host", role: "host", color: "red", linkToken: randomUUID(), createdAt: "" }).run();
  hostCookie = `session_id=${createSession(db, hostId).id}`;
  eventId = randomUUID();
  db.insert(events).values({ id: eventId, startsAt: "2999-01-01T18:30", createdAt: "" }).run();
  // Six people coming.
  for (let i = 0; i < 6; i++) {
    const id = i === 0 ? hostId : randomUUID();
    if (i > 0) db.insert(members).values({ id, name: `P${i}`, role: "guest", color: "blue", linkToken: randomUUID(), createdAt: "" }).run();
    db.insert(rsvps).values({ eventId, memberId: id, status: "yes", updatedAt: String(i) }).run();
  }
});

describe("CSV collection import", () => {
  it("replaces the shelf but keeps thumbnails already fetched from BGG", async () => {
    db.insert(games).values({ bggId: 230802, name: "Azul", minPlayers: 2, maxPlayers: 4, thumbnail: "azul.jpg", fetchedAt: "" }).run();
    db.insert(games).values({ bggId: 13, name: "CATAN", minPlayers: 3, maxPlayers: 4, fetchedAt: "" }).run();
    db.insert(shelf).values([{ bggId: 230802, addedAt: "" }, { bggId: 13, addedAt: "" }]).run();

    const res = await call("POST", "/api/shelf/import-csv", { csv: CSV, replace: true });

    expect(await res.json()).toMatchObject({ added: 2, removed: 1, baseGames: 2, expansions: 1, unmatched: [] });
    const onShelf = db.select().from(shelf).all().map((s) => s.bggId).sort();
    expect(onShelf).toEqual([230802, 295947, 385318]);
    expect(db.select().from(games).all().find((g) => g.bggId === 230802)?.thumbnail).toBe("azul.jpg");
  });

  it("lists owned expansions with their base game, with the higher player count", async () => {
    await call("POST", "/api/shelf/import-csv", { csv: CSV, replace: true });
    const list = (await (await call("GET", "/api/shelf")).json()) as any[];
    const cascadia = list.find((g) => g.bggId === 295947);
    expect(cascadia.expansions.map((e: any) => e.name)).toEqual(["Cascadia: Landmarks"]);
    expect(cascadia.maxWithExpansions).toBe(6);
  });

  it("refuses an expansion as a suggestion, so the vote only lists base games", async () => {
    await call("POST", "/api/shelf/import-csv", { csv: CSV, replace: true });
    const res = await call("POST", `/api/events/${eventId}/nominations`, { bggId: 385318, bringing: false });
    expect(res.status).toBe(400);
  });

  it("seats six at a four-player game when the 5-6 player expansion is on the shelf", async () => {
    await call("POST", "/api/shelf/import-csv", { csv: CSV, replace: true });
    await call("POST", `/api/events/${eventId}/nominations`, { bggId: 295947, bringing: false });
    const detail = (await (await call("GET", `/api/events/${eventId}`)).json()) as any;
    expect(detail.plan.recommended).toBe("one");
    expect(detail.plan.oneTable[0].tables[0]).toMatchObject({ bggId: 295947 });
    expect(detail.plan.oneTable[0].tables[0].players).toHaveLength(6);
  });

  it("lets the host link an expansion the import couldn't match", async () => {
    const unmatched = CSV + `"Landmarks Promo Pack","999","1","thing","1","6","45","45","30","2023","","0","expansion"\n`;
    const body = await (await call("POST", "/api/shelf/import-csv", { csv: unmatched, replace: true })).json();
    expect(body.unmatched).toEqual(["Landmarks Promo Pack"]);

    expect((await call("PATCH", "/api/shelf/999", { baseId: 295947 })).status).toBe(200);
    const list = (await (await call("GET", "/api/shelf")).json()) as any[];
    expect(list.find((g) => g.bggId === 295947).expansions).toHaveLength(2);
    // A re-import that still can't match it keeps the host's link.
    await call("POST", "/api/shelf/import-csv", { csv: unmatched, replace: true });
    expect(db.select().from(games).all().find((g) => g.bggId === 999)?.baseId).toBe(295947);
  });
});
