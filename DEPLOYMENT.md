# Deployment

## Frontend

AutoType is a static frontend and can be served by GitHub Pages. The frontend talks to the hosted Supabase project through the browser-safe publishable key in `backend-config.js`.

Before publishing a production URL, add the deployed AutoType URL to Supabase Auth's allowed Site URL / Redirect URLs. Password-recovery links must be allowed to return to:

```text
<your-site>/account.html?reset=1
```

For local testing, allow the corresponding localhost account URL.

## Backend

The Supabase backend consists of:

- PostgreSQL migrations in `supabase/migrations/`
- Row Level Security policies
- Storage buckets for avatars/backgrounds
- `game-api` Edge Function for trusted gameplay/economy/social/admin actions
- `delete-account` Edge Function for authenticated account deletion
- `create-checkout-session` Edge Function for authenticated Stripe Checkout sessions
- `stripe-webhook` Edge Function for signed Stripe payment events
- `refund-payment` Edge Function for authenticated refunds

For a **brand-new** database, first run `supabase/bootstrap/001_backend_foundation.sql` exactly once, then apply `supabase/migrations/` in filename order. That bootstrap has already been applied to the existing AutoType project, which must not be reset or replayed. Its migration history uses the filenames now committed in this repository. Check `supabase migration list` before any database push, and see `supabase/README.md` for the one-time bootstrap and history details. Deploy Edge Functions from the approved release branch.

## Environment / keys

Browser code may contain:

- Supabase project URL
- Supabase publishable key

Never expose:

- `service_role` / secret keys
- database passwords
- private API secrets

The Edge Functions receive trusted Supabase secrets through their hosted environment.

For Stripe, configure these Supabase project secrets:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_LIVE_ENABLED=false
```

Point the Stripe webhook endpoint at:

```text
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe to Checkout completion/expiration plus the refund and dispute events handled by `stripe-webhook`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, and `charge.dispute.closed`.

Keep `STRIPE_LIVE_ENABLED=false` while testing. Even if a live secret key is accidentally configured, AutoType will reject live checkout until this flag is deliberately changed to `true`.

## Release checks

Run:

```bash
python3 scripts/audit.py
```

and require the backend-foundation GitHub Actions audit to pass before merging/deploying. The audit also checks for duplicate migration versions and missing browser/game-api action names.

Before public deployment, run a two-browser/two-account Quick Match test (simultaneous queue joins, one shared race and target, both results and same winner, leave/cancellation/reconnect), then a complete tournament registration-to-payout test. Check Supabase Auth site/redirect URLs, password protection if available, logging, backup policy and email deliverability.

Keep Stripe in test mode, with `STRIPE_LIVE_ENABLED=false`, until test-mode webhook delivery is verified and business/payment requirements have been addressed. This readiness patch does **not** enable live payments.

## Production hardening still recommended

The backend now persists accounts, economy, inventory, social data, tournaments, and admin actions. Remaining production-hardening work includes:

- per-keystroke/server-observed telemetry if stronger anti-cheat is required
- abuse/rate limits tuned from real traffic
- moderation/reporting workflows
- backup/restore operations and monitoring
- production email branding/deliverability
- enabling Supabase leaked-password protection in Auth password settings (available on supported Supabase plans)
- refund/chargeback operations and support policy
- tax/receipt/business compliance review before live monetization


## Real-money payment launch checklist (not yet enabled)

The checkout frontend is currently deliberately disabled by `AUTOTYPE_FRIENDS_BETA=true` in
`backend-config.js`. This is **not** a signal that the Stripe account is approved or configured.
Do **not** switch it off, set `STRIPE_LIVE_ENABLED=true`, or install live Stripe keys simply to
make the purchase button appear.

Before enabling direct cosmetic/coin sales:

1. Confirm `https://auto-type.net` has a valid TLS certificate and **Enforce HTTPS** is on
   in GitHub Pages. Live checkout permits only `https://auto-type.net` and
   `https://www.auto-type.net`, and requires the browser Origin to match the return URL.
2. Verify the **correct** Stripe business account and its required identity, age,
   guardian/adult representative (when applicable), payout, tax, and business details
   with Stripe. Account holders under 18 must meet Stripe's adult representative
   requirements. Never use another organization's account without authorization.
3. Use a Stripe **sandbox** for the complete user journey: checkout, signed webhook
   fulfillment, duplicate/retried and out-of-order webhook events, pending/failed
   payments, cancel, refund, partial refund, chargeback, and account deletion.
   Use no real cards for tests. Ensure coin balances only change after a verified
   paid event, not on the checkout success page.
4. Configure and inspect the **live** Stripe webhook endpoint and its *separate*
   signing secret; confirm it is subscribed to the event types used by
   `stripe-webhook` and that it rejects test/live environment mismatches.
   Checkout/refund functions use server-held API keys only.
5. Confirm coin packs' USD prices and quantities, clear refund/dispute policies,
   customer support contact, receipts and local tax obligations.
   Purchased coins may be spent only on **known-content cosmetics/collections**.
   Never allow real money or purchased coins to enter randomized reward crates.
6. In a controlled rollout, set server-side secrets in Supabase Edge Functions
   and verify they are never committed to GitHub or placed in browser JavaScript.
   Only after every prerequisite is checked, deliberately enable live checkout
   and replace the friends-beta storefront notice.
7. Monitor webhooks, ledger consistency, payouts, refunds, fraud controls,
   and support requests after launch. Maintain an immediate server-side kill switch.

For the technical Stripe go-live checklist:
https://docs.stripe.com/get-started/checklist/go-live

For Stripe's under-18 account rules:
https://support.stripe.com/questions/can-i-use-stripe-if-i-am-under-18
