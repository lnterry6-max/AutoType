# Deployment

## What this build is ready for

AutoType can be deployed today as a **public prototype/demo** on any static host, including GitHub Pages.

The current build is **not** a production multiplayer service. Every browser has its own `localStorage` database, so two visitors do not share accounts, friends, tournaments, leaderboards, purchases, or admin state.

## GitHub Pages

The included workflow publishes the repository root as a static site.

1. Push the repository to GitHub.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Push to `main`, or run the Pages workflow manually.

The workflow performs the same static audit used locally before uploading the Pages artifact.

## Before a production release

Move the following systems behind a trusted backend:

- user registration, sessions, password resets, and account recovery
- unique usernames across all users
- developer/admin roles and authorization
- friends and friend requests
- race creation/results
- tournaments, brackets, registration, and prize awarding
- global/daily leaderboards
- inventory, balances, purchases, and entitlements
- Prediction Lab submissions, voting, and moderation
- announcements and live configuration
- rate limits, abuse protection, moderation logs, and backups

For monetization, payment confirmation and cosmetic entitlements must be server-verified. Never trust a client-provided coin balance or purchase result.
