# AutoType

AutoType is a competitive autocomplete typing game where the predictor commits to full-word guesses while the player types clue letters. Correct prediction overlap stays; only the incorrect tail needs to be erased.

## Backend status

The `backend-foundation` branch is now connected to a shared Supabase backend.

Supabase is the source of truth for:

- authentication and sessions
- profiles, avatars, recovery questions, and preferences
- stats, achievements, wallet balances, and inventory
- equipped cosmetics
- Shop purchases, Collections, and earned-token crate openings
- global and Daily leaderboards
- friends, friend requests, and race rooms/results
- tournaments, registration, refunds, and winner prizes
- Prediction Lab mappings and votes
- announcements
- developer/admin operations and audit records

The browser still keeps a compatibility mirror so the existing UI can render with the original `AutoType.*` interface, but online-account persistence is backed by Supabase.

## Architecture

```text
GitHub Pages / local static server
              |
        AutoType frontend
              |
        Supabase Auth
              |
     PostgreSQL + RLS
        /     |      \
   Storage  Edge     Realtime-ready
            Functions
```

Sensitive economy/admin mutations go through authenticated Edge Functions and server-side PostgreSQL functions. The Supabase service-role key is never shipped to browser code.

## Run locally

Use a local HTTP server:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

On macOS this is preferred if Gatekeeper blocks `start.command`.

## Backend files

```text
backend-config.js
backend.js
supabase/
├── migrations/
└── functions/
    ├── game-api/
    │   └── index.ts
    └── delete-account/
        └── index.ts
```

`backend-config.js` contains only the browser-safe project URL and publishable key. Never commit a database password, Supabase secret key, or `service_role` key.

## Release audit

```bash
python3 scripts/audit.py
```

The `backend-foundation` branch also runs `.github/workflows/backend-audit.yml` on GitHub.

## Current hardening boundary

Persistent account/economy mutations are server-authoritative, but completed typing rounds currently submit bounded client-reported metrics to the server. A future competitive-hardening phase should use server-issued round challenges and stronger result verification before treating high-stakes tournament scores as cheat-resistant.

Payments are not connected. Randomized crates use earned Crate Tokens only; they are not funded by purchased currency.

Earlier development notes live in `docs/DEVELOPMENT_NOTES.md`.
