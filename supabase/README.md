# AutoType Supabase backend

This folder is the first backend migration phase.

## Current migration strategy

The existing `main` branch remains a fully usable local prototype. The `backend-foundation` branch adds Supabase alongside it, then each localStorage subsystem will be migrated separately.

Order:

1. Auth + profiles
2. stats + wallet + inventory
3. global leaderboard
4. friends / requests
5. tournaments
6. Prediction Lab
7. realtime races
8. admin / economy Edge Functions
9. storage-backed avatars
10. payments for known/direct cosmetics only

## Browser keys

Only the Supabase **publishable/anon** key belongs in frontend code. It is not a secret; Row Level Security is the security boundary.

Never commit or expose:
- `service_role` keys
- database passwords
- private third-party API secrets

## First migration

`migrations/202610030001_backend_foundation.sql` creates the shared data model, starter-profile trigger, and RLS policies.

Wallets, inventory rewards, player stats, tournament mutation, admin roles, and payout operations intentionally have **no direct client write policy**. Those systems will be mutated through trusted server/Edge Function code.
