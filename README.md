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
- Stripe Checkout coin purchases with webhook-verified wallet credit

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
    ├── create-checkout-session/
    │   └── index.ts
    ├── stripe-webhook/
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

## Competitive verification

Online Word, Context, Sentence, Evil, Daily, and Tournament rounds now start from server-issued challenges. The server owns the target sentence, challenge lifetime, tournament association, and whether the challenge has already been consumed. Completion is rejected when mode, word count, score ceiling, key/error counts, timing bounds, or challenge state do not match.

Global and Daily leaderboards use verified results. Tournament attempts are single-use, and winner payouts are restricted to a top verified score.

This is stronger than trusting arbitrary browser-submitted scores, but it is not full anti-cheat: per-keystroke behavior is still reported by the client rather than streamed/attested by the server.

Stripe Checkout support is wired for the three Coin packs. Wallet credit only occurs after a signed Stripe webhook is verified by Supabase. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Supabase secrets before checkout becomes available.

Randomized crates use earned Crate Tokens only; purchased Coins cannot open crates.

Earlier development notes live in `docs/DEVELOPMENT_NOTES.md`.
