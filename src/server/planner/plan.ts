export type PlanGame = {
  bggId: number;
  minPlayers: number;
  maxPlayers: number;
  bestWith: number[];
};

export type PlanTable = { bggId: number; players: string[]; happy: number };
export type PlanOption = { tables: PlanTable[]; happy: number; score: number };
export type Plan = {
  recommended: "one" | "two" | "none";
  oneTable: PlanOption[];
  twoTables: PlanOption[];
};

export type PlanInput = {
  // Member ids, in the order they should be seated when nothing else decides.
  attendees: string[];
  games: PlanGame[];
  // bggId -> member ids who approved that game.
  approvals: Map<number, Set<string>>;
  // Attendee count at which two tables become the recommendation.
  splitAt: number;
};

// A table smaller than this is not a game night table.
const MIN_TABLE = 2;
// Approvals decide the plan. These only break ties between options with
// the same number of happy players.
const BEST_WITH_BONUS = 0.3;
const IMBALANCE_PENALTY = 0.05;
const MAX_OPTIONS = 3;

function seats(game: PlanGame, count: number) {
  return count >= Math.max(game.minPlayers, MIN_TABLE) && count <= game.maxPlayers;
}

function bonus(game: PlanGame, count: number) {
  return game.bestWith.includes(count) ? BEST_WITH_BONUS : 0;
}

function approvers(input: PlanInput, bggId: number) {
  return input.approvals.get(bggId) ?? new Set<string>();
}

function planOneTable(input: PlanInput): PlanOption[] {
  const n = input.attendees.length;
  return input.games
    .filter((g) => seats(g, n))
    .map((g) => {
      const voters = approvers(input, g.bggId);
      const happy = input.attendees.filter((id) => voters.has(id)).length;
      return {
        tables: [{ bggId: g.bggId, players: [...input.attendees], happy }],
        happy,
        score: happy + bonus(g, n),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_OPTIONS);
}

// Seats players so that as many as possible sit at a game they approved.
// Players who approved only one of the two games get their table first.
// Players who approved both fill any seat left, then everyone else.
function seat(input: PlanInput, g1: PlanGame, g2: PlanGame, size1: number) {
  const v1 = approvers(input, g1.bggId);
  const v2 = approvers(input, g2.bggId);
  const size2 = input.attendees.length - size1;
  const t1: string[] = [];
  const t2: string[] = [];
  const overflow: string[] = [];

  const onlyFirst = input.attendees.filter((id) => v1.has(id) && !v2.has(id));
  const onlySecond = input.attendees.filter((id) => v2.has(id) && !v1.has(id));
  const both = input.attendees.filter((id) => v1.has(id) && v2.has(id));
  const neither = input.attendees.filter((id) => !v1.has(id) && !v2.has(id));

  for (const id of onlyFirst) (t1.length < size1 ? t1 : overflow).push(id);
  for (const id of onlySecond) (t2.length < size2 ? t2 : overflow).push(id);
  for (const id of [...both, ...neither, ...overflow]) (t1.length < size1 ? t1 : t2).push(id);

  const happy1 = t1.filter((id) => v1.has(id)).length;
  const happy2 = t2.filter((id) => v2.has(id)).length;
  return {
    tables: [
      { bggId: g1.bggId, players: t1, happy: happy1 },
      { bggId: g2.bggId, players: t2, happy: happy2 },
    ],
    happy: happy1 + happy2,
    score:
      happy1 + happy2 + bonus(g1, size1) + bonus(g2, size2) - IMBALANCE_PENALTY * Math.abs(size1 - size2),
  };
}

function planTwoTables(input: PlanInput): PlanOption[] {
  const n = input.attendees.length;
  const options: PlanOption[] = [];

  for (let i = 0; i < input.games.length; i++) {
    for (let j = i + 1; j < input.games.length; j++) {
      const g1 = input.games[i];
      const g2 = input.games[j];
      let best: PlanOption | null = null;
      for (let size1 = MIN_TABLE; size1 <= n - MIN_TABLE; size1++) {
        if (!seats(g1, size1) || !seats(g2, n - size1)) continue;
        const option = seat(input, g1, g2, size1);
        if (!best || option.score > best.score) best = option;
      }
      if (best) options.push(best);
    }
  }

  return options.sort((a, b) => b.score - a.score).slice(0, MAX_OPTIONS);
}

export function plan(input: PlanInput): Plan {
  const oneTable = planOneTable(input);
  const twoTables = planTwoTables(input);
  const wantsSplit = input.attendees.length >= input.splitAt;

  let recommended: Plan["recommended"] = "none";
  if (wantsSplit && twoTables.length > 0) recommended = "two";
  else if (oneTable.length > 0) recommended = "one";
  else if (twoTables.length > 0) recommended = "two";

  return { recommended, oneTable, twoTables };
}
