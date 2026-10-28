import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "../src/server/db/client";
import { events, members, rsvps, sessions, settings } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { getInvite } from "../src/server/routes/invite";

runMigrations();
const app = createApp(db);

function join(token: string, body: unknown) {
  return app.request(`/api/join/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function addMembers(count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    db.insert(members)
      .values({ id, name: `Player ${i}`, role: "guest", color: "red", linkToken: randomUUID(), createdAt: "" })
      .run();
    ids.push(id);
  }
  return ids;
}

function answer(eventId: string, memberId: string, status: "yes" | "maybe" | "no") {
  db.insert(rsvps).values({ eventId, memberId, status, updatedAt: "" }).run();
}

beforeEach(() => {
  for (const table of [rsvps, sessions, events, members, settings]) db.delete(table).run();
});

describe("group invite link", () => {
  it("signs a new player in and answers for the next night in one step", async () => {
    const eventId = randomUUID();
    db.insert(events).values({ id: eventId, startsAt: "2999-01-01T18:30", createdAt: "" }).run();

    const res = await join(getInvite(db).token, { name: "Anna", status: "yes" });

    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain("session_id=");
    const rsvp = db.select().from(rsvps).get();
    expect(rsvp).toMatchObject({ eventId, status: "yes" });
  });

  it("refuses a yes once the next night is full, without adding the person to the group", async () => {
    // Without a limit, anyone the link is forwarded to could take a seat at the host's table.
    const eventId = randomUUID();
    db.insert(events).values({ id: eventId, startsAt: "2999-01-01T18:30", createdAt: "" }).run();
    const { token, limit } = getInvite(db);
    for (const id of addMembers(limit - 1)) answer(eventId, id, "yes");

    expect((await join(token, { name: "Last place", status: "maybe" })).status).toBe(201);
    expect((await (await app.request(`/api/join/${token}`)).json()).full).toBe(true);
    const res = await join(token, { name: "One too many", status: "yes" });

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NIGHT_FULL");
    expect(db.select().from(members).all()).toHaveLength(limit);
  });

  it("still lets someone join a full night's group to say they can't come", async () => {
    // A "no" takes no place, and they keep one identity for the nights after.
    const eventId = randomUUID();
    db.insert(events).values({ id: eventId, startsAt: "2999-01-01T18:30", createdAt: "" }).run();
    db.insert(settings).values({ key: "invite_limit", value: "2" }).run();
    for (const id of addMembers(2)) answer(eventId, id, "yes");

    expect((await join(getInvite(db).token, { name: "Bo", status: "no" })).status).toBe(201);
  });

  it("lets people join when no night is planned, however many are in the group", async () => {
    // The limit is per night. With no night there are no places to run out of.
    db.insert(settings).values({ key: "invite_limit", value: "2" }).run();
    addMembers(5);
    const { token } = getInvite(db);

    expect((await (await app.request(`/api/join/${token}`)).json())).toEqual({ full: false, night: null });
    expect((await join(token, { name: "Bo", status: "yes" })).status).toBe(201);
    expect(db.select().from(rsvps).all()).toHaveLength(0);
  });

  it("counts places on the next night only, so the host sees how full that night is", () => {
    // Members from earlier nights and members who said no don't take a place.
    const eventId = randomUUID();
    db.insert(events).values({ id: eventId, startsAt: "2999-01-01T18:30", createdAt: "" }).run();
    const [a, b, c] = addMembers(4);
    answer(eventId, a, "yes");
    answer(eventId, b, "maybe");
    answer(eventId, c, "no");

    expect(getInvite(db).used).toBe(2);
  });

  it("refuses a name that is already taken, so nobody can join as someone else", async () => {
    const { token } = getInvite(db);
    await join(token, { name: "Anna" });

    const res = await join(token, { name: "anna" });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NAME_TAKEN");
  });

  it("stops the old link working after the host makes a new one", async () => {
    const old = getInvite(db).token;
    db.update(settings).set({ value: "fresh-token" }).where(eq(settings.key, "invite_token")).run();

    expect((await join(old, { name: "Anna" })).status).toBe(404);
    expect((await app.request(`/api/join/${old}`)).status).toBe(404);
    expect((await join("fresh-token", { name: "Anna" })).status).toBe(201);
  });
});
