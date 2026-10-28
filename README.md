# Game Night

A small web app for a monthly board game night. Friends join from one group link, say if they are coming, suggest games, and vote on what to play. The app proposes one or two tables and shows who sits where.

## What it does

- **Group link.** Share one link in the group chat. New players enter their name and answer for the next night. The link stops accepting new players at the group limit (default 15). The host can change the limit or make a new link.
- **Personal links.** Every player also has a personal link that signs them in on another device. They copy it from the menu under their meeple. Nobody has a password.
- **Codes.** Links don't open inside an iPhone home-screen app, so the welcome page has a code box. The group code (on the Host page, next to the group link) leads to the join form. "Sign in on another device" in the menu shows a one-time code that works once, for 10 minutes. The host can make one for any player.
- **Vote.** Each player marks every suggested game they would play (approval voting).
- **Tables.** The planner picks the games that make the most attendees happy and respects each game's player count. From the "two tables" size (default 7) it splits the group.
- **Shelf.** The host's collection, imported from a BGG CSV export. Expansions are listed with their base game. Only base games can be suggested. An owned expansion that adds seats, such as a 5-6 player extension, raises the game's player count in the planner.
- **Complexity.** Every game card shows its BGG weight as a 5-step meter, so new players can find a light game.
- **Bring a game.** Players type in a game they bring. With a BGG token, they can search BGG instead.
- **Game pieces.** Wooden pieces lie on the page. Throw them around, or toss in more.

## Stack

Node 22 or later (or Podman), Hono, SQLite (better-sqlite3 and Drizzle), React, TanStack Router and Query, Tailwind CSS, shadcn/ui, Framer Motion.

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

The app runs as a Podman container, started by systemd through a Quadlet file. The database lives in a named volume.

1. Get the code and build the image on the server:
   ```bash
   git clone https://github.com/forsmark/game-night.git ~/game-night
   cd ~/game-night
   podman build -t game-night .
   ```
2. Pick the public address. Check what Funnel already serves first:
   ```bash
   tailscale funnel status
   ```
   If port 443 is free, use `https://<machine>.<tailnet>.ts.net`. If another app already has it, use port 8443: `https://<machine>.<tailnet>.ts.net:8443`.
3. Create `~/game-night/.env`. The container reads it:
   ```bash
   BASE_URL=https://<machine>.<tailnet>.ts.net:8443
   BGG_TOKEN=
   ```
   `BASE_URL` must be the public address, because the group link and the personal links use it.
   Optionally add `SHARE_BASE_URL` to hand out links through another address, such as a redirect page (see [Share links](#share-links)).
4. Start the container:
   ```bash
   mkdir -p ~/.config/containers/systemd
   cp deploy/game-night.container ~/.config/containers/systemd/
   systemctl --user daemon-reload
   systemctl --user start game-night
   ```
   Quadlet makes the service start at boot. There is no `enable` step.
5. Create the host and keep the printed link:
   ```bash
   podman exec game-night node dist-server/seed/host-link.js "Marc"
   ```
6. Expose it. Use `--https=443` instead if that port is free:
   ```bash
   tailscale funnel --bg --https=8443 3002
   ```

To update: `git pull && podman build -t game-night . && systemctl --user restart game-night`. Migrations run when the container starts.

The container listens on port 3000 and keeps the database in `/data`. The Quadlet file publishes it on `127.0.0.1:3002` and mounts the `game-night-data` volume there. `GET /healthz` returns 200 when the server is up and needs no session. The image's health check calls it with `wget`.

To back up the database: `podman volume export game-night-data > game-night-backup.tar`.

### Without a container

`deploy/game-night.service` runs the app directly with Node 22 or later. Install with `pnpm install --frozen-lockfile && pnpm build`, create `.env` as above, run `pnpm host:link "Marc"`, then copy the service file to `~/.config/systemd/user/` and run `systemctl --user enable --now game-night`. Check `which node` and fix the service's `PATH` line if node lives elsewhere.

## Share links

By default the group link is `BASE_URL/i/<token>` and personal links are `BASE_URL/j/<token>`. With `SHARE_BASE_URL` set, they become `${SHARE_BASE_URL}i/<token>` and `${SHARE_BASE_URL}j/<token>`. The value is used as is and must contain a `#`, so the token stays in the fragment; the app refuses to start otherwise.

For example, `SHARE_BASE_URL=https://forsmark.github.io/game-night/#` gives links like `https://forsmark.github.io/game-night/#i/<token>`. That page forwards to `/i/<token>` on the app. The token is in the fragment, which browsers never send to GitHub.

In a `.env` file that Node reads (`pnpm dev`, `pnpm start`, the systemd service), quote the value: `SHARE_BASE_URL="https://forsmark.github.io/game-night/#"`. Without quotes, Node reads everything from `#` on as a comment. The app removes the quotes when Podman passes them through. A value cut off at the `#` makes the app refuse to start.

## Host on olympus-edge

On the olympus-edge home server, Game Night runs as a public app on its own Tailscale hostname, for example `https://game-night.<tailnet>.ts.net/`. The platform builds this Containerfile, mounts the app's data directory on `/data`, health-checks `/healthz` and sets `BASE_URL` and `SHARE_BASE_URL` with `portal app env set`. Run one-off scripts with `portal app exec game-night -- node dist-server/seed/host-link.js "Marc"`.

Nothing sits in front of the app there, so the app itself sends `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`, serves `/icon.png` without a session, and never logs request paths, because `/i/<token>` and `/j/<token>` carry tokens. Regenerate the icon with `pnpm icon`.

## Tests

```bash
pnpm test        # planner, BGG and CSV parsing, group link, codes, shelf import, hand-typed games, piece physics
pnpm typecheck
```
