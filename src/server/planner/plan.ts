export type PlanGame = {
  bggId: number;
  minPlayers: number;
  maxPlayers: number;
  bestWith: number[];
  // BGG weight, 1 (light) to 5 (heavy). Null when unknown.
  weight: number | null;
  // Typical play time in minutes. Null when unknown.
  time: number | null;
};

export type PlanTable = { bggId: number; players: string[]; happy: number };
export type PlanOption = { tables: PlanTable[]; happy: number; score: number };
export type Layout = "one" | "two" | "three";
export type Plan = {
  recommended: Layout | "none";
  oneTable: PlanOption[];
  twoTables: PlanOption[];
  threeTables: PlanOption[];
};

export type PlanInput = {
  // Member ids, in the order they should be seated when nothing else decides.
  attendees: string[];
  games: PlanGame[];
  // bggId -> member ids who approved that game.
  approvals: Map<number, Set<string>>;
};

const LAYOUTS: Layout[] = ["one", "two", "three"];
// A table smaller than this is not a game night table.
const MIN_TABLE = 2;
const MAX_OPTIONS = 3;
// Three tables try only the most wanted games, so a long list of suggestions stays fast.
const MAX_GAMES_FOR_THREE = 10;
// Happy players decide the plan. These only break ties between options with
// the same number of happy players.
const BEST_WITH_BONUS = 0.3;
const TASTE_WEIGHT = 0.5;
const TIME_SPREAD_WEIGHT = 0.4;
const IMBALANCE_WEIGHT = 0.2;
// A play time this many times longer than another counts as the largest gap.
const TIME_RATIO_CAP = 4;
// When seating, a seat at a game you didn't vote for costs more than any taste mismatch.
const UNHAPPY_COST = 1000;
const EPSILON = 1e-9;

type Taste = { weight: number | null; logTime: number | null };

function seats(game: PlanGame, count: number) {
  return count >= Math.max(game.minPlayers, MIN_TABLE) && count <= game.maxPlayers;
}

function approvers(input: PlanInput, bggId: number) {
  return input.approvals.get(bggId) ?? new Set<string>();
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// What each attendee seems to want tonight: the average weight and play time of the games
// they voted for. Play time is averaged on a log scale, so 30 and 120 minutes meet at 60.
function tastes(input: PlanInput) {
  const result = new Map<string, Taste>();
  for (const id of input.attendees) {
    const liked = input.games.filter((g) => approvers(input, g.bggId).has(id));
    result.set(id, {
      weight: mean(liked.flatMap((g) => (g.weight === null ? [] : [g.weight]))),
      logTime: mean(liked.flatMap((g) => (g.time === null ? [] : [Math.log(g.time)]))),
    });
  }
  return result;
}

// How far a game is from someone's taste, from 0 (a match) to 1. Unknown counts as a match.
function mismatch(taste: Taste | undefined, game: PlanGame) {
  const parts: number[] = [];
  if (taste?.weight != null && game.weight !== null) parts.push(Math.abs(taste.weight - game.weight) / 4);
  if (taste?.logTime != null && game.time !== null) {
    parts.push(Math.min(1, Math.abs(taste.logTime - Math.log(game.time)) / Math.log(TIME_RATIO_CAP)));
  }
  return mean(parts) ?? 0;
}

type Context = { input: PlanInput; tastes: Map<string, Taste> };

function cost(ctx: Context, id: string, game: PlanGame) {
  const unhappy = approvers(ctx.input, game.bggId).has(id) ? 0 : UNHAPPY_COST;
  return unhappy + mismatch(ctx.tastes.get(id), game);
}

// Seats everyone at tables of the given sizes at the lowest total cost: first as many people
// as possible at a game they voted for, then everyone as close to their taste as possible.
// Starts from a greedy seating in attendee order, then moves people along cycles of tables
// while that lowers the cost. With fixed table sizes, a seating no 2- or 3-table cycle can
// improve is the best one, so this is exact for up to three tables.
function seat(ctx: Context, games: PlanGame[], sizes: number[]) {
  const cols = ctx.input.attendees.map((id) => games.map((g) => cost(ctx, id, g)));
  const tables: number[][] = games.map(() => []);
  for (let p = 0; p < cols.length; p++) {
    const open = tables.map((t, i) => i).filter((i) => tables[i].length < sizes[i]);
    const pick = open.reduce((best, i) => (cols[p][i] < cols[p][best] ? i : best), open[0]);
    tables[pick].push(p);
  }

  // The cheapest move of one player from table i to table j, and its player.
  const bestMove = (i: number, j: number) => {
    let delta = Infinity;
    let at = -1;
    tables[i].forEach((p, k) => {
      const d = cols[p][j] - cols[p][i];
      if (d < delta) [delta, at] = [d, k];
    });
    return { delta, at };
  };
  const rotate = (cycle: number[]) => {
    const moves = cycle.map((from, k) => ({ from, to: cycle[(k + 1) % cycle.length], ...bestMove(from, cycle[(k + 1) % cycle.length]) }));
    if (moves.reduce((sum, m) => sum + m.delta, 0) >= -EPSILON) return false;
    const moving = moves.map((m) => tables[m.from][m.at]);
    moves.forEach((m, k) => (tables[m.from][m.at] = moving[(k + cycle.length - 1) % cycle.length]));
    return true;
  };

  const k = games.length;
  const cycles: number[][] = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) cycles.push([i, j]);
  if (k === 3) cycles.push([0, 1, 2], [0, 2, 1]);
  for (let improved = true; improved; ) {
    improved = false;
    for (const cycle of cycles) if (rotate(cycle)) improved = true;
  }

  return tables.map((t) => t.sort((a, b) => a - b).map((p) => ctx.input.attendees[p]));
}

