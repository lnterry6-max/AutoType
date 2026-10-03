# AutoType Supabase backend

The `backend-foundation` branch uses Supabase as the shared backend for AutoType.

## What is backed by Supabase

- Auth/session identity
- profiles and preferences
- Storage-backed avatars/backgrounds
- hashed recovery/security questions
- player stats and achievements
- wallet/inventory/equipped cosmetics
- Shop/Collection/crate transactions
- leaderboards and Daily rewards
- friends and requests
- race rooms/results
- tournaments and prizes
- Prediction Lab and voting
- developer/admin controls
- announcements and audit/economy logs

## Migrations

Migrations under `migrations/` are synced from the live AutoType Supabase project and should be applied in filename/version order for a fresh project.

## Edge Functions

### game-api

Authenticated gateway for server-authoritative gameplay, economy, social, tournament, Prediction Lab, and developer/admin mutations.

### delete-account

Authenticates the caller and deletes that caller's Supabase Auth account with the server-side admin client.

Both functions require a valid JWT.

## Browser keys

Only the Supabase project URL and publishable key belong in browser code. RLS and server authorization—not secrecy of the publishable key—protect the data.

Never expose:

- `service_role` / secret keys
- database passwords
- private API secrets

## Development note

`localStorage` still contains a compatibility mirror used by the older UI API. For Supabase-backed accounts it is not the authoritative source for persistent profile, progression, wallet, inventory, role, or social state.
