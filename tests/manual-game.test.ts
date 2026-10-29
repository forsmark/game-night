import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, runMigrations } from "../src/server/db/client";
import { events, games, members, nominations, rsvps, sessions, shelf, votes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";
import { bggIdFromLink } from "../src/server/routes/games";

// These run without a BGG_TOKEN, like a fresh deploy.
runMigrations();
const app = createApp(db);
const cookies: Record<string, string> = {};
let eventId = "";

function call(who: "host" | "guest", method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookies[who] },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const kingdomino = { name: "Kingdomino", minPlayers: 2, maxPlayers: 4, minTime: 15, maxTime: 20, weight: 1.2 };

beforeEach(() => {
  for (const table of [votes, nominations, rsvps, sessions, events, shelf, games, members]) db.delete(table).run();
  for (const role of ["host", "guest"] as const) {
    const id = randomUUID();
    db.insert(members).values({ id, name: role, role, color: "red", linkToken: randomUUID(), createdAt: "" }).run();
    cookies[role] = `session_id=${createSession(db, id).id}`;
  }
  eventId = randomUUID();
  db.insert(events).values({ id: eventId, startsAt: "2999-01-01T18:30", createdAt: "" }).run();
});

describe("games typed in by hand", () => {
  it("lets a guest bring a game BGG was never asked about, and the planner seats it", async () => {
    const created = await call("guest", "POST", "/api/games/manual", kingdomino);
    const { bggId } = await created.json();
    expect(created.status).toBe(201);
    expect(bggId).toBeLessThan(0);

    for (const who of ["host", "guest"] as const) await call(who, "PUT", `/api/events/${eventId}/rsvp`, { status: "yes" });
    expect((await call("guest", "POST", `/api/events/${eventId}/nominations`, { bggId, bringing: true })).status).toBe(201);
    const detail = (await (await call("host", "GET", `/api/events/${eventId}`)).json()) as any;
    expect(detail.plan.oneTable[0].tables[0]).toMatchObject({ bggId, happy: 1 });
  });

  it("reuses a game with the same name instead of making a copy", async () => {
    const first = await (await call("guest", "POST", "/api/games/manual", kingdomino)).json();
    const again = await (await call("host", "POST", "/api/games/manual", { ...kingdomino, name: "kingdomino" })).json();
    expect(again).toEqual({ bggId: first.bggId, created: false });
  });

  it("keeps the real BGG id from a link, so the box image can be fetched later", async () => {
    const res = await call("host", "POST", "/api/games/manual", { ...kingdomino, bggLink: "https://boardgamegeek.com/boardgame/204583/kingdomino" });
    expect((await res.json()).bggId).toBe(204583);
  });

  it("gives each hand-typed game its own id", async () => {
    const a = await (await call("host", "POST", "/api/games/manual", kingdomino)).json();
    const b = await (await call("host", "POST", "/api/games/manual", { ...kingdomino, name: "Hanabi" })).json();
    expect(b.bggId).toBe(a.bggId - 1);
  });

  it("only lets the host add expansions", async () => {
    const base = await (await call("host", "POST", "/api/games/manual", kingdomino)).json();
    const expansion = { ...kingdomino, name: "Kingdomino: Age of Giants", maxPlayers: 5, baseId: base.bggId };
    expect((await call("guest", "POST", "/api/games/manual", expansion)).status).toBe(403);
    expect((await call("host", "POST", "/api/games/manual", expansion)).status).toBe(201);
  });

  it("rejects a player range that runs backwards", async () => {
    const res = await call("guest", "POST", "/api/games/manual", { ...kingdomino, minPlayers: 5, maxPlayers: 2 });
    expect(res.status).toBe(400);
  });

  it("reports that the BGG token is missing, so the host sees why username import is off", async () => {
    expect(await (await call("guest", "GET", "/api/games/status")).json()).toEqual({
      bgg: false,
      catalogue: { games: 0, importedAt: null },
    });
  });
});

describe("bggIdFromLink", () => {
  it.each([
    ["https://boardgamegeek.com/boardgame/13/catan", 13],
    ["https://boardgamegeek.com/boardgameexpansion/385318/cascadia-landmarks", 385318],
    ["295947", 295947],
    ["https://example.com/13", null],
  ])("%s", (link, id) => expect(bggIdFromLink(link)).toBe(id));
});

describe("game search without BGG", () => {
  it("finds games the app already knows, so search works before the token arrives", async () => {
    await call("guest", "POST", "/api/games/manual", kingdomino);
    const res = await call("guest", "GET", "/api/games/search?q=kingdo");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bgg).toBe("off");
    expect(body.results).toEqual([expect.objectContaining({ name: "Kingdomino", kind: "base", source: "known" })]);
  });

  it("treats % and _ in the query as plain text, not wildcards", async () => {
    await call("guest", "POST", "/api/games/manual", kingdomino);
    const body = await (await call("guest", "GET", "/api/games/search?q=%25%25")).json();
    expect(body.results).toEqual([]);
  });
});
