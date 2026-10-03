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

Apply migrations in filename order when provisioning another project, then deploy the Edge Functions.

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

Subscribe to Checkout completion/expiration plus the refund and dispute events handled by `stripe-webhook`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, and `charge.dispute.closed`.

Keep `STRIPE_LIVE_ENABLED=false` while testing. Even if a live secret key is accidentally configured, AutoType will reject live checkout until this flag is deliberately changed to `true`.

## Quick Match release requirement

Quick Match must use the server-owned level calculation, the matchmaking queue RPC, and the server-validated race result path. Do not reintroduce client-only progression for matchmaking races. The matchmaking search band expands gradually but remains capped so a long wait does not turn skill-based matchmaking into unrestricted matching.

## Release checks

Run:

```bash
python3 scripts/audit.py
```

and require the backend-foundation GitHub Actions audit to pass before merging/deploying.

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
