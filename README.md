# WhatRWePlaying

Find a PC game your whole group can play together, and where it's cheapest.

**Try it: [whatrweplaying.vercel.app](https://whatrweplaying.vercel.app)**

[![Searching for a game for three friends](docs/search.png)](https://whatrweplaying.vercel.app)

## Features

- Describe your group in plain words; the AI sets the filters and suggests games.
- Shows how many friends can play together in one party or lobby, not a whole match.
- Search any PC game by name, with live prices from Steam, Epic, GOG and more.
- Games are sorted by what's popular right now.
- Save a shortlist and share it with friends as a link.

![Game details with group size and prices](docs/details.png)

## How it works

```mermaid
flowchart LR
  A[Your request] --> B[AI turns it into<br/>filters + game ideas]
  B --> C[Server checks<br/>every value and title]
  C --> D[Matched against<br/>verified group sizes]
  D --> E[Live prices and<br/>player counts]
  E --> F[Results]
```

The AI only suggests. Group sizes, prices and links come from real data, not the AI.

## Run it locally

```bash
npm install
cp .env.example .env.local   # optional: add Groq and Twitch keys for AI and full game search
npm run dev
```

## Built with

![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)
![Groq](https://img.shields.io/badge/Groq_AI-F55036)

Data from [PCGamingWiki](https://www.pcgamingwiki.com) ([CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/)),
[IGDB](https://www.igdb.com), [CheapShark](https://www.cheapshark.com) and Steam. Non-commercial project.
