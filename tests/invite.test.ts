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
  for (let i = 0; i < count; i++) {
    db.insert(members)
      .values({ id: randomUUID(), name: `Player ${i}`, role: "guest", color: "red", linkToken: randomUUID(), createdAt: "" })
      .run();
  }
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

  it("stops new players once the group reaches the limit", async () => {
    // Without a limit, anyone the link is forwarded to could join and vote.
    const { token, limit } = getInvite(db);
    addMembers(limit - 1);

    expect((await join(token, { name: "Last place" })).status).toBe(201);
    const res = await join(token, { name: "One too many" });

    expect(res.status).toBe(403);
    expect(db.select().from(members).all()).toHaveLength(limit);
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
