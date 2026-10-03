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

## Release checks

Run:

```bash
python3 scripts/audit.py
```

and require the backend-foundation GitHub Actions audit to pass before merging/deploying.

## Production hardening still recommended

The backend now persists accounts, economy, inventory, social data, tournaments, and admin actions. Remaining production-hardening work includes:

- server-issued/verified competitive round challenges for stronger anti-cheat
- abuse/rate limits tuned from real traffic
- moderation/reporting workflows
- backup/restore operations and monitoring
- production email branding/deliverability
- enabling Supabase leaked-password protection
- payment integration only for clearly identified, non-randomized purchases if monetization is added
