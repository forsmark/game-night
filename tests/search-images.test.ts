import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, runMigrations } from "../src/server/db/client";
import { gameImages, games, members, sessions } from "../src/server/db/schema";
import { createApp } from "../src/server/app";
import { createSession } from "../src/server/auth/sessions";

runMigrations();
const app = createApp(db);
let cookie = "";

// A /thing answer for two games, shaped like BGG's. Heat has an image, the other game has none.
const THINGS = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="366013">
    <thumbnail>https://cf.geekdo-images.com/heat__small/img/sig=/fit-in/200x150/pic6940449.png</thumbnail>
    <name type="primary" sortindex="1" value="Heat: Pedal to the Metal" />
    <minplayers value="1" /><maxplayers value="6" />
  </item>
  <item type="boardgame" id="107">
    <name type="primary" sortindex="1" value="Peaceful Resistance" />
    <minplayers value="2" /><maxplayers value="2" />
  </item>
</items>`;

function serveThings() {
  const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(THINGS, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function images(ids: string) {
  const res = await app.request(`/api/games/images?ids=${ids}`, { headers: { Cookie: cookie } });
  return (await res.json()).images as Record<string, string | null>;
}

beforeEach(() => {
  vi.stubEnv("BGG_TOKEN", "test-token");
  for (const table of [sessions, gameImages, games, members]) db.delete(table).run();
  const id = randomUUID();
  db.insert(members).values({ id, name: "Guest", role: "guest", color: "red", linkToken: randomUUID(), createdAt: "" }).run();
  cookie = `session_id=${createSession(db, id).id}`;
});

afterEach(() => vi.unstubAllEnvs());

describe("box images for search results", () => {
  it("fetches the missing ones in one BGG request, so a search costs one extra request at most", async () => {
    const fetchMock = serveThings();
    expect(await images("366013,107")).toEqual({
      366013: "https://cf.geekdo-images.com/heat__small/img/sig=/fit-in/200x150/pic6940449.png",
      107: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Without stats the answer is smaller. Weight isn't needed for an image.
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("stats=1");
  });

  it("asks BGG about each game once, a game without an image included", async () => {
    const fetchMock = serveThings();
    await images("366013,107");
    await images("107,366013");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the image of a game the app already has, without asking BGG", async () => {
    const fetchMock = serveThings();
    db.insert(games).values({ bggId: 13, name: "Catan", minPlayers: 3, maxPlayers: 4, thumbnail: "https://cf.geekdo-images.com/catan.jpg", fetchedAt: "" }).run();
    expect(await images("13")).toEqual({ 13: "https://cf.geekdo-images.com/catan.jpg" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only serves cached images without a token, since geekdo would need a request per game", async () => {
    vi.stubEnv("BGG_TOKEN", "");
    const fetchMock = serveThings();
    expect(await images("366013")).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for at most 20 games and never for hand-typed ones", async () => {
    const fetchMock = serveThings();
    const ids = [-1, ...Array.from({ length: 30 }, (_, i) => i + 1)].join(",");
    await images(ids);
    const asked = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("id")!.split(",");
    expect(asked).toHaveLength(20);
    expect(asked).not.toContain("-1");
  });

  it("answers with the cached images when BGG is down, because images are only decoration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    db.insert(gameImages).values({ bggId: 107, url: null, fetchedAt: "" }).run();
    const res = await app.request("/api/games/images?ids=107,366013", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect((await res.json()).images).toEqual({ 107: null });
  });

  it("puts images the app has into the search results, so most show without a second request", async () => {
    vi.stubEnv("BGG_TOKEN", "");
    db.insert(games).values({ bggId: 13, name: "Catan", minPlayers: 3, maxPlayers: 4, thumbnail: "https://cf.geekdo-images.com/catan.jpg", fetchedAt: "" }).run();
    const res = await app.request("/api/games/search?q=catan", { headers: { Cookie: cookie } });
    expect((await res.json()).results).toMatchObject([{ bggId: 13, thumbnail: "https://cf.geekdo-images.com/catan.jpg" }]);
  });
});
