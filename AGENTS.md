# AGENTS.md

Instructions for AI agents that work on this codebase or use the running app.

Game Night is a web app for a monthly board game night. Friends join through a group link, answer if they are coming, suggest games, and vote. A planner proposes one or two tables. The README covers features, setup and deployment.

## Part 1: Working on the code

### Commands

```bash
pnpm dev            # API on :3002, Vite on :5173 (Vite proxies /api and /j)
pnpm test           # vitest. Run it after every change
pnpm typecheck      # tsc (TypeScript 7)
pnpm build          # frontend into dist/
pnpm build:server   # server bundled to plain JS in dist-server/, as the container runs it
pnpm db:generate    # new migration after a schema change
pnpm host:link Name # create the host on an empty database, or print the host's link
pnpm seed:demo      # fake players and a planned night, empty database only
```

A change is done when `pnpm test`, `pnpm typecheck` and `pnpm build` all pass. If you change dependencies, the build, or the server entry points, also build the container: `podman build -t game-night .`. For UI changes, also open the page and look at it, in light and dark mode and at phone width (390px).

### Layout

| Path | What it holds |
|------|---------------|
| `src/server/routes/` | Hono routes. One file per area: auth, invite, members, games and shelf, events |
| `src/server/planner/plan.ts` | The table planner. Pure function |
| `src/server/bgg/client.ts` | BGG XML API client and parsers |
| `src/server/bgg/collection-csv.ts` | BGG collection CSV import |
| `src/server/db/schema.ts` | Drizzle schema. Migrations are in `drizzle/` |
| `src/frontend/pages/` | One file per route |
| `src/frontend/components/night/` | The night page: tables, vote cards, suggest dialog |
| `src/frontend/components/pieces/` | Wooden pieces and the physics playground |
| `src/frontend/lib/physics.ts` | Piece physics. Pure functions |
| `src/frontend/index.css` | Design tokens and the `.paper` surface classes |
| `src/shared/` | Code both sides import, such as meeple colours |
| `scripts/make-icon.mjs` | Draws `public/icon.png` (512x512). Run with `pnpm icon` |
| `tests/` | Tests. API tests run the real app on an in-memory database |

### Rules

- **Dependencies:** `dependencies` holds only what the server imports at runtime (hono, @hono/node-server, better-sqlite3, drizzle-orm, zod, fast-xml-parser). Frontend packages are bundled by Vite and belong in `devDependencies`, or they end up in the container image.
- **Package manager:** use pnpm, never npm. `.npmrc` and `pnpm-workspace.yaml` require packages to be at least 7 days old. Don't lower that limit to install something newer.
- **Migrations:** never edit a migration that exists. Change `schema.ts`, then run `pnpm db:generate`. The server applies migrations when it starts.
- **Tests:** a test must say why the behaviour matters, and fail when that behaviour breaks. Keep logic pure where you can (planner, physics, parsers) and test it directly.
- **Game ids:** `games.bggId` is the BoardGameGeek id. Games typed in by hand without a BGG link get negative ids. Code must handle negative ids. For example, `%` on a negative id gives a negative index, which once crashed the page. Never send a negative id to BGG. `ensureGames` already filters them out.
- **Expansions:** expansions are stored with `kind = "expansion"` and `baseId`. Only base games can be suggested or voted on. An owned expansion can raise a game's player count through `maxWithExpansions`, and the planner uses that number.
- **BGG access:** the XML API needs `BGG_TOKEN` and the app works without it. The BGG website returns 403 to automated requests. Don't scrape it or work around the block. Without a token, games come from the CSV import or the manual form.
- **Database:** don't edit the SQLite file while the server runs. If you must use the `sqlite3` command line, run `PRAGMA foreign_keys=ON;` first. Without it, deleting a member leaves their answers and votes behind.
- **Design:** cut paper on a wooden table. Use the tokens in `index.css`, `.paper`, `.paper-well`, `.paper-piece`, `.paper-chip` and the shadcn components in `components/ui`. Don't add new colours. Coral (`--vote`) is for votes only. Animations go through Framer Motion, which turns them off for people who prefer reduced motion.
- **Request hygiene:** never add a request logger or log a request path. `/j/<token>` and `/i/<token>` carry tokens. Every response gets `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` from the middleware in `app.ts`. `tests/hosting.test.ts` checks both.
- **Links:** build group and personal links on the server with `shareLink` in `auth/sessions.ts`, never in the frontend. It uses `SHARE_BASE_URL` when set, otherwise `BASE_URL`.
- **UI text:** plain and specific, in sentence case. A button names its action ("Plan night", "Copy link"). Errors say what went wrong and how to fix it. No emoji.

## Part 2: Using the running app

The app runs at the address in `BASE_URL`, for example `https://game-night.<tailnet>.ts.net`. Everything is JSON over `/api`. `GET /healthz` returns 200 when the server is up.

It's hosted on olympus-edge as a public app on its own Tailscale hostname. Run one-off scripts there with `portal app exec game-night -- node dist-server/seed/host-link.js`. A standalone install instead runs the Podman container `game-night` under systemd (`systemctl --user status game-night`, logs in `journalctl --user -u game-night`, database in the volume `game-night-data`), and scripts run with `podman exec game-night node dist-server/seed/host-link.js`.

### Signing in

