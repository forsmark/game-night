# Design

## Context

See proposal.md for why. The relevant code today:

- `votes` holds one row per (night, game, member). A row means "I'd play this". Withdrawing a vote deletes the row. Taking a game off the vote deletes all its rows. Removing a member deletes theirs by cascade.
- `eventDetail` in `src/server/routes/events.ts` builds `approvals` from the votes of the night's players only, and passes them to `plan()`.
- `plan()` in `src/server/planner/plan.ts` is a pure function. `seat()` assigns players to fixed table sizes by minimising a cost: `UNHAPPY_COST` (1000) for a seat at a game the player didn't vote for, plus a taste mismatch from 0 to 1. `better()` ranks options by `happy`, then `score`. Three tables only try the 10 games with the most votes.

## Goals / Non-Goals

**Goals:**

- Store the top pick so that its rules (it is a vote, one per member per night, cleared with the vote) hold in the database, not only in route code.
- Keep `plan()` pure, and make top picks a strict first priority in both ranking and seating.

**Non-Goals:**

- Top picks across nights, or a default top pick carried to the next night.
- Any change to how the recommended table count is computed.
- Letting the host set top picks for other members.

## Decisions

### A top pick is a flag on the vote row

Add `top_pick` (integer boolean, default 0) to `votes`, and a partial unique index on `(event_id, member_id) WHERE top_pick = 1`.

- A top pick is a vote by construction: there is no top pick without a vote row.
- Withdrawing the vote, taking the game off the vote, and removing the member already delete the row, so they clear the top pick with no new code.
- The unique index makes "one per member per night" a database rule.

Alternative: a separate `top_picks` table keyed by (night, member). That needs the vote and nomination routes to clear it by hand, and it can drift from the votes. Rejected.

The migration is generated with `pnpm db:generate`. Existing rows get `top_pick = 0`.

### One endpoint sets and clears the top pick

`PUT /api/events/:id/top-pick` with `{"bggId": <id>}` or `{"bggId": null}`.

- With an id: the same checks as voting (the game is suggested on the night, else 400; the member answered, else 403 `ANSWER_FIRST`). In one transaction: clear the member's top pick on the night, then upsert the vote row for the game with `top_pick = 1`.
- With null: clear the member's top pick on the night. The vote stays.

Alternative: extend the vote body to `{"approve", "topPick"}`. That mixes two actions and makes "clear top pick but keep vote" awkward. Rejected.

### The night's detail lists top pickers per suggestion

Each entry in `nominations` gains `topPickers: string[]`, built the same way as `voters`, from the night's players only. The frontend derives the viewer's own top pick from it.

### The planner takes top picks as input

`PlanInput` gains `topPicks: Map<string, number>` (member id to game id). The route passes only top picks of attendees.

- **Seating.** `cost()` adds `MISSED_TOP_PICK_COST` (1,000,000) when a player with a top pick sits at a different game. With at most 50 players, a missed top pick (1,000,000) outweighs any number of unhappy seats (50 × 1000), which outweigh any taste mismatch (50 × 1). So the minimum cost seats top picks first, then votes, then taste. The cycle-improvement search stays exact for up to three tables, because its argument does not depend on the cost values.
- **Ranking.** `PlanTable` and `PlanOption` gain `topPicks`. `better()` compares `topPicks`, then `happy`, then `score`. `score` stays `happy + quality`. It is used only after the first two keys tie.
- **Three tables.** The 10 games tried for three tables are sorted by the number of top pickers, then by votes. A game that someone made their top pick is then always tried before games nobody top-picked, which matters because top picks rank first.
- **Table count.** `plan()` keeps comparing `happy` of each layout's first option with the same margin. Nothing changes there.

### The stars are an inline SVG drawn with Framer Motion

A `TopPickStars` component draws four to five five-pointed stars with slightly irregular paths, placed around the card's corners and edges and rotated a little. It is absolutely positioned over the card and ignores pointer events. The stroke uses `--vote` (coral), since a top pick is a vote. No new colour. The paths draw in with `pathLength` through Framer Motion, which turns the animation off for reduced motion.

The meeple star is a small filled star in `--vote` at the meeple's top right, on the vote card and in the table plan. In the table plan, it appears only when the seated game is that player's top pick.

### The vote card gets a "Top pick" toggle

Next to "I'd play this", an icon button with a star toggles the top pick. Its label is "Make this my top pick" and, when active, "Clear top pick". It is disabled when the viewer can't vote. The frontend updates optimistically, like votes do.

## Risks / Trade-offs

- [The best option per layout can now have fewer happy players than before, so the unchanged table-count rule can recommend a different count than it did for the same votes.] → This follows from the owner's choice to keep the rule. A planner test pins one such case so the behaviour is deliberate.
- [Members may treat the top pick as a second vote button and not use it.] → The button sits next to the vote button with a clear label. The stars make the result visible.
- [The partial unique index needs SQLite 3.8+ and Drizzle support for `where` on an index.] → Both are present. The migration is checked by the API tests, which run all migrations on an in-memory database.
