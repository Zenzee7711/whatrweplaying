# WhatRWePlaying

My friends and I often want to play something together but can't find a game that fits how many
of us there are, what we like, and what everyone is willing to spend. WhatRWePlaying answers one
question: **what can we play together, and where is the best available offer?**

It recommends PC games and links to stores. It doesn't sell anything.

## What you can do

- Tap how many of you are playing, describe your group in plain words ("four of us, online
  co-op, preferably horror, under $15 each"), or use the filters. All three use the same search.
- Start typing a game's name, even with typos ("monstr huntr", "cs2"), and suggestions appear
  as you type. Catalogue games show how many can play together; pick one to see it and games like
  it. Any other PC game can be found too (from IGDB), wherever it's sold: Steam, Epic, GOG,
  Battle.net, the EA app, Riot. Those show where to get the game and live prices when a store
  we check sells it, and are marked "group size not checked", so they never land in group
  results.
- Switch between **AI** and **Keywords** above the search box. AI understands full sentences and
  follow-ups; Keywords is a simple reader that never calls the AI.
- Player counts always mean **how many friends can play together** (a co-op team, a party or a
  private lobby), never the size of a whole public match. Apex Legends shows "up to 3 together"
  (a squad), not "30–60 players per match".
- Describe what you're in the mood for ("I want a solo, story-heavy game") and the AI picks
  games for it, from any PC game, each with a one-line reason. Every pick is checked to exist
  before it's shown, and group sizes and prices on the cards come from our data, never the AI.
- Each new request starts a fresh search. Start with "actually", "cheaper", "no horror" or
  "what about..." to adjust the last one instead, and only the things you mention change.
- Filter by group size, solo / online co-op / local co-op / online versus / local versus,
  free-to-play or paid, a maximum price per person, a common store for everyone, and genres or
  themes to prefer or exclude.
- See why each game fits ("Online co-op, up to 4 players · Matches horror · Within your $15
  budget"), compare live offers across stores, and open the store through CheapShark.
- Save games to a shortlist and share it as a link. Every search is a shareable link too.
- No account needed.

When nothing matches, the app tells you which filter is blocking results instead of quietly
loosening your search. Games whose player count can't be verified go in a separate
"Compatibility unverified" list, and games without a known price inside your budget go in
"Price not confirmed", never into the main results.

## Data and coverage

- **Catalogue:** 80 hand-picked PC games (`data/catalogue.json`), from Steam and from other
  launchers: Riot (Valorant, League of Legends), Epic (Fortnite, Rocket League), HoYoverse,
  Minecraft, Blizzard, EA and Ubisoft. Built by `npm run sync:catalogue`
  from **[PCGamingWiki](https://www.pcgamingwiki.com)** (CC BY-NC-SA 3.0): local and online player
  counts, co-op and versus, crossplay notes, free-to-play or paid, genres and themes. A Steam
  game is matched by its Steam app ID, and the wiki page must list that same ID. A game that
  isn't on Steam is matched by its reviewed wiki page and links to its official launcher.
- **Reviewed party sizes:** the wiki's online numbers are often whole-match sizes, so they are
  never shown as group sizes. `data/overrides.json` holds reviewed co-op team sizes and online
  party or lobby sizes for 33 games, each with its sources and date (for example, Left 4 Dead 2's
  co-op campaign is 4, Battlefield 6 squads are 4, Among Us private lobbies hold 15).
  Games without a reviewed size say "group size unverified" and go in a separate list.
- **Prices:** live from **[CheapShark](https://www.cheapshark.com)**, requested from your browser
  for the games on screen (25 per request, cached for 10 minutes). Prices are **USD**, the
  lowest among the stores CheapShark checks, not your local or regional price. Only the base
  game's record (same Steam app ID) is used, so DLC and other editions aren't mixed in.
  CheapShark doesn't track the EA app, Battle.net or Riot, so games sold only there have no
  price comparison, just a link to get them.
- **[IGDB](https://www.igdb.com):** name search for every PC game runs through the app's own
  server (`/api/games`), so the Twitch credentials never reach the browser; results are cached
  and the endpoint is rate-limited. `npm run sync:igdb` adds a description to every catalogue
  game and artwork for the games that aren't on Steam, matched by Steam app ID or by a reviewed
  IGDB ID in `data/seed.json`, never by name. `npm run sync` runs both syncs in order.
- Missing information stays unknown: no invented player counts, prices, crossplay or release
  details. A $0 offer is shown as a promotion, not as free-to-play.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values you have
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run build                # production build
```

| Variable | Needed for | Where to get it |
|---|---|---|
| `GROQ_API_KEY` | AI search (optional) | [console.groq.com/keys](https://console.groq.com/keys) |
| `GROQ_MODEL` | AI search | A production model with strict structured outputs, e.g. `openai/gpt-oss-20b` |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Searching every PC game, and `npm run sync:igdb` (optional) | Register an app at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) |

All of them stay on the server. Without the Groq values, the AI option is turned off and the
search box uses the keyword reader. Without the Twitch values, name suggestions come from
CheapShark's store data only. `.env.local` is ignored by Git.

## How the AI is used

The AI does two things with your words:

1. **Filter changes**, chosen from fixed values and the catalogue's own genres and themes.
   Anything outside that list is dropped, and the result is validated (Zod) before the server
   applies it. A new request is applied to fresh filters and the AI doesn't see the earlier
   conversation; only a message that reads as a follow-up builds on the last search.
2. **Picks**: up to six games it recommends. The server looks each title up in the catalogue or
   on IGDB and drops any it can't find. The AI's one-line reason is shown as its opinion, and a
   reason that states player counts, play modes or prices is removed, because those facts only
   come from verified data.

It never sees prices or store data, never produces store links, and never decides group
compatibility. Requests use a small schema to stay within Groq's free token limit, and a busy
model fails over to the other free model. If the AI is unavailable, times out, runs out of quota
or returns something invalid, the keyword reader takes over.

## Limitations

- PC only, 80 catalogue games, and only the stores CheapShark tracks (no Xbox store). Some games
  have no CheapShark record matching their Steam app (CheapShark's Battlefield 6 record isn't
  linked to a Steam app), so they show no price rather than a guessed one.
- USD prices; no regional pricing or currency conversion.
- Buying on different stores doesn't prove you can play together; pick one store when in doubt.
- Player counts come from a community wiki plus a few reviewed sources, so mistakes are possible.
  Each game links its sources.
- The AI and game-search rate limits and the search cache are kept in memory per server instance.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zod and Vitest.
