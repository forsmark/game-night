import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "../src/server/db/client";
import { events, games, members, nominations, rsvps, sessions, shelf, votes } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";
import { imageFill, imageFillDone } from "../src/server/bgg/images";

runMigrations();
const app = createApp(db);
let hostCookie = "";

const CSV = `objectname,objectid,own,objecttype,minplayers,maxplayers,playingtime,maxplaytime,minplaytime,yearpublished,bggbestplayers,avgweight,itemtype
"Cascadia","295947","1","thing","1","4","45","45","30","2021","2,3","1.8441","standalone"
"Azul","230802","1","thing","2","4","45","45","30","2017","2","1.77","standalone"
`;

const image = (bggId: number) => `https://cf.geekdo-images.com/test__square200/img/sig=/200x200/pic${bggId}.jpg`;

// A geekitems response shaped like the real ones in tests/fixtures/geekdo, for the given ids.
// Other ids get geekdo's 404.
function serveImages(ids: number[]) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const bggId = Number(new URL(String(input)).searchParams.get("objectid"));
    if (!ids.includes(bggId)) return new Response("null", { status: 404 });
    return Response.json({
      item: { objectid: bggId, subtype: "boardgame", name: `Game ${bggId}`, minplayers: "9", images: { square200: image(bggId) } },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function importCsv(csv = CSV) {
  const res = await app.request("/api/shelf/import-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: hostCookie },
    body: JSON.stringify({ csv, replace: true }),
  });
  return res.json();
}

const thumbnail = (bggId: number) => db.select().from(games).where(eq(games.bggId, bggId)).get()?.thumbnail;

beforeEach(async () => {
  await imageFillDone();
  vi.stubEnv("BGG_TOKEN", "");
  imageFill.delayMs = 0;
  for (const table of [votes, nominations, rsvps, sessions, events, shelf, games, members]) db.delete(table).run();
  const hostId = randomUUID();
  db.insert(members).values({ id: hostId, name: "Host", role: "host", color: "red", linkToken: randomUUID(), createdAt: "" }).run();
  hostCookie = `session_id=${createSession(db, hostId).id}`;
});

afterEach(async () => {
  await imageFillDone();
  vi.unstubAllEnvs();
});

describe("box images after a CSV import", () => {
  it("fills them in after the import answers, so a big collection doesn't keep the host waiting", async () => {
    serveImages([295947, 230802]);
    expect((await importCsv()).imagesPending).toBe(2);
    await imageFillDone();
    expect(thumbnail(295947)).toBe(image(295947));
    expect(thumbnail(230802)).toBe(image(230802));
  });

  it("sets only the image, so the CSV's player counts and weight stay as imported", async () => {
    serveImages([295947, 230802]);
    await importCsv();
    await imageFillDone();
    // The fake response says 9 players. The CSV said 1 to 4.
    expect(db.select().from(games).where(eq(games.bggId, 295947)).get()).toMatchObject({ minPlayers: 1, maxPlayers: 4, weight: 1.84 });
  });

  it("asks about each game once, so a game BGG has no image for doesn't loop forever", async () => {
    const fetchMock = serveImages([230802]);
    await importCsv();
    await imageFillDone();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(thumbnail(295947)).toBeNull();
  });

  it("stops at the first failure, so a BGG outage doesn't get a request a second", async () => {
    const fetchMock = vi.fn(async () => new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await importCsv();
    await imageFillDone();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never asks BGG about games typed in by hand, which have negative ids", async () => {
    const fetchMock = serveImages([]);
    db.insert(games).values({ bggId: -1, name: "Homebrew", minPlayers: 2, maxPlayers: 4, fetchedAt: "" }).run();
    db.insert(shelf).values({ bggId: -1, addedAt: "" }).run();
    await importCsv(CSV.split("\n")[0] + "\n");
    await imageFillDone();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an image a game already has, and doesn't ask for it again", async () => {
    const fetchMock = serveImages([295947, 230802]);
    db.insert(games).values({ bggId: 295947, name: "Cascadia", minPlayers: 1, maxPlayers: 4, thumbnail: "https://cf.geekdo-images.com/kept.jpg", fetchedAt: "" }).run();
    await importCsv();
    await imageFillDone();
    expect(thumbnail(295947)).toBe("https://cf.geekdo-images.com/kept.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
