import { describe, expect, it } from "vitest";
import { plan, type PlanGame } from "../src/server/planner/plan";

const game = (bggId: number, minPlayers: number, maxPlayers: number, bestWith: number[] = []): PlanGame => ({
  bggId,
  minPlayers,
  maxPlayers,
  bestWith,
});

const votes = (entries: Record<number, string[]>) =>
  new Map(Object.entries(entries).map(([id, members]) => [Number(id), new Set(members)]));

describe("plan", () => {
  it("picks the most wanted game that seats everyone, not the most wanted game overall", () => {
    // Four of five want the 4-player game, but one table of five cannot play it.
    const result = plan({
      attendees: ["a", "b", "c", "d", "e"],
      games: [game(1, 2, 4), game(2, 3, 6)],
      approvals: votes({ 1: ["a", "b", "c", "d"], 2: ["a", "b"] }),
      splitAt: 7,
    });

    expect(result.recommended).toBe("one");
    expect(result.oneTable[0].tables[0].bggId).toBe(2);
  });

  it("ignores votes from people who are not coming", () => {
    // Game 1 has more votes in total, but only from people who said no.
    const result = plan({
      attendees: ["a", "b", "c"],
      games: [game(1, 2, 5), game(2, 2, 5)],
      approvals: votes({ 1: ["x", "y", "z", "a"], 2: ["a", "b"] }),
      splitAt: 7,
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(2);
    expect(result.oneTable[0].happy).toBe(2);
  });

  it("splits a big group so players sit at the game they voted for", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f", "g", "h"],
      games: [game(1, 2, 4), game(2, 2, 5), game(3, 3, 8)],
      approvals: votes({ 1: ["a", "b", "c", "d"], 2: ["e", "f", "g", "h"], 3: [] }),
      splitAt: 7,
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
    const everyone = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const result = plan({
      attendees: everyone,
      games: [game(1, 2, 4), game(2, 2, 6)],
      approvals: votes({ 1: everyone }),
      splitAt: 7,
    });

    for (const option of result.twoTables) {
      const table1 = option.tables.find((t) => t.bggId === 1)!;
      expect(table1.players.length).toBeLessThanOrEqual(4);
    }
    expect(result.twoTables[0].tables.flatMap((t) => t.players).sort()).toEqual(everyone);
  });

  it("splits a small group when no single game seats everyone", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f"],
      games: [game(1, 2, 4), game(2, 2, 4)],
      approvals: votes({}),
      splitAt: 7,
    });

    expect(result.oneTable).toEqual([]);
    expect(result.recommended).toBe("two");
  });

  it("keeps one table under the split size when a game seats everyone", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f"],
      games: [game(1, 2, 4), game(2, 2, 4), game(3, 3, 6)],
      approvals: votes({ 1: ["a", "b", "c"], 2: ["d", "e", "f"] }),
      splitAt: 7,
    });

    expect(result.recommended).toBe("one");
  });

  it("uses the best player count to break a tie in votes", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d"],
      games: [game(1, 2, 6, [5, 6]), game(2, 2, 6, [4])],
      approvals: votes({ 1: ["a"], 2: ["a"] }),
      splitAt: 7,
    });

    expect(result.oneTable[0].tables[0].bggId).toBe(2);
  });

  it("returns no plan when no game or pair of games seats the group", () => {
    const result = plan({
      attendees: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      games: [game(1, 2, 4), game(2, 2, 4)],
      approvals: votes({}),
      splitAt: 7,
    });

    expect(result.recommended).toBe("none");
  });
});
