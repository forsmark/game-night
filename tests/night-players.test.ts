import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, runMigrations } from "../src/server/db/client";
import { events, games, members, nominations, rsvps, sessions, settings, shelf, votes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";
import { mayAnswer } from "../src/server/routes/events";

// Players belong to a night: a night lists only the people who answered it. People keep one
// identity across nights, but someone from an old night must not turn up on a new one.
runMigrations();
const app = createApp(db);

type Person = { id: string; cookie: string };
let host: Person;

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

async function planNight(startsAt = "2999-01-01T18:30") {
  const res = await call(host, "POST", "/api/events", { startsAt });
  return ((await res.json()) as { id: string }).id;
}

const rsvp = (who: Person, eventId: string, status: string) => call(who, "PUT", `/api/events/${eventId}/rsvp`, { status });
const detail = async (eventId: string) => (await (await call(host, "GET", `/api/events/${eventId}`)).json()) as any;
const setLimit = (limit: number) => db.insert(settings).values({ key: "invite_limit", value: String(limit) }).run();

function shelfGame(bggId: number) {
  db.insert(games).values({ bggId, name: `Game ${bggId}`, minPlayers: 2, maxPlayers: 4, fetchedAt: "" }).run();
  db.insert(shelf).values({ bggId, addedAt: "" }).run();
}

beforeEach(() => {
  for (const table of [votes, nominations, rsvps, sessions, events, shelf, games, members, settings]) db.delete(table).run();
  host = addMember("Host", "host");
});

describe("a night's players", () => {
  it("leaves out a player whose night was deleted, so a test player doesn't haunt the next night", async () => {
    const tester = addMember("Test player");
    const first = await planNight();
    expect((await rsvp(tester, first, "yes")).status).toBe(200);
    await call(host, "DELETE", `/api/events/${first}`);

    const second = await planNight();
    const night = await detail(second);

    expect(night.members.map((m: { id: string }) => m.id)).toEqual([host.id]);
    // They are still in the group, so the host can find and remove them.
    const group = (await (await call(host, "GET", "/api/members")).json()) as { id: string }[];
    expect(group.map((m) => m.id)).toContain(tester.id);
    // And still signed in: their session works, they're just on no night.
    expect((await call(tester, "GET", "/api/auth/me")).status).toBe(200);
  });

  it("lists only members who answered, including those who said no", async () => {
    const yes = addMember("Anna");
    const no = addMember("Bo");
    addMember("Silent");
    const eventId = await planNight();
    await rsvp(yes, eventId, "yes");
    await rsvp(no, eventId, "no");

    const names = (await detail(eventId)).members.map((m: { name: string }) => m.name).sort();

    expect(names).toEqual(["Anna", "Bo", "Host"]);
  });

  it("only lets people who answered suggest or vote, so every vote comes from someone on the night", async () => {
    shelfGame(13);
    const anna = addMember("Anna");
    const eventId = await planNight();

    expect((await call(anna, "POST", `/api/events/${eventId}/nominations`, { bggId: 13, bringing: false })).status).toBe(403);
    await call(host, "POST", `/api/events/${eventId}/nominations`, { bggId: 13, bringing: false });
    expect((await call(anna, "PUT", `/api/events/${eventId}/votes/13`, { approve: true })).status).toBe(403);

    // Answering no is enough: they're on the night, under "Not coming".
    await rsvp(anna, eventId, "no");
    expect((await call(anna, "PUT", `/api/events/${eventId}/votes/13`, { approve: true })).status).toBe(200);
  });

  it("ignores stored votes from people who never answered the night", async () => {
    // Votes from before this rule could name someone who isn't on the night, and the page
    // would count a voter it can't show.
    shelfGame(13);
    const stranger = addMember("Stranger");
    const eventId = await planNight();
    await call(host, "POST", `/api/events/${eventId}/nominations`, { bggId: 13, bringing: false });
    db.insert(votes).values({ eventId, bggId: 13, memberId: stranger.id }).run();

    expect((await detail(eventId)).nominations[0].voters).toEqual([host.id]);
  });
});

describe("the per-night limit", () => {
  it("refuses a yes or maybe from a member when the night is full", async () => {
    setLimit(2);
    const anna = addMember("Anna");
    const bo = addMember("Bo");
    const eventId = await planNight(); // the host takes the first place
    await rsvp(anna, eventId, "yes");

    for (const status of ["yes", "maybe"]) {
      const res = await rsvp(bo, eventId, status);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("NIGHT_FULL");
    }
    // Saying no takes no place, so it always works.
    expect((await rsvp(bo, eventId, "no")).status).toBe(200);
  });

  it("lets someone with a place switch between yes and maybe on a full night, and frees it on no", async () => {
    setLimit(2);
    const anna = addMember("Anna");
    const bo = addMember("Bo");
    const eventId = await planNight();
    await rsvp(anna, eventId, "yes");

    expect((await rsvp(anna, eventId, "maybe")).status).toBe(200);
    expect((await rsvp(anna, eventId, "yes")).status).toBe(200);
    expect((await rsvp(anna, eventId, "no")).status).toBe(200);
    // Anna's place is free now, and someone else can take it.
    expect((await rsvp(bo, eventId, "yes")).status).toBe(200);
    expect((await rsvp(anna, eventId, "yes")).status).toBe(403);
  });

  it("is per night: a full night doesn't stop anyone on another night", async () => {
    setLimit(2);
    const anna = addMember("Anna");
    const bo = addMember("Bo");
    const full = await planNight("2999-01-01T18:30");
    const later = await planNight("2999-02-01T18:30");
    await rsvp(anna, full, "yes");

    expect((await rsvp(bo, full, "yes")).status).toBe(403);
    expect((await rsvp(bo, later, "yes")).status).toBe(200);
  });

  it("never turns the host away from their own night", async () => {
    // The host decides the night happens. They still count, so guests see the true number of places.
    setLimit(2);
    const anna = addMember("Anna");
    const bo = addMember("Bo");
    const eventId = await planNight();
    await rsvp(host, eventId, "no");
    await rsvp(anna, eventId, "yes");
    await rsvp(bo, eventId, "yes");

    expect((await rsvp(host, eventId, "yes")).status).toBe(200);
    expect(db.select().from(rsvps).all().filter((r) => r.status === "yes")).toHaveLength(3);
  });
});

describe("mayAnswer", () => {
  const full = { taken: 5, limit: 5 };
  it("refuses a new place on a full night, and nothing else", () => {
    expect(mayAnswer({ role: "guest", current: undefined, next: "yes", ...full })).toBe(false);
    expect(mayAnswer({ role: "guest", current: "no", next: "maybe", ...full })).toBe(false);
    expect(mayAnswer({ role: "guest", current: "maybe", next: "yes", ...full })).toBe(true);
    expect(mayAnswer({ role: "guest", current: undefined, next: "no", ...full })).toBe(true);
    expect(mayAnswer({ role: "host", current: "no", next: "yes", ...full })).toBe(true);
    expect(mayAnswer({ role: "guest", current: undefined, next: "yes", taken: 4, limit: 5 })).toBe(true);
  });
});
