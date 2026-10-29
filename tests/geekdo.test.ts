import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db, runMigrations } from "../src/server/db/client";
import { events, games, members, nominations, rsvps, sessions, shelf, votes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";
import { parseBestRanges, parseGeekdo } from "../src/server/bgg/geekdo";

runMigrations();
const app = createApp(db);
let cookie = "";
let eventId = "";

// Trimmed copies of real api.geekdo.com responses from 2026-10-29.
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/geekdo/${name}.json`, "utf8"));
const brass = { item: fixture("brass-item"), dynamic: fixture("brass-dynamic") };
const wingspanEurope = { item: fixture("wingspan-europe-item"), dynamic: fixture("wingspan-europe-dynamic") };

// Answers geekdo requests from the fixtures, by object id. Anything else is a 404, like geekdo.
function serveGeekdo(byId: Record<number, { item: unknown; dynamic: unknown }>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const found = byId[Number(url.searchParams.get("objectid"))];
    const body = url.pathname.endsWith("/geekitems") ? found?.item : found?.dynamic;
    return body ? Response.json(body) : new Response("null", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function suggest(bggId: number) {
  return app.request(`/api/events/${eventId}/nominations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ bggId, bringing: true }),
  });
}

beforeEach(() => {
  // geekdo is only used without a token. Make sure a token in a local .env doesn't switch it off.
  vi.stubEnv("BGG_TOKEN", "");
  for (const table of [votes, nominations, rsvps, sessions, events, shelf, games, members]) db.delete(table).run();
  const id = randomUUID();
  db.insert(members).values({ id, name: "Guest", role: "guest", color: "red", linkToken: randomUUID(), createdAt: "" }).run();
  cookie = `session_id=${createSession(db, id).id}`;
  eventId = randomUUID();
  db.insert(events).values({ id: eventId, startsAt: "2999-01-01T18:30", createdAt: "" }).run();
  db.insert(rsvps).values({ eventId, memberId: id, status: "yes", updatedAt: "" }).run();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("reading geekdo responses", () => {
  it("gets everything the planner and the vote cards need, box image included", () => {
    expect(parseGeekdo(brass.item, brass.dynamic, "now")).toEqual({
      bggId: 224517,
      name: "Brass: Birmingham",
      year: 2018,
      minPlayers: 2,
      maxPlayers: 4,
      bestWith: "[3,4]",
      minTime: 60,
      maxTime: 120,
      weight: 3.86,
      thumbnail: brass.item.item.images.square200,
      kind: "base",
      baseId: null,
      fetchedAt: "now",
    });
  });

  it("links an expansion to the game it was made for, so its player count can count", () => {
    const game = parseGeekdo(wingspanEurope.item, wingspanEurope.dynamic);
    // The fixture lists Wingspan first and Wingspan Asia second.
    expect(game).toMatchObject({ kind: "expansion", baseId: 266192, maxPlayers: 5, bestWith: "[3]" });
  });

  it("still saves the game when the second request, for weight and best player count, failed", () => {
    expect(parseGeekdo(brass.item, null)).toMatchObject({ minPlayers: 2, maxPlayers: 4, weight: null, bestWith: "[]" });
  });

  it("ignores things that aren't board games, such as an RPG book with the same id", () => {
    expect(parseGeekdo({ item: { ...brass.item.item, subtype: "rpgitem" } }, null)).toBeNull();
  });

  it("caps the best-with poll at 20 players, so a joke vote doesn't make a list of hundreds", () => {
    expect(parseBestRanges([{ min: 2, max: 2 }, { min: 18, max: 999 }])).toEqual([2, 18, 19, 20]);
  });
});

describe("suggesting a game without a BGG token", () => {
  it("looks the game up on geekdo and saves it with its box image", async () => {
    const fetchMock = serveGeekdo({ 224517: brass });
    const res = await suggest(224517);
    expect(res.status).toBe(201);
    expect(db.select().from(games).all()).toMatchObject([{ bggId: 224517, maxPlayers: 4, thumbnail: expect.stringContaining("cf.geekdo-images.com") }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks BGG about a game only once, so a popular game doesn't send a request per suggestion", async () => {
    const fetchMock = serveGeekdo({ 224517: brass });
    await suggest(224517);
    await app.request(`/api/events/${eventId}/nominations/224517`, { method: "DELETE", headers: { Cookie: cookie } });
    await suggest(224517);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says BGG has no such game when geekdo returns 404", async () => {
    serveGeekdo({});
    const res = await suggest(999999999);
    expect(res.status).toBe(400);
    expect(db.select().from(nominations).all()).toEqual([]);
  });

  it("answers with code BGG when geekdo is down, so the picker can offer to type the game in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    const res = await suggest(224517);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("BGG");
    expect(db.select().from(games).all()).toEqual([]);
  });
});
