# Game Night

A small web app for a monthly board game night. Friends join from one group link, say if they are coming, suggest games, and vote on what to play. The app proposes one or two tables and shows who sits where.

## What it does

- **Group link.** Share one link in the group chat. New players enter their name and answer for the next night. The link stops accepting new players at the group limit (default 15). The host can change the limit or make a new link.
- **Personal links.** Every player also has a personal link that signs them in on another device. They copy it from the menu under their meeple. Nobody has a password.
- **Vote.** Each player marks every suggested game they would play (approval voting).
- **Tables.** The planner picks the games that make the most attendees happy and respects each game's player count. From the "two tables" size (default 7) it splits the group.
- **Shelf.** The host's collection, imported from a BGG CSV export. Expansions are listed with their base game. Only base games can be suggested. An owned expansion that adds seats, such as a 5-6 player extension, raises the game's player count in the planner.
- **Complexity.** Every game card shows its BGG weight as a 5-step meter, so new players can find a light game.
- **Bring a game.** Players type in a game they bring. With a BGG token, they can search BGG instead.
- **Game pieces.** Wooden pieces lie on the page. Throw them around, or toss in more.

## Stack

Node 22 or later, Hono, SQLite (better-sqlite3 and Drizzle), React, TanStack Router and Query, Tailwind CSS, shadcn/ui, Framer Motion.

## Run it locally

```bash
pnpm install
cp .env.example .env
pnpm host:link "Marc"     # creates the host and prints your link
pnpm dev                  # server on :3002, Vite on :5173
```

Open the printed link to sign in. Then import your collection on the Shelf page and copy the group link from the Host page.

`pnpm seed:demo` fills an empty database with fake players and a planned night instead.

## Import your collection

On your BGG collection page, choose **Export**, then **Download CSV**. On the Shelf page, choose **Import collection** and pick the file. "Replace the shelf" removes games that aren't in the file.

The importer links each expansion to its base game by name, because the CSV doesn't say which game it expands. Expansions it can't match are listed at the bottom of the Shelf page, where the host picks the base game.

## BoardGameGeek token

The app works without one. Players type in the games they bring, and the host imports the CSV.

With a token in `BGG_TOKEN`, players can search BGG, and **Import collection > By username** reads the collection with box images. That import refreshes every game, so games from the CSV and hand-typed games with a BGG link get their images too. Register an application at <https://boardgamegeek.com/applications> to get a token.

## Deploy on the home server

1. Copy the project to `~/game-night` on the server and install:
   ```bash
   cd ~/game-night
   pnpm install --frozen-lockfile
   pnpm build
   ```
2. Pick the public address. Check what Funnel already serves first:
   ```bash
   tailscale funnel status
   ```
   If port 443 is free, use `https://<machine>.<tailnet>.ts.net`. If another app already has it, use port 8443: `https://<machine>.<tailnet>.ts.net:8443`.
3. Create `.env`:
   ```bash
   DATABASE_PATH=./data/game-night.db
   PORT=3002
   BASE_URL=https://<machine>.<tailnet>.ts.net:8443
   BGG_TOKEN=
   ```
   `BASE_URL` must be the public address, because the group link and the personal links use it.
4. Create the host and keep the printed link:
   ```bash
   pnpm host:link "Marc"
   ```
5. Start the service. Check `which node` first and fix the `PATH` line in the service file if node is elsewhere.
   ```bash
   cp deploy/game-night.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now game-night
   ```
6. Expose it. Use `--https=443` instead if that port is free:
   ```bash
   tailscale funnel --bg --https=8443 3002
   ```

The data lives in `data/game-night.db`. Back up that file. To update, pull the new code, then run `pnpm install --frozen-lockfile && pnpm build && systemctl --user restart game-night`. Migrations run at start.

## Tests

```bash
pnpm test        # planner, BGG and CSV parsing, group link, shelf import, hand-typed games, piece physics
pnpm typecheck
```
