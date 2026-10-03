# Security

## Authentication and authorization

AutoType online accounts use Supabase Auth. Browser requests use the publishable key plus the signed-in user's JWT. PostgreSQL Row Level Security limits direct reads/writes, while sensitive actions use authenticated Edge Functions.

Developer/admin authority is stored in `user_roles` and re-checked server-side for privileged operations.

## Server-authoritative systems

The backend validates and commits:

- wallet balance changes
- item/Collection purchases
- earned-token crate rewards
- inventory ownership
- cosmetic equips
- round rewards and achievements
- tournament entry/refunds/prizes
- friend operations
- Prediction Lab submissions/votes
- admin balance, tournament, moderation, and announcement actions
- Stripe Coin-pack credit after signed webhook verification

Economy/admin actions are also recorded where appropriate in audit/transaction tables.

## Recovery

Password recovery uses a Supabase email recovery session. AutoType also supports a hashed recovery/security-question answer as an additional UI verification step when configured. Security answers are not stored as plaintext.

Email possession remains the primary recovery credential; a security question should not be treated as a stronger authentication factor than the verified email account.

## Storage

Avatar and background uploads are restricted to the signed-in user's UUID folder. Browser uploads never receive a service-role key.

## Secrets

Never place these in frontend code or GitHub:

- Supabase `service_role` / secret keys
- database password
- third-party private API keys

The publishable Supabase key is intentionally browser-visible and relies on RLS/authorization for protection.

## Competitive integrity

Competitive online rounds use server-issued challenges stored in `round_challenges`. A verified result must match the issued mode and word count, remain within the scoring/key/error/timing bounds, and consume an unexpired challenge exactly once.

Global/Daily boards use verified results. Tournament attempts are tied to a registered player and tournament, are single-use, and winner payouts require a top verified score.

Quick Match sentences are server-selected and impossible score/time ranges are rejected before a result can determine the winner. Each matchmaking result is single-use.

Remaining limitation: the browser still reports detailed gameplay metrics. A determined user controlling the client can fabricate plausible in-range events. Stronger anti-cheat would require server-observed event streams, signed telemetry, or another trusted execution boundary.

## Payments

The browser never credits itself after returning from Stripe. `create-checkout-session` creates a server-side order from a server-defined Coin pack, and `stripe-webhook` verifies Stripe's signature before crediting the wallet. Webhook event IDs and Checkout Session IDs are used for idempotency.

Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Supabase project secrets only. Do not put them in `backend-config.js` or GitHub.

Refunds and disputes are reconciled server-side, including Coin reversal/debt when purchased Coins were already spent. AutoType still requires an explicit server-side `STRIPE_LIVE_ENABLED=true` flag before live Checkout can run. Before launch, document the refund/chargeback policy and operational process.

## Randomized rewards

Crates use earned Crate Tokens. Paid currency must not be used to purchase randomized rewards. Any future payments should grant known/direct items or currency used only for known/direct purchases.
