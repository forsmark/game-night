import { describe, expect, it } from "vitest";
import { plan, type PlanGame } from "../src/server/planner/plan";

const game = (
  bggId: number,
  minPlayers: number,
  maxPlayers: number,
  bestWith: number[] = [],
  extra: Partial<Pick<PlanGame, "weight" | "time">> = {},
): PlanGame => ({ bggId, minPlayers, maxPlayers, bestWith, weight: null, time: null, ...extra });

const votes = (entries: Record<number, string[]>) =>
  new Map(Object.entries(entries).map(([id, members]) => [Number(id), new Set(members)]));

const people = (count: number) => Array.from({ length: count }, (_, i) => `p${i + 1}`);

const gamesAt = (option: { tables: { bggId: number }[] }) => option.tables.map((t) => t.bggId).sort();

describe("plan", () => {
  it("picks the most wanted game that seats everyone, not the most wanted game overall", () => {
    // Four of five want the 4-player game, but one table of five cannot play it.
    const result = plan({
      attendees: ["a", "b", "c", "d", "e"],
      games: [game(1, 2, 4), game(2, 3, 6)],
      approvals: votes({ 1: ["a", "b", "c", "d"], 2: ["a", "b"] }),
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(2);
  });

  it("ignores votes from people who are not coming", () => {
    // Game 1 has more votes in total, but only from people who said no.
    const result = plan({
      attendees: ["a", "b", "c"],
      games: [game(1, 2, 5), game(2, 2, 5)],
      approvals: votes({ 1: ["x", "y", "z", "a"], 2: ["a", "b"] }),
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(2);
    expect(result.oneTable[0].happy).toBe(2);
  });

  it("splits a big group so players sit at the game they voted for", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f", "g", "h"],
      games: [game(1, 2, 4), game(2, 2, 5), game(3, 3, 8)],
      approvals: votes({ 1: ["a", "b", "c", "d"], 2: ["e", "f", "g", "h"], 3: [] }),
    });

    expect(result.recommended).toBe("two");
    const [first, second] = result.twoTables[0].tables;
    expect(first.bggId).toBe(1);
    expect(first.players.sort()).toEqual(["a", "b", "c", "d"]);
    expect(second.players.sort()).toEqual(["e", "f", "g", "h"]);
    expect(result.twoTables[0].happy).toBe(8);
  });

  it("never seats more players than a game allows", () => {
    // Everyone wants game 1, but it seats only 4. The other 4 go to game 2.
    const everyone = people(8);
    const result = plan({
      attendees: everyone,
      games: [game(1, 2, 4), game(2, 2, 6)],
      approvals: votes({ 1: everyone }),
    });

    for (const option of result.twoTables) {
      const table1 = option.tables.find((t) => t.bggId === 1)!;
      expect(table1.players.length).toBeLessThanOrEqual(4);
    }
    expect(result.twoTables[0].tables.flatMap((t) => t.players).sort()).toEqual(everyone.sort());
  });

  it("splits a small group when no single game seats everyone", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f"],
      games: [game(1, 2, 4), game(2, 2, 4)],
      approvals: votes({}),
    });

    expect(result.oneTable).toEqual([]);
    expect(result.recommended).toBe("two");
  });

  it("keeps a small group together when splitting makes only one more person happy", () => {
    // One table of game 3 makes four of six happy. Two tables make five happy, but splitting
    // six people up is not worth one extra happy player.
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f"],
      games: [game(1, 2, 4), game(2, 2, 4), game(3, 3, 6)],
      approvals: votes({ 1: ["e"], 2: ["f"], 3: ["a", "b", "c", "d"] }),
    });

    expect(result.oneTable[0].happy).toBe(4);
    expect(result.twoTables[0].happy).toBe(5);
    expect(result.recommended).toBe("one");
  });

  it("splits a small group when a split makes clearly more people happy", () => {
    // There is no hardcoded split size. One table makes two of six happy, two tables all six.
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f"],
      games: [game(1, 2, 4), game(2, 2, 4), game(3, 3, 6)],
      approvals: votes({ 1: ["a", "b", "c"], 2: ["d", "e", "f"], 3: ["a", "d"] }),
    });

    expect(result.recommended).toBe("two");
  });

  it("lets the people who voted decide a split, not the people who haven't voted yet", () => {
    // Four of twelve voted. Two tables make all four happy, one table only two. Counted over
    // all twelve, two more happy players would not be worth a split. Counted over the four
    // voters, they are.
    const everyone = people(12);
    const result = plan({
      attendees: everyone,
      games: [game(1, 2, 6), game(2, 2, 6), game(3, 2, 12)],
      approvals: votes({ 1: ["p1", "p2"], 2: ["p3", "p4"], 3: ["p1", "p3"] }),
    });

    expect(result.oneTable[0].happy).toBe(2);
    expect(result.recommended).toBe("two");
    // The people who haven't voted fill the seats left, and every voter sits at their game.
    expect(result.twoTables[0].happy).toBe(4);
  });

  it("uses three tables when three groups each want a different game", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      games: [game(1, 2, 5), game(2, 2, 5), game(3, 2, 5)],
      approvals: votes({ 1: ["a", "b", "c"], 2: ["d", "e", "f"], 3: ["g", "h", "i"] }),
    });

    expect(result.recommended).toBe("three");
    expect(result.threeTables[0].happy).toBe(9);
    for (const table of result.threeTables[0].tables) expect(table.players).toHaveLength(3);
  });

  it("never lets a tie-breaker cost a happy player", () => {
    // Games 3 and 4 hit their best player count at even tables, games 1 and 2 seat 2 and 12.
    // Those bonuses once added up to more than a happy player and picked the worse pair.
    const everyone = people(14);
    const result = plan({
      attendees: everyone,
      games: [game(1, 2, 2), game(2, 12, 12), game(3, 7, 7, [7]), game(4, 7, 7, [7])],
      approvals: votes({
        1: ["p1", "p2"],
        2: everyone.slice(2, 13),
        3: everyone.slice(0, 7),
        4: everyone.slice(7, 12),
      }),
    });

    expect(result.twoTables[0].happy).toBe(13);
    expect(gamesAt(result.twoTables[0])).toEqual([1, 2]);
  });

  it("offers alternatives that use other games, not the same game with a new partner", () => {
    // Game 1 with any of 2, 3 or 4 makes everyone happy. Showing 1+2, 1+3 and 1+4 as the
    // three plans would offer no real choice.
    const result = plan({
      attendees: people(8),
      games: [game(1, 2, 4), game(2, 2, 4), game(3, 2, 4), game(4, 2, 4)],
      approvals: votes({
        1: ["p1", "p2", "p3", "p4"],
        2: ["p5", "p6", "p7", "p8"],
        3: ["p5", "p6", "p7", "p8"],
        4: ["p5", "p6", "p7", "p8"],
      }),
    });

    const [first] = result.twoTables;
    expect(first.happy).toBe(8);
    expect(result.twoTables.some((o) => !gamesAt(o).some((id) => gamesAt(first).includes(id)))).toBe(true);
    // Shown best first, whatever order variety picked them in.
    const happy = result.twoTables.map((o) => o.happy);
    expect(happy).toEqual([...happy].sort((a, b) => b - a));
  });

  it("seats someone whose game didn't make it at the table closest to what they voted for", () => {
    // x voted only for a heavy, long game that can't be played tonight. Of the two tables,
    // the heavy one is closer to that.
    const result = plan({
      attendees: ["x", "a", "b", "c", "d", "y"],
      games: [
        game(1, 2, 3, [], { weight: 1.5, time: 30 }),
        game(2, 2, 3, [], { weight: 3.8, time: 150 }),
        game(3, 5, 5, [], { weight: 4.2, time: 200 }),
      ],
      approvals: votes({ 1: ["a", "b"], 2: ["c", "d"], 3: ["x"] }),
    });

    const heavy = result.twoTables[0].tables.find((t) => t.bggId === 2)!;
    expect(heavy.players).toContain("x");
  });

  it("pairs games that take about as long, so one table isn't left waiting", () => {
    const result = plan({
      attendees: people(8),
      games: [game(1, 2, 4, [], { time: 30 }), game(2, 2, 4, [], { time: 240 }), game(3, 2, 4, [], { time: 40 })],
      approvals: votes({}),
    });

    expect(gamesAt(result.twoTables[0])).toEqual([1, 3]);
  });

  it("handles games typed in by hand, which have negative ids and no weight or time", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d"],
      games: [game(-3, 2, 4), game(-7, 2, 4)],
      approvals: votes({ [-7]: ["a", "b", "c"] }),
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(-7);
  });

  it("uses the best player count to break a tie in votes", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d"],
      games: [game(1, 2, 6, [5, 6]), game(2, 2, 6, [4])],
      approvals: votes({ 1: ["a"], 2: ["a"] }),
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(2);
  });

  it("returns no plan when no game or set of games seats the group", () => {
    const result = plan({
      attendees: people(10),
      games: [game(1, 2, 4), game(2, 2, 4)],
      approvals: votes({}),
    });

    expect(result.recommended).toBe("none");
  });

  it("plans a full night with many suggestions quickly", () => {
    // The plan is worked out on every page load, for up to 50 players.
    const everyone = people(50);
    const games = Array.from({ length: 25 }, (_, i) => game(i + 1, 2, 20, [], { weight: 1 + (i % 5) * 0.8, time: 30 + i * 10 }));
    const approvals = votes(Object.fromEntries(games.map((g, i) => [g.bggId, everyone.filter((_, p) => (p + i) % 3 === 0)])));

    const started = performance.now();
    plan({ attendees: everyone, games, approvals });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

// A top pick is the one game a member most wants to play. The planner puts as many people at
// their top pick as it can before anything else, so nobody misses the game they came for when
// a plan exists that gives it to them.
const picks = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("Top picks rank options first", () => {
  it("More top picks beat more happy players", () => {
    // Game 1: 4 happy, 2 top picks. Game 2: 5 happy, 1 top pick.
    const result = plan({
      attendees: people(5),
      games: [game(1, 2, 5), game(2, 2, 5)],
      approvals: votes({ 1: ["p1", "p2", "p3", "p4"], 2: people(5) }),
      topPicks: picks({ p1: 1, p2: 1, p3: 2 }),
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(1);
    expect(result.oneTable[0]).toMatchObject({ topPicks: 2, happy: 4 });
    expect(result.oneTable[1]).toMatchObject({ topPicks: 1, happy: 5 });
  });
});

describe("Happy players decide between equal top picks", () => {
  it("Same top picks, different happy players", () => {
    const result = plan({
      attendees: people(5),
      games: [game(1, 2, 5), game(2, 2, 5)],
      approvals: votes({ 1: ["p1", "p2", "p3"], 2: people(5) }),
      topPicks: picks({ p1: 1, p2: 2 }),
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(2);
    expect(result.oneTable[0]).toMatchObject({ topPicks: 1, happy: 5 });
  });

  it("Nobody has a top pick", () => {
    const result = plan({
      attendees: people(5),
      games: [game(1, 2, 5), game(2, 2, 5)],
      approvals: votes({ 1: ["p1", "p2", "p3"], 2: people(5) }),
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(2);
    expect(result.oneTable[0]).toMatchObject({ topPicks: 0, happy: 5 });
  });
});

describe("Seating puts players at their top pick first", () => {
  it("Two players want the same seat", () => {
    // Game 1 has two seats, and p1, p2 and p3 all voted for it. Seating by votes alone sends
    // p1 to game 2, since p1 voted for both. p1's top pick keeps p1 at game 1.
    const result = plan({
      attendees: ["p1", "p2", "p3", "p4"],
      games: [game(1, 2, 2), game(2, 2, 2)],
      approvals: votes({ 1: ["p1", "p2", "p3"], 2: ["p1", "p2", "p4"] }),
      topPicks: picks({ p1: 1 }),
    });

    const tables = result.twoTables[0].tables;
    expect(tables.find((t) => t.bggId === 1)!.players).toContain("p1");
    expect(result.twoTables[0].topPicks).toBe(1);
  });
});

describe("The plan reports top picks", () => {
  it("A table with one top pick", () => {
    const result = plan({
      attendees: ["p1", "p2", "p3"],
      games: [game(1, 2, 4)],
      approvals: votes({ 1: ["p1", "p2", "p3"] }),
      topPicks: picks({ p2: 1 }),
    });

    expect(result.oneTable[0].tables[0].topPicks).toBe(1);
    expect(result.oneTable[0].topPicks).toBe(1);
  });
});

describe("Top picks do not change the table count", () => {
  it("More top picks at more tables, too few extra happy players", () => {
    // One table of game 1: 7 happy, 4 top picks. Two tables: 8 happy, 7 top picks.
    // With 8 voters a second table needs 2 more happy players, so one table stays.
    const result = plan({
      attendees: people(8),
      games: [game(1, 2, 8), game(2, 2, 8)],
      approvals: votes({ 1: people(7), 2: ["p5", "p6", "p7", "p8"] }),
      topPicks: picks({ p1: 1, p2: 1, p3: 1, p4: 1, p5: 2, p6: 2, p7: 2 }),
    });

    expect(result.oneTable[0]).toMatchObject({ topPicks: 4, happy: 7 });
    expect(result.twoTables[0]).toMatchObject({ topPicks: 7, happy: 8 });
    expect(result.recommended).toBe("one");
  });

  it("Enough extra happy players", () => {
    const result = plan({
      attendees: people(8),
      games: [game(1, 2, 8), game(2, 2, 8)],
      approvals: votes({ 1: people(6), 2: ["p7", "p8"] }),
    });

    expect(result.twoTables[0].happy - result.oneTable[0].happy).toBe(2);
    expect(result.recommended).toBe("two");
  });
});

describe("three tables with top picks", () => {
  it("tries a top-picked game even when ten games have more votes", () => {
    // Three tables try only ten games. Game 11 has the fewest votes, but it is p1's top pick,
    // and an option that seats p1 at it beats every option that doesn't.
    const many = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = plan({
      attendees: people(6),
      games: [...many.map((id) => game(id, 2, 4)), game(11, 2, 4)],
      approvals: votes({ ...Object.fromEntries(many.map((id) => [id, people(6)])), 11: ["p1"] }),
      topPicks: picks({ p1: 11 }),
    });

    expect(gamesAt(result.threeTables[0])).toContain(11);
    expect(result.threeTables[0].topPicks).toBe(1);
  });
});
