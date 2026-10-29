# Getting game data without a BGG API token

Research from 2026-10-29. The goal: box images, and a BoardGameGeek search in the suggest dialog, while the XML API application is still unanswered.

## Outcome

Built on `feat/catalogue-search`:

- **Search:** runs locally on BGG's ranks file, which the host uploads.
- **Game details:** when someone picks a game, the server gets its details and box image from the [geekdo JSON API](#geekdo-json-api).
- **ketch and headless Chrome:** tried and dropped. Each search took 6 to 10 s, and BGG put up a Cloudflare check after about six requests.

The sections below are the research that led there.

## Summary

- The XML API is closed without a token. `GET /xmlapi2/thing?id=13` returns 401.
- The BGG website returns 403 to plain HTTP fetches, but serves pages to headless Chrome. [ketch](https://github.com/1broseidon/ketch) v0.19.0 with `--force-browser` fetched both the browse page and the search page.
- Search and browse pages give the BGG id, name, year, rank and a 64x64 box image. They don't give player counts, play time or weight. Those are on each game's own page (`/boardgame/<id>`), which hasn't been tested yet.
- Open question: run Chrome and ketch inside the game-night container, or in a separate fetcher service. See [Next steps](#next-steps).

## Sources checked

| Source | Result |
|--------|--------|
| XML API 2 (`/xmlapi2/...`) | 401 without a token. The API wiki page doesn't mention tokens and is out of date on this |
| BGG ranks data dump (`/data_dumps/bg_ranks`) | Official daily CSV of every ranked game: id, name, year, rank, ratings, expansion flag. No images or player counts. Needs a BGG login. BGG treats it as part of the XML API for licensing |
| Collection CSV export | Already imported by `src/server/bgg/collection-csv.ts`. Full details, but no images and only one user's games |
| Data Mining wiki page | An old guide to scraping the site with Perl and login cookies. Its "Cookie Dump" page is deprecated. It quotes the terms: no automated access that "sends more request messages ... than a human can reasonably produce" in a browser |
| Wikidata (SPARQL on P2339, the BGG id) | Player counts for the 10 popular games tested, sometimes messy (Wingspan has three max values). Images are photos of games being played, not box art. Coverage drops off for less known games |
| TidyTuesday 2022 snapshot (`rfordatascience/tidytuesday`, 2022-01-25) | 21,831 games with ids, player counts, play time and 64x64 image links that still load from `cf.geekdo-images.com`. Rejected: it stops in January 2022 and has no weight |
| Other datasets (Kaggle 2021, Zenodo 2025) | Older, or only 500 games. No images |
| `api.geekdo.com` (the JSON API the site uses itself) | Undocumented, but answers a plain fetch with no token, cookie or browser (200 in about 0.2 s). See [geekdo JSON API](#geekdo-json-api) |
| Site search box endpoint (`boardgamegeek.com/search/boardgame?q=`) | 403 with a Cloudflare check, like the rest of `boardgamegeek.com` |
| [Arran France's blog post](https://blog.arranfrance.com/post/board-game-geek-api/) (2022, updated 2024) | Covers BGG's login endpoint (`POST /login/api/v1`) and sending the session cookies with an XML API collection request (`showprivate=1`). No game data endpoints |
| XML API without a token, every endpoint | 401 on all of them: `search`, `thing` (with and without `stats`), `hot`, `collection`, `user`, `family`, `plays`, `forumlist`, and the old v1 `xmlapi/boardgame`. No endpoint is open without a token |
| RSS feed (`/rss/thing/<id>`) | Answers a plain fetch: 200 in 0.2 s, no token or browser needed. But it's an activity feed: the last 40 forum threads, replies, blog posts and new user images for the game. It has no player counts, play time or search. The box image showed up only because a blog post happened to include it |
| [connected-web/boardgames-api](https://github.com/connected-web/boardgames-api) | Calls the same XML API, then caches one person's collection as JSON files in the repo. Needs the token like we do |
| [Boardgames MCP server](https://mcpmarket.com/server/boardgames) ([source](https://github.com/pipeworx-io/mcp-boardgames)) | Doesn't use BGG. It wraps the Board Game Atlas API, which by my memory shut down in 2023 (not checked). Its ids aren't BGG ids |

## ketch test

Setup: the release binary (v0.19.0, checksum verified), `ketch config set browser chrome`, and `chrome` on `PATH` pointing at `/usr/bin/google-chrome`.

```bash
ketch scrape https://boardgamegeek.com/browse/boardgame                    # HTTP 403
ketch scrape --force-browser https://boardgamegeek.com/browse/boardgame    # 100 rows
ketch scrape --force-browser "https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=heat"  # 28 results
```

The output is markdown. Each result is a table row like this:

```
|49|[![Board Game: Heat: Pedal to the Metal](https://cf.geekdo-images.com/.../fit-in/64x64/.../pic6940449.png)](https://boardgamegeek.com/boardgame/366013/heat-pedal-to-the-metal)|[Heat: Pedal to the Metal](...) (2022)<br />...
```

To parse a row:

- Rank: the first column.
- BGG id: the number after `/boardgame/` in the link.
- Name: the link text.
- Year: in brackets after the name.
- Image: the `cf.geekdo-images.com` URL.

Image URLs are signed, so a larger size can't be built from them. `GameTile` shows 64px by default, which matches.

## Latency test

Run on 2026-10-29 from a desktop machine, with ketch v0.19.0 and `--force-browser`. Searches were 5 seconds apart.

| Request | Time | Result |
|---------|------|--------|
| Search "catan" | 8.95 s | 36 results |
| Search "wingspan" | 6.69 s | 3 results |
| Search "cascadia" | 6.42 s | 5 results |
| Search "dune imperium" | 6.15 s | 2 results |
| Search "the crew" | 9.91 s | 42 results |
| Search "catan" again | 0.06 s | From ketch's cache |
| Game page `/boardgame/295947/cascadia` | 32.54 s | Cloudflare "Performing security verification" page, no data |

What this shows:

- **Live search is too slow.** A search takes 6 to 10 seconds, too long for a search box that updates as you type.
- **BGG starts a Cloudflare bot check after about six requests in a minute.** So the game page, which is the only source of player counts, didn't load at all.
- Getting past that check would mean beating Cloudflare's bot detection. This prototype stopped there.

## geekdo JSON API

BGG's website loads its data from `api.geekdo.com`. It's undocumented and not covered by the XML API terms. Tested 2026-10-29 with plain `curl`, a few seconds between requests:

| Endpoint | Time | Fields we need |
|----------|------|----------------|
| `GET https://api.geekdo.com/api/geekitems?objectid=224517&objecttype=thing` | 0.24 s | `name`, `yearpublished`, `minplayers`, `maxplayers`, `minplaytime`, `maxplaytime`, `subtype` (boardgame or expansion), `links.expandsboardgame` (the base game) and `links.boardgameexpansion`. Box images: `imageurl` and `images.{micro,thumb,square200,original,...}`, ready-signed links on `cf.geekdo-images.com` |
| `GET https://api.geekdo.com/api/dynamicinfo?objectid=224517&objecttype=thing` | 0.21 s | `polls.boardgameweight.averageweight` (3.86), `polls.userplayers.best` (`[{min: 3, max: 4}]`), `rankinfo[0].rank` |

Values come back as strings ("2", "120"). No search endpoint on `api.geekdo.com` was found. The site's own search runs on `boardgamegeek.com`, which is behind Cloudflare.

A design that fits:

- **Search:** local, over the official ranks CSV. Instant, with real BGG ids, and no requests to BGG while typing.
- **Details:** when someone picks a game the app doesn't know, make two geekdo requests (under half a second) and save the result in the `games` table for good.

## Risks

- BGG blocks automated requests on purpose, and headless Chrome gets past that. BGG could block it at any time. [CloakBrowser](https://github.com/CloakHQ/cloakbrowser) is the fallback if it does.
- Keep requests at a pace a person could produce (one every few seconds), and cache everything in the `games` table, to stay within the quoted terms.
- AGENTS.md ("BGG access") still forbids getting around the block. Update it if this approach is adopted.
- Chrome adds a few hundred MB to whatever image runs it.

## Next steps

1. Test a game page (`/boardgame/<id>`) for player counts, play time, weight, best-with and expansions.
2. Choose where it runs:
   - **In the game-night container (recommended):** live search, and details saved when a game is picked.
   - **As a separate fetcher service on olympus,** which keeps the game-night image small.
3. Write parsers for the markdown with fixture tests, like the XML parsers in `src/server/bgg/client.ts`.
