# AutoType

AutoType is a competitive autocomplete typing game. You type clue letters while the predictor commits to full-word guesses; when the predictor is partly right, correct overlap stays and only the incorrect tail needs to be erased.

## Current status

This repository is a **public prototype / vertical slice**, not the production multiplayer service.

The game UI, progression, cosmetics, shop, crates, tournaments, profiles, achievements, local accounts, and developer tooling all run in the browser. Persistent data currently uses `localStorage`, so accounts and social/tournament data are isolated to one browser profile.

That makes this build suitable for demos, playtesting, GitHub Pages, and UI/gameplay iteration. A production release still needs a backend for shared accounts, multiplayer/social data, verified tournament results, global leaderboards, payments, moderation, and server-side authorization.

## Features

- Word, Context, Sentence, Evil, Daily, Custom, and Friend Race modes
- smart autocomplete overlap: correct AI letters are retained while only the wrong suffix must be erased
- anti-repetition prediction rotation
- score, streaks, timer, erased-AI tracking, and persistent stats
- achievements, XP, levels, profiles, inventory, and cosmetic loadouts
- Featured / Cosmetics / Crates shop structure
- themed Collections with partial-ownership discounts
- Arena Skins, Profile cosmetics, Typing FX, and Victory FX
- earned Crate Tokens and tournament entry Tickets
- persistent local tournaments and developer tournament management
- friends, friend requests, local race challenges, and Prediction Lab suggestions
- customizable solid/photo backgrounds with automatic light/dark UI contrast
- local developer/admin console for testing the prototype

## Run locally

The most reliable way to run AutoType is through a local HTTP server rather than opening pages directly with `file://`.

### macOS

Double-click `start.command`.

### Any platform with Python 3

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Release audit

Run the repository audit before publishing changes:

```bash
python3 scripts/audit.py
```

The audit checks JavaScript syntax, HTML structure, duplicate IDs, local links/assets, and shared `AutoType.*` API references.

## GitHub Pages

This repository includes a GitHub Pages workflow in `.github/workflows/pages.yml`. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup details and the prototype limitations that should remain visible on any public deployment.

## Security

Do not treat the local account/admin system as production authentication. Password hashes are stored client-side and developer/admin authority is browser-local. See [SECURITY.md](SECURITY.md).

## Project layout

```text
AutoType/
├── index.html
├── play.html
├── shop.html
├── tournaments.html
├── profile.html
├── admin.html
├── core.js
├── game.js
├── styles.css
├── assets/
│   └── logo.png
├── scripts/
│   └── audit.py
└── .github/workflows/pages.yml
```

Earlier iteration notes are kept in `docs/DEVELOPMENT_NOTES.md` and are not part of the runtime application.
