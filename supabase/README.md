# AutoType Supabase backend

The `backend-foundation` branch uses Supabase as the shared backend for AutoType.

## What is backed by Supabase

- Auth/session identity
- profiles and preferences
- Storage-backed avatars/backgrounds
- hashed recovery/security questions
- player stats, achievements, and server-issued verified round challenges
- wallet/inventory/equipped cosmetics
- Shop/Collection/crate transactions
- leaderboards and Daily rewards
- friends and requests
- race rooms/results
- tournaments, verified attempts, and top-score prize validation
- Prediction Lab and voting
- developer/admin controls
- announcements and audit/economy logs
- Stripe Coin-pack orders and webhook-verified wallet credit

## Migrations

Migrations under `migrations/` are synced from the live AutoType Supabase project and should be applied in filename/version order for a fresh project.

## Edge Functions

### game-api

Authenticated gateway for server-authoritative gameplay, economy, social, tournament, Prediction Lab, and developer/admin mutations.

### create-checkout-session

Requires a valid user JWT. Creates a Stripe Checkout Session from a server-defined Coin pack and stores a pending payment order.

### stripe-webhook

Public webhook endpoint with JWT verification disabled because Stripe authenticates the request using the `Stripe-Signature` header. The function verifies the signature before crediting Coins.

### delete-account

Authenticates the caller and deletes that caller's Supabase Auth account with the server-side admin client.

`game-api`, `create-checkout-session`, and `delete-account` require valid user JWTs. `stripe-webhook` uses Stripe signature verification instead.

For payment testing, configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and keep `STRIPE_LIVE_ENABLED=false`. Live Checkout is blocked unless that flag is explicitly set to `true`.

## Browser keys

Only the Supabase project URL and publishable key belong in browser code. RLS and server authorization—not secrecy of the publishable key—protect the data.

Never expose:

- `service_role` / secret keys
- database passwords
- Stripe secret/webhook keys
- private API secrets

## Development note

`localStorage` still contains a compatibility mirror used by the older UI API. For Supabase-backed accounts it is not the authoritative source for persistent profile, progression, wallet, inventory, role, or social state.
