# Tasks

## 1. Store top picks

- [x] 1.1 Add `topPick` to `votes` in `src/server/db/schema.ts` with a partial unique index on (event, member) where it is set, run `pnpm db:generate`, and verify the new migration file holds the column and the index and that `pnpm test` still passes
- [x] 1.2 Add **Top pick** to `GLOSSARY.md` and verify `node tools/spec-checks/bin/spec-checks verify` passes

## 2. Top pick API

- [x] 2.1 Add `PUT /api/events/:id/top-pick` in `src/server/routes/events.ts` (set with a game id, clear with null, same checks as voting) and verify with new API tests in `tests/top-pick.test.ts` covering each scenario of the `top-pick` spec's first five requirements
- [x] 2.2 Add `topPickers` to each suggestion in the night's detail, from the night's players only, and verify with an API test for "Top picks count only from the night's players"
- [x] 2.3 Document the endpoint and `topPickers` in the Endpoints table of AGENTS.md, and verify the table matches the route

## 3. Planner

- [x] 3.1 Add `topPicks` to `PlanInput`, `PlanTable` and `PlanOption` in `src/server/planner/plan.ts`, add the missed top pick cost to seating, rank by top picks in `better()`, and sort the three-table games by top pickers first. Verify with new tests in `tests/plan.test.ts` for each scenario of the `table-planner` spec except the plan summary, and that the existing planner tests still pass unchanged
- [x] 3.2 Pass the attendees' top picks from the night's detail into `plan()`, and verify with an API test that a top pick changes which game a player is seated at
- [x] 3.3 Update "Reading the plan" in AGENTS.md with `topPicks` and the new ranking order, and verify it matches `plan.ts`

## 4. Night page

- [ ] 4.1 Add `topPickers` and `topPicks` to the frontend types in `src/frontend/lib/queries/events.ts`, and a `useTopPick` mutation with an optimistic update, and verify `pnpm typecheck` passes
- [ ] 4.2 Add the `TopPickStars` component and the meeple star, using `--vote` and Framer Motion only, and verify in the browser that the stars draw in and stay still with reduced motion on
- [ ] 4.3 Add the top pick toggle to `game-card.tsx`, the stars around the viewer's own top pick, and the star on top pickers' meeples, and verify in the browser that picking, moving and clearing a top pick and withdrawing the vote behave as the `top-pick` spec says
- [ ] 4.4 Add the meeple star in `table-planner.tsx` for players seated at their top pick, and the top pick count in the plan summary, and verify in the browser against the "Meeples in the table plan" and plan summary scenarios
- [ ] 4.5 Look at the night page in light and dark mode and at 390px width, and verify the stars don't overlap the buttons or cause horizontal scroll

## 5. Integration

- [ ] 5.1 Run `pnpm test`, `pnpm typecheck`, `pnpm build` and `node tools/spec-checks/bin/spec-checks verify`, and verify all pass
- [ ] 5.2 Stop every dev server started, delete scratch files, and verify with `ss -ltn` that ports 3002 and 5173 are free

## Workflow follow-up

- Answer the sync gate, then archive the change in the same pull request.