// Every way to split n players into tables of these games, each table a size its game seats.
function sizings(games: PlanGame[], n: number): number[][] {
  if (games.length === 1) return seats(games[0], n) ? [[n]] : [];
  const [first, ...rest] = games;
  const result: number[][] = [];
  for (let size = MIN_TABLE; size <= n - MIN_TABLE * rest.length; size++) {
    if (!seats(first, size)) continue;
    for (const others of sizings(rest, n - size)) result.push([size, ...others]);
  }
  return result;
}

function build(ctx: Context, games: PlanGame[], sizes: number[]): PlanOption {
  const seated = seat(ctx, games, sizes);
  const n = ctx.input.attendees.length;
  const tables = games.map((g, i) => {
    const voters = approvers(ctx.input, g.bggId);
    return { bggId: g.bggId, players: seated[i], happy: seated[i].filter((id) => voters.has(id)).length };
  });
  const happy = tables.reduce((sum, t) => sum + t.happy, 0);

  const bestWith = games.filter((g, i) => g.bestWith.includes(sizes[i])).length * BEST_WITH_BONUS;
  const taste =
    games.reduce((sum, g, i) => sum + seated[i].reduce((s, id) => s + mismatch(ctx.tastes.get(id), g), 0), 0) / n;
  // Tables that finish far apart leave one waiting for the other.
  const times = games.flatMap((g) => (g.time === null ? [] : [g.time]));
  const spread = times.length > 1 ? Math.min(1, Math.log(Math.max(...times) / Math.min(...times)) / Math.log(TIME_RATIO_CAP)) : 0;
  const imbalance = (Math.max(...sizes) - Math.min(...sizes)) / n;
  const quality = bestWith - TASTE_WEIGHT * taste - TIME_SPREAD_WEIGHT * spread - IMBALANCE_WEIGHT * imbalance;

  return { tables, happy, score: happy + quality };
}

// Happy players first. The rest of the score only decides between equally happy options.
function better(a: PlanOption, b: PlanOption) {
  return a.happy !== b.happy ? a.happy > b.happy : a.score > b.score + EPSILON;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]));
}

// The best options for one layout. Each one after the first reuses as few of the games
// already shown as it can, so the alternatives are real alternatives.
function options(ctx: Context, games: PlanGame[], tableCount: number): PlanOption[] {
  const n = ctx.input.attendees.length;
  if (n < MIN_TABLE * tableCount) return [];
  const candidates: PlanOption[] = [];
  for (const combo of combinations(games, tableCount)) {
    let best: PlanOption | null = null;
    for (const sizes of sizings(combo, n)) {
      const option = build(ctx, combo, sizes);
      if (!best || better(option, best)) best = option;
    }
    if (best) candidates.push(best);
  }
  candidates.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));

  const picked: PlanOption[] = [];
  const shown = new Set<number>();
  while (picked.length < MAX_OPTIONS && candidates.length > 0) {
    const reused = (o: PlanOption) => o.tables.filter((t) => shown.has(t.bggId)).length;
    const index = candidates.reduce((best, o, i) => (reused(o) < reused(candidates[best]) ? i : best), 0);
    const [option] = candidates.splice(index, 1);
    picked.push(option);
    for (const t of option.tables) shown.add(t.bggId);
  }
  // Variety decides which options are shown. Show them best first.
  return picked.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
}

// How many more happy players each extra table must bring before splitting the group is
// worth it: one per four voters, rounded up. Small groups stay together unless a split is
// clearly better. Big groups split readily, since one big table is rarely everyone's pick.
// Only voters count. People who haven't voted sit wherever there's room, so they shouldn't
// make a split harder for the people who did vote.
function splitMargin(voters: number) {
  return Math.max(1, Math.ceil(voters / 4));
}

export function plan(input: PlanInput): Plan {
  const ctx: Context = { input, tastes: tastes(input) };
  const wanted = (g: PlanGame) => input.attendees.filter((id) => approvers(input, g.bggId).has(id)).length;
  const mostWanted = [...input.games].sort((a, b) => wanted(b) - wanted(a)).slice(0, MAX_GAMES_FOR_THREE);

  const byLayout: Record<Layout, PlanOption[]> = {
    one: options(ctx, input.games, 1),
    two: options(ctx, input.games, 2),
    three: options(ctx, mostWanted, 3),
  };

  let recommended: Plan["recommended"] = "none";
  const voters = input.attendees.filter((id) => input.games.some((g) => approvers(input, g.bggId).has(id)));
  const margin = splitMargin(voters.length);
  for (const layout of LAYOUTS) {
    const best = byLayout[layout][0];
    if (!best) continue;
    if (recommended === "none") {
      recommended = layout;
      continue;
    }
    const extraTables = LAYOUTS.indexOf(layout) - LAYOUTS.indexOf(recommended);
    if (best.happy >= byLayout[recommended][0].happy + margin * extraTables) recommended = layout;
  }

  return { recommended, oneTable: byLayout.one, twoTables: byLayout.two, threeTables: byLayout.three };
}