The app has no passwords and no API keys. Every person has a personal link, `BASE_URL/j/<token>`. Opening it sets a `session_id` cookie that lasts 180 days. With `SHARE_BASE_URL` set, the app hands out links as `${SHARE_BASE_URL}j/<token>` (for example `https://forsmark.github.io/game-night/#j/<token>`), a page that forwards to `BASE_URL/j/<token>` with JavaScript. curl doesn't run it, so take the token from the end of the link and open `BASE_URL/j/<token>` directly. The group link works the same way with `i/`. An agent signs in the same way and keeps the cookie:

```bash
curl -s -c jar.txt -o /dev/null "$BASE_URL/j/<token>"   # sign in
curl -s -b jar.txt "$BASE_URL/api/auth/me"              # {"id","name","role","color"}
```

To act as the host, use the host's personal link. Run `podman exec game-night node dist-server/seed/host-link.js` on the server to print it. To act as a guest, use that guest's link. The host can copy it on the Host page.

### Secrets and permissions

- **Personal links** are passwords. Never post, log or send them anywhere except to their owner.
- **The group link** (`/i/<token>`) is meant for the group chat. Anyone with it can join until the group is full.
- **Acting for a person:** don't answer, vote or suggest on behalf of someone unless that person asked you to.
- **Ask the host first** before any of these: deleting a night, removing a player, making a new link (it signs the player out everywhere), replacing the shelf with an import, or changing the group limit.

### Endpoints

All `/api` routes except `/api/health` and `/api/join` need the session cookie. Outside `/api`, nothing does: `/healthz`, `/j/<token>`, the pages and static files such as `/icon.png` are public. Routes marked **host** return 403 for guests. Errors look like `{"error": {"code", "message"}}`.

**Nights**

| Method and path | Who | What it does |
|-----------------|-----|--------------|
| `GET /api/events/next` | all | `{"id"}` of the next night, or `{"id": null}` |
| `GET /api/events` | all | All nights, newest first, with a `going` count |
| `GET /api/events/:id?maybes=1` | all | Full detail: the night, members, answers, suggested games with voters, and the table `plan`. `maybes=1` counts "maybe" as coming |
| `POST /api/events` | host | Plan a night: `{"startsAt": "2026-11-13T18:30", "location", "note", "splitAt": 7}` |
| `PATCH /api/events/:id` | host | Change any of those fields |
| `DELETE /api/events/:id` | host | Delete a night |
| `PUT /api/events/:id/rsvp` | all | `{"status": "yes" \| "maybe" \| "no"}` for the signed-in person |
| `POST /api/events/:id/nominations` | all | Suggest a game: `{"bggId", "bringing": true \| false}`. `bringing: false` only works for shelf games. Expansions are refused |
| `DELETE /api/events/:id/nominations/:bggId` | suggester or host | Take a game off the vote |
| `PUT /api/events/:id/votes/:bggId` | all | `{"approve": true \| false}` |

**Games and the shelf**

| Method and path | Who | What it does |
|-----------------|-----|--------------|
| `GET /api/shelf` | all | The host's games and expansions. Base games include `expansions` and `maxWithExpansions` |
| `POST /api/shelf` | host | Add a game by id: `{"bggId"}`. Needs BGG unless the game is already known |
| `DELETE /api/shelf/:bggId` | host | Remove a game from the shelf |
| `PATCH /api/shelf/:bggId` | host | Link an expansion to its base game: `{"baseId"}` |
| `POST /api/shelf/import-csv` | host | `{"csv": "<file text>", "replace": false}`. Imports a BGG collection export |
| `POST /api/shelf/import` | host | `{"username"}`. Imports from BGG and refreshes images. Needs `BGG_TOKEN` |
| `GET /api/games/status` | all | `{"bgg": true \| false}`: whether BGG lookups work |
| `GET /api/games/search?q=` | all | `{"results", "bgg"}`. Searches games the app already knows, plus BGG when `BGG_TOKEN` is set. `bgg` is `"ok"`, `"off"` (no token) or `"error"` (BGG failed). The search never fails because of BGG. Each result has `source` (`"known"` or `"bgg"`) and `kind` (`null` for BGG results) |
| `POST /api/games/manual` | all | Add a game by hand: `{"name", "minPlayers", "maxPlayers", "minTime", "maxTime", "weight", "bggLink", "baseId"}`. Returns `{"bggId", "created"}`. Only the host can set `baseId` |

**People and links**

| Method and path | Who | What it does |
|-----------------|-----|--------------|
| `GET /api/auth/link` | all | The signed-in person's own personal link |
| `GET /api/invite` | host | `{"link", "limit", "used"}` for the group link |
| `PATCH /api/invite` | host | `{"limit"}`, from 2 to 50 |
| `POST /api/invite/new-link` | host | New group link. The old one stops working |
| `GET /api/members` | host | Everyone, with their personal links |
| `POST /api/members` | host | Add a player by hand: `{"name"}` |
| `PATCH /api/members/:id` | host | `{"name", "color"}` |
| `POST /api/members/:id/new-link` | host | New personal link. Signs that player out everywhere |
| `DELETE /api/members/:id` | host | Remove a player and their answers, votes and suggestions |

### Reading the plan

`plan.recommended` is `"one"`, `"two"` or `"none"`. `plan.oneTable` and `plan.twoTables` each hold up to three options, best first. Each option has `tables`, where each table has a `bggId` and `players` (member ids), and `happy`, the number of people seated at a game they voted for. Map ids to names with `members` and `nominations[].game` from the same response.

### Common tasks

- **Remind people to answer:** read the next night. Members with no entry in `rsvps` haven't answered. Post the group link in the chat, never personal links.
- **Summarise the night:** report who is coming, the top-voted games, and `plan.recommended` with its first option.
- **Plan next month:** create the night as host with the same place and time as the last one, then share the group link.
