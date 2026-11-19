# Proposal

## Why

A vote says "I'd play this", but it doesn't say which game a member wants most. With several votes each, two members can have the same number of votes satisfied while one misses the game they came for. A top pick lets each member name that one game, and the planner can then seat as many members at it as possible.

## What Changes

- A member can make one suggestion their top pick for a night. A top pick is also a vote for that game.
- Each member has at most one top pick per night. Picking another game moves the top pick.
- Withdrawing the vote clears the top pick. Taking the game off the vote clears it too. Clearing the top pick keeps the vote.
- The night's detail lists, for each suggestion, the members who made it their top pick.
- The viewer's own top pick is drawn with hand-drawn stars around its vote card.
- Everyone sees a small star on a member's meeple next to that member's top pick, on the vote card and in the table plan.
- The planner ranks the options for each table count by the number of players seated at their top pick first, then by happy players, then by the existing tie-breakers. Seating within an option follows the same order.
- Each table and option in the plan reports how many players sit at their top pick. When anyone has a top pick, the plan summary on the night page says how many sit at it.
- The rule for the recommended table count does not change. It still counts only happy players.

## Capabilities

### New Capabilities

- `top-pick`: how a member marks, moves and clears their top pick for a night, and how the app shows top picks.
- `table-planner`: how the planner ranks options and seats players, and how it recommends a table count. This change specifies the parts that top picks touch.

### Modified Capabilities

None. The project has no main specs yet.

## Impact

- Database: a new migration that marks a vote as a top pick, with at most one per member per night.
- API: new `PUT /api/events/:id/top-pick`. `GET /api/events/:id` gains `topPickers` on each suggestion and `topPicks` on each plan table and option.
- Planner: `src/server/planner/plan.ts` takes top picks as input and ranks by them first.
- Frontend: the vote card (`game-card.tsx`) gets a top pick button, the stars and the meeple star. The table plan (`table-planner.tsx`) gets the meeple star.
- Docs: AGENTS.md (endpoints, reading the plan) and GLOSSARY.md (the term top pick).

## Claims checked

- No other spec exists yet, so no claim elsewhere can contradict this change.
- top-pick › Top picks count only from the night's players: matches how votes already count, from the night's players only. No conflict.
