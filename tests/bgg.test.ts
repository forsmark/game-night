import { describe, expect, it } from "vitest";
import { parseBestWith, parseCollectionIds, parseSearch, parseThings, parseXml as parse } from "../src/server/bgg/client";

const THING = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="13">
    <thumbnail>https://cf.geekdo-images.com/thumb/catan.jpg</thumbnail>
    <image>https://cf.geekdo-images.com/original/catan.jpg</image>
    <name type="alternate" sortindex="1" value="Die Siedler von Catan" />
    <name type="primary" sortindex="1" value="CATAN" />
    <yearpublished value="1995" />
    <minplayers value="3" />
    <maxplayers value="4" />
    <poll-summary name="suggested_numplayers" title="User Suggested Number of Players">
      <result name="bestwith" value="Best with 4 players" />
      <result name="recommmendedwith" value="Recommended with 3–4 players" />
    </poll-summary>
    <playingtime value="120" />
    <minplaytime value="60" />
    <maxplaytime value="120" />
    <statistics page="1"><ratings><averageweight value="2.2853" /></ratings></statistics>
  </item>
  <item type="boardgameexpansion" id="325">
    <name type="primary" sortindex="1" value="CATAN: Seafarers" />
    <minplayers value="3" />
    <maxplayers value="4" />
    <link type="boardgamecategory" id="1009" value="Abstract" />
    <link type="boardgameexpansion" id="13" value="CATAN" inbound="true" />
    <statistics page="1"><ratings><averageweight value="2.4" /></ratings></statistics>
  </item>
  <item type="boardgame" id="99">
    <name type="primary" sortindex="1" value="Tom &amp; Jerry&#039;s Game" />
    <minplayers value="2" />
    <maxplayers value="0" />
    <playingtime value="30" />
    <minplaytime value="0" />
    <maxplaytime value="0" />
    <statistics page="1"><ratings><averageweight value="0" /></ratings></statistics>
  </item>
</items>`;

describe("parseThings", () => {
  it("reads the fields the planner and the cards need", () => {
    const [catan] = parseThings(parse(THING), "now");
    expect(catan).toEqual({
      bggId: 13,
      name: "CATAN",
      year: 1995,
      minPlayers: 3,
      maxPlayers: 4,
      bestWith: "[4]",
      minTime: 60,
      maxTime: 120,
      weight: 2.29,
      thumbnail: "https://cf.geekdo-images.com/thumb/catan.jpg",
      kind: "base",
      baseId: null,
      fetchedAt: "now",
    });
  });

  it("fills gaps BGG leaves as zero so the planner never sees max below min", () => {
    const [, , sparse] = parseThings(parse(THING), "now");
    expect(sparse.name).toBe("Tom & Jerry's Game");
    expect(sparse.maxPlayers).toBe(2);
    expect(sparse.minTime).toBe(30);
    expect(sparse.weight).toBeNull();
    expect(sparse.thumbnail).toBeNull();
  });

  it("links an expansion to the game it expands", () => {
    const [, seafarers] = parseThings(parse(THING), "now");
    expect(seafarers).toMatchObject({ kind: "expansion", baseId: 13 });
  });
});

describe("parseBestWith", () => {
  it.each([
    ["Best with 4 players", [4]],
    ["Best with 3–4 players", [3, 4]],
    ["Best with 2, 4 players", [2, 4]],
    ["Best with 1 player", [1]],
    [undefined, []],
  ])("%s", (input, expected) => {
    expect(parseBestWith(input)).toEqual(expected);
  });
});

describe("parseSearch and parseCollectionIds", () => {
  it("reads ids and names", () => {
    const search = parse(`<items total="1"><item type="boardgame" id="266192">
      <name type="primary" value="Wingspan" /><yearpublished value="2019" /></item></items>`);
    expect(parseSearch(search)).toEqual([{ bggId: 266192, name: "Wingspan", year: 2019 }]);

    const collection = parse(`<items totalitems="2">
      <item objecttype="thing" objectid="13" subtype="boardgame"><name sortindex="1">CATAN</name></item>
      <item objecttype="thing" objectid="266192" subtype="boardgame"><name sortindex="1">Wingspan</name></item>
    </items>`);
    expect(parseCollectionIds(collection)).toEqual([13, 266192]);
  });

  it("returns nothing for an empty result", () => {
    expect(parseSearch(parse(`<items total="0"></items>`))).toEqual([]);
  });
});
