import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, runMigrations } from "../src/server/db/client";
import { events, games, members, nominations, rsvps, sessions, shelf, votes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";

// A top pick is the one game a member most wants to play on a night. The planner seats top
// picks before anything else, so the rules here decide who gets their game: one per member
// per night, always backed by a vote, and gone when the vote goes.
runMigrations();
const app = createApp(db);

type Person = { id: string; cookie: string };
let host: Person;
let night: string;

function addMember(name: string, role: "host" | "guest" = "guest"): Person {
  const id = randomUUID();
  db.insert(members).values({ id, name, role, color: "red", linkToken: randomUUID(), createdAt: new Date().toISOString() }).run();
  return { id, cookie: `session_id=${createSession(db, id).id}` };
}

function call(who: Person, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: who.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function planNight() {
  const res = await call(host, "POST", "/api/events", { startsAt: "2999-01-01T18:30" });
  return ((await res.json()) as { id: string }).id;
}

const answer = (who: Person, eventId = night, status = "yes") => call(who, "PUT", `/api/events/${eventId}/rsvp`, { status });
const topPick = (who: Person, bggId: number | null, eventId = night) => call(who, "PUT", `/api/events/${eventId}/top-pick`, { bggId });
const vote = (who: Person, bggId: number, approve: boolean) => call(who, "PUT", `/api/events/${night}/votes/${bggId}`, { approve });

async function suggestion(bggId: number, eventId = night) {
  const res = await call(host, "GET", `/api/events/${eventId}`);
  const detail = (await res.json()) as { nominations: { game: { bggId: number }; voters: string[]; topPickers: string[] }[] };
  return detail.nominations.find((n) => n.game.bggId === bggId)!;
}

function shelfGame(bggId: number) {
  db.insert(games).values({ bggId, name: `Game ${bggId}`, minPlayers: 2, maxPlayers: 4, fetchedAt: "" }).run();
  db.insert(shelf).values({ bggId, addedAt: "" }).run();
}

async function suggest(bggId: number, eventId = night) {
  const res = await call(host, "POST", `/api/events/${eventId}/nominations`, { bggId, bringing: false });
  expect(res.status).toBe(201);
}

beforeEach(async () => {
  for (const table of [votes, nominations, rsvps, sessions, events, shelf, games, members]) db.delete(table).run();
  host = addMember("Host", "host");
  night = await planNight();
  await answer(host);
  shelfGame(1);
  shelfGame(2);
  await suggest(1);
  await suggest(2);
});

describe("A member can make a suggestion their top pick", () => {
  it("A member picks a suggestion", async () => {
    const ana = addMember("Ana");
    await answer(ana);

    expect((await topPick(ana, 1)).status).toBe(200);

    expect((await suggestion(1)).topPickers).toEqual([ana.id]);
  });

  it("A member who hasn't answered", async () => {
    const ana = addMember("Ana");

    const res = await topPick(ana, 1);

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ANSWER_FIRST");
    expect(db.select().from(votes).all().filter((v) => v.memberId === ana.id)).toEqual([]);
  });

  it("A game that isn't suggested", async () => {
    const ana = addMember("Ana");
    await answer(ana);
    shelfGame(3);

    expect((await topPick(ana, 3)).status).toBe(400);
    expect(db.select().from(votes).all().filter((v) => v.memberId === ana.id)).toEqual([]);
  });
});

describe("A top pick is also a vote", () => {
  it("Top pick without an earlier vote", async () => {
    const ana = addMember("Ana");
    await answer(ana);

    await topPick(ana, 1);

    const game = await suggestion(1);
    expect(game.voters).toContain(ana.id);
    expect(game.topPickers).toEqual([ana.id]);
  });
});

describe("One top pick per member per night", () => {
  it("Picking another game moves the top pick", async () => {
    const ana = addMember("Ana");
    await answer(ana);
    await topPick(ana, 1);

    await topPick(ana, 2);

    expect((await suggestion(2)).topPickers).toEqual([ana.id]);
    expect((await suggestion(1)).topPickers).toEqual([]);
    expect((await suggestion(1)).voters).toContain(ana.id);
  });

  it("Top picks on different nights", async () => {
    const ana = addMember("Ana");
    await answer(ana);
    const other = await planNight();
    await answer(host, other);
    await answer(ana, other);
    await suggest(2, other);

    await topPick(ana, 1);
    await topPick(ana, 2, other);

    expect((await suggestion(1)).topPickers).toEqual([ana.id]);
    expect((await suggestion(2, other)).topPickers).toEqual([ana.id]);
  });
});

describe("Withdrawing the vote clears the top pick", () => {
  it("The member withdraws the vote", async () => {
    const ana = addMember("Ana");
    await answer(ana);
    await topPick(ana, 1);

    await vote(ana, 1, false);

    expect((await suggestion(1)).topPickers).toEqual([]);
    expect((await suggestion(2)).topPickers).toEqual([]);
    // Voting again is a plain vote. The top pick doesn't come back with it.
    await vote(ana, 1, true);
    expect((await suggestion(1)).topPickers).toEqual([]);
  });

  it("The game is taken off the vote", async () => {
    const ana = addMember("Ana");
    const ben = addMember("Ben");
    await answer(ana);
    await answer(ben);
    await topPick(ana, 1);
    await topPick(ben, 1);

    await call(host, "DELETE", `/api/events/${night}/nominations/1`);

    expect(db.select().from(votes).all().filter((v) => v.topPick)).toEqual([]);
  });
});

describe("Clearing a top pick keeps the vote", () => {
  it("The member clears the top pick", async () => {
    const ana = addMember("Ana");
    await answer(ana);
    await topPick(ana, 1);

    expect((await topPick(ana, null)).status).toBe(200);

    const game = await suggestion(1);
    expect(game.topPickers).toEqual([]);
    expect(game.voters).toContain(ana.id);
  });
});

describe("Top picks count only from the night's players", () => {
  it("A top pick from someone who is not a night's player", async () => {
    // Older data can hold votes from people who never answered the night.
    const ghost = addMember("Ghost");
    db.insert(votes).values({ eventId: night, bggId: 1, memberId: ghost.id, topPick: true }).run();

    expect((await suggestion(1)).topPickers).toEqual([]);
  });
});

describe("the plan uses top picks", () => {
  it("seats a player at their top pick when votes alone would seat them elsewhere", async () => {
    // Two tables of two. Ana and the host voted for both games, so votes alone could seat
    // Ana at either. Her top pick puts her at game 1.
    db.update(games).set({ maxPlayers: 2 }).run();
    const ana = addMember("Ana");
    const ben = addMember("Ben");
    const cy = addMember("Cy");
    for (const who of [ana, ben, cy]) await answer(who);
    // The host suggested both games, which votes for both. Ana votes for both too.
    await vote(ana, 1, true);
    await vote(ana, 2, true);
    await vote(ben, 1, true);
    await vote(cy, 2, true);

    const seatOf = async () => {
      const detail = (await (await call(host, "GET", `/api/events/${night}`)).json()) as {
        plan: { twoTables: { tables: { bggId: number; players: string[]; topPicks: number }[] }[] };
      };
      return detail.plan.twoTables[0].tables.find((t) => t.players.includes(ana.id))!;
    };
    await topPick(ana, 1);

    const table = await seatOf();
    expect(table.bggId).toBe(1);
    expect(table.topPicks).toBe(1);
  });
});
