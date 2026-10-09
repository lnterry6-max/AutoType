# AutoType beta release audit — October 9, 2026

## Audit intent and limits

Static and repository-level review of the current `beta-friends` release, its GitHub Pages CI pipeline, and read-only checks of the linked Supabase project. The changes improve accessibility and error prevention but are **not** a guarantee of bug-free gameplay, legal compliance, or security. No production accounts, purchases, or player data were altered during this audit. No real-money checkout was enabled.

A browser engine, iPhone, Android device, or concurrent authenticated player sessions were **not** available to this audit. Those tests are documented below and require hands-on verification.

## Audited surfaces

- 27 HTML pages and their navigation, main landmarks, headings, image alternatives, field labels, page/meta references, and core-asset version consistency
- 15 root JavaScript files plus inline page scripts, focusing on syntax, API export names, rendering, account menu, game keyboard, random prediction and persistence paths
- 5 CSS files and shared responsive shell, the site/pwa variants, installer behavior, and basic CSS block balance
- PWA manifest, iOS and Android icons, service worker, standalone dock behavior, and desktop/mobile installation separation
- SEO sitemap (13 public routes), robots directives, About / Privacy / Contact, AdSense verification and preview-only placeholders
- 45 tracked Supabase migrations; deployed Edge Functions; public-table RLS policies, function privileges, advisory results; aggregate consistency counts
- GitHub Pages and backend audit workflows, with a new permanent release-integrity regression

## Verified and positive results

1. All 27 HTML pages have a main landmark; no duplicate static element IDs or images missing alt text were detected. The admin page intentionally has two primary headings in **mutually exclusive hidden** states.
2. Shared header and footer markup is consistent. All 25 normal pages now include a named account control, an `aria-controls` relationship and a synchronized `aria-expanded` state; Escape closes the dropdown and restores focus.
3. Frontend `AutoTypeBackend.*` calls correspond to exported methods, and the literal `game-api` action names used by the frontend match the server dispatcher names. This does not substitute for runtime payload tests.
4. The existing audit checks JavaScript syntax and inline page scripts. The additional release test checks HTML landmarks, labels, avatar URL encoding, CSS block balance, backend contract names, and accessibility regression behavior.
5. The repo's 45 numbered migration versions match all 45 applied migration versions in the linked Supabase project.
6. **All five deployed Edge Function source files match the repository exactly**, and the intended authenticated endpoints have JWT verification enabled. The Stripe webhook intentionally relies on signature validation instead of a user JWT.
7. All 43 public database tables have RLS enabled. There are 49 public RLS policies. Service-only tables are intentionally not made directly writable/readable by arbitrary clients.
8. There are seven profile records and corresponding seven stats, wallets, and preference records; aggregate consistency checks found **zero profiles missing a stats or wallet record**.
9. The last 24-hour aggregated Edge request sample was overwhelmingly HTTP 200; a small number of 400 responses occurred and may represent legitimate invalid requests. Logs do not establish that all user actions succeeded.
10. The PWA worker has no fetch-intercept handler and does not cache pages or account data. Installation prompts are hidden by default and only enabled for supported mobile browsers outside standalone mode.
11. The three ad placements remain inert layout previews; live ads, payment-mode changes, and automatic ad placement were not introduced.

## Changes made during the sweep

- Account-menu accessibility: initial names and state, Escape dismissal, and focus restoration
- More defensive HTML attribute encoding of user avatar-image source URLs
- Proper labels for admin player search, permission level, and badge selectors
- All standard pages receive the same cache-busted shared core script
- Corrected stale installer copy about the retired offline fallback and aligned PWA/consent documentation
- Added a regression for cross-page accessible markup, stylesheet syntax balance, backend method names and server action names; integrated into `scripts/audit.py`

## Known limitations / follow-up actions

**Security / dashboard**
- Supabase's security advisor reports **leaked-password protection disabled**. Enable and retest it through Auth settings if supported by the current project plan: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Supabase warns about five RLS-enabled tables having no direct policies (friend chat data and tournament-reset archives). In this design, privileged server paths mediate access. Do not add blanket authenticated policies merely to remove the lint warning.
- Performance advisor notes **nine foreign keys without covering indexes** and seven unused indexes. This is low urgency with a small beta dataset. Measure query usage before altering or dropping indexes: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- Supabase JS is loaded through a major-version CDN alias (`@2`). Future hardening should pin an explicitly tested SDK patch version; changing it without regression coverage could destabilize login.
- Live ad deployment still depends on Google's review, regional consent *actually displaying and honoring choices*, and a separate launch test. Dashboard message publishing alone is not a frontend integration.

**Real-device / real-account verification**
1. Safari on desktop: no Home Screen CTA, existing navigation and all public links working; verify light/dark colors and keyboard tab focus.
2. Safari on iPhone: reinstall current Home Screen shortcut, confirm the **original wordmark centered on a white-backed icon**, correct launch screen, no duplicate install CTA, and no browser chrome.
3. Android Chrome: install and launch; icon, Home/Play/Ranks/Profile dock, back behavior and orientation.
4. Installed app: go Home → Play → leaderboard → Friends → Shop → Settings and back; dock should not disappear on browse pages, obstruct chat input or block settings forms.
5. Game: start Word / Context / Sentence / Evil / Daily / Custom; open keyboard, type, erase/lock, rotate the phone and finish a round. Sentence strip stays readable and the page does not jump to the keyboard input.
6. NPC Easy / Medium / Hard: matchmaking fallback and practice results, without fake competitive rewards.
7. Two devices and accounts: queue into one Quick Match, then complete the same race. Results and winner agree on both devices and can be reviewed after refresh.
8. Friends: request/accept/decline, chat, unread badge, blocking/reporting and friend-race invite.
9. Level, XP, achievements, inventory and leaderboard: complete a round, refresh, sign out and sign in on a second device. No stale levels or duplicate claims.
10. Daily mix/rewards and tournaments: repeat claims, reset boundaries, join/leave, standings, tickets and virtual rewards.
11. Shop: cosmetics equip/unequip, crates in the no-real-money beta economy, balance synchronization and no accidental charges.
12. Authentication: new account, existing account, reset password, change credentials, profile image upload and account deletion **only with a disposable test account**.
13. Network recovery: switch off Wi-Fi / cellular during a page load and restore it. The normal browser connection error may appear; the removed AutoType offline fallback must no longer be injected.
14. Accessibility: Safari VoiceOver and keyboard-only navigation; menu labels, focus return, contrast, status announcements and mobile 200% text sizing.
15. AdSense: check review and `ads.txt` status separately. Do not load advertisements or claim compliance until regional choices are working.

## How to report bugs

For each failure, note the page, device/browser, signed-in or guest state, what you expected, what actually happened, and a screenshot if possible. Do not send passwords, access tokens or private account information.

## Audited workflow

- `python3 scripts/audit.py` invokes all existing beta regressions plus `scripts/test-release-integrity.cjs`.
- `.github/workflows/backend-audit.yml` runs the same release audit.
- `.github/workflows/pages.yml` must pass its build audit before deployment can succeed.

This document is a point-in-time record. Re-run the audits after future changes rather than assuming later builds remain valid.
