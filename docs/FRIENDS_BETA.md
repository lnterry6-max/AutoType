# AutoType Friends Beta

This build is hosted from the `beta-friends` Git branch, not `main`. The GitHub Actions deploy workflow runs on beta branch pushes. After switching repository Settings → Pages to GitHub Actions, a fresh commit triggers a new publish attempt.

## One-time setup for the owner

1. GitHub repository **Settings → Pages**: under **Build and deployment**, choose **GitHub Actions** as the source. Do this once; the workflow's default token cannot enable a Pages site that has not been configured.
2. In GitHub repository **Settings → Environments → github-pages**, ensure the `beta-friends` branch is allowed by deployment branch rules. Then push a beta-branch update to trigger `.github/workflows/pages.yml`. Confirm the workflow finishes successfully and shows its actual Pages URL. If a run has a GitHub **startup_failure** before any job starts, use a new run after changing environment settings rather than repeatedly rerunning that broken run.
3. Supabase project **Authentication → URL Configuration**: set **Site URL** to `https://lnterry6-max.github.io/AutoType/`, and add the exact Redirect URLs `https://lnterry6-max.github.io/AutoType/account.html` and `https://lnterry6-max.github.io/AutoType/account.html?reset=1`. Also retain localhost redirects if needed for development. Signup confirmation and password recovery need to return to the beta origin.
4. Open the hosted site in a private browser and create a fresh account. Test email confirmation, login, password recovery, a completed game and saved XP, friend requests, and Quick Match between two different browsers.
5. Verify that the beta Coin shop says checkout is disabled. This is a browser feature flag, not a security control: keep server-side `STRIPE_LIVE_ENABLED=false` and Stripe test keys configured while testing.

## Sharing

Expected URL after a successful Pages deployment: `https://lnterry6-max.github.io/AutoType/`. This URL is NOT verified until the workflow succeeds. GitHub Pages is publicly reachable; sharing with friends does not password-protect it. Avoid sharing private information in player bios or public suggestions.

## Tester guidance

Try signing up, typing, levels and achievements, leaderboards, friend requests, Quick Match, tournaments, shop cosmetics, and avatar/background uploads. If something fails, note the page, what you tried, and what happened; send this to the friend who invited you. No real-money purchases are available in the beta UI.
