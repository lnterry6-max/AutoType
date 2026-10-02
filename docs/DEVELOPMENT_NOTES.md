# AutoType — Multi-page build

AutoType has been restructured from one giant HTML file into a small multi-page site.

## Pages

- `index.html` — Home
- `play.html` — Mode picker and gameplay
- `create.html` — Custom sentence builder
- `friends.html` — Friends and races
- `predictions.html` — Prediction Lab
- `profile.html` — Profile customization and achievements
- `account.html` — Sign in / create account
- `settings.html` — Preferences
- `styles.css` — Shared visual system
- `core.js` — Shared accounts/navigation/storage/auth
- `game.js` — Gameplay only

## Navigation

The top navigation is now the main way to move around AutoType:

Home · Play · Create · Friends · Prediction Lab

Clicking your account name opens a dedicated account menu with:

- My Profile
- Switch Account
- Settings
- Sign Out

Guests instead see Sign In / Create Account options.

## Why the site is multi-page now

Feature-specific code has been separated so profile/social/settings changes are much less likely to break gameplay.

For the most reliable local behavior, especially localStorage across pages, run AutoType from a local server rather than opening every page with `file://`.

### Mac

Double-click:

`start.command`

It launches AutoType at:

`http://localhost:8080/`

You can also run manually:

```bash
python3 -m http.server 8080
```

then visit `http://localhost:8080/`.

## Existing data

The build continues using the same `autotypeAccountsStore` localStorage key as the previous single-file version, so existing local accounts/progress can be reused when the browser origin is the same.

## Security

Local passwords use salted PBKDF2-SHA-256 hashes. This is still a browser prototype; a production social game needs server-side authentication, authorization, and database validation.


## Apostrophes

The game now accepts both straight `'` and curly `’` apostrophe key input. Curly apostrophes are normalized to straight apostrophes internally, and the built-in vocabulary now includes common contractions such as `don't`, `it's`, `you're`, `can't`, and `we're`.

## Background customization

Settings now supports:

- solid background color
- custom uploaded background photo
- adjustable photo-darkness overlay
- per-account / guest appearance persistence

Uploaded images are resized in the browser before being stored locally.

## Raised home sections

The Home page uses two raised “shelf” sections for the live predictor and quick links. They are solid surfaces that slightly overlap the page visually, giving sections a distinct game-site feel while keeping the interface restrained and readable.


## Automatic contrast

AutoType now detects the effective brightness of the selected background.

- light solid colors switch the site into a light UI with dark text
- dark solid colors keep the dark UI with light text
- uploaded photos are sampled for average luminance
- the photo-darkness slider is included in the contrast calculation
- navigation, panels, page headings, gameplay text, inputs, and footer adapt together

This keeps custom backgrounds readable without requiring a separate manual text-theme setting.


## Account security and friend requests

### Friend requests
Adding another player no longer creates an instant friendship. AutoType now supports incoming requests, accept/decline, outgoing requests, cancellation, and a pending-request badge in the Friends tab.

A race can only be created after both accounts are actually friends.

### Account switching
Saved accounts are not treated as authenticated sessions. Switching to another saved account requires that account's password again.

### Password policy
New and changed passwords require at least 8 characters, lowercase, uppercase, a number, a symbol, no spaces, and protection against several extremely common passwords or passwords containing the username/email name.

New password hashes use PBKDF2-SHA-256 with 350,000 iterations and a unique random salt. Older PBKDF2 records are upgraded after a successful login.

After 5 failed password attempts, the local prototype temporarily locks that account for 30 seconds.

### Security questions
New accounts choose a security question during creation. The answer is normalized, salted, and hashed.

Older accounts can add a security question from Settings after verifying their current password. Changing a password requires the current password, correct security answer, a strong new password, and matching confirmation.

### Delete account
Settings includes permanent local account deletion. It requires the current password plus typing the exact username. Deleting removes the account, profile/progression, friendships, pending requests, races involving the account, and suggestions submitted by the account.


## Feature inventory / regression checklist

The multi-page build now preserves the feature set developed across the project.

### Gameplay
- Word, Context, Sentence, Evil, Daily, Custom, and Friend Race modes
- physical autocomplete suffix that must be backspaced before another clue
- apostrophe / contraction support
- score, streak/combo, timer, key count, AI-erased count, progress bar
- prediction queue
- sentence continuation prediction
- round results with time, keys, errors, and AI letters erased
- in-game achievement unlock notification
- larger sentence/vocabulary pool and Evil slang vocabulary
- Prediction Lab suggestions integrated into autocomplete

### Progression
- 6 achievements with a dedicated Achievements page and live progress
- persistent Stats page
- XP and levels
- profile XP bar and achievement summary
- local all-time and Daily leaderboards

### Social / profiles
- display name, bio, custom image, fallback avatar colors, favorite modes
- friend requests with accept/decline/cancel
- friend races and race history
- account switching with password re-authentication

### Account / security
- salted PBKDF2-SHA-256 password hashes
- stronger password policy
- temporary failed-login lockout
- hashed security answers
- change-password flow
- permanent account deletion
- sign out vs authenticated account switching

### Customization / navigation
- solid-color or uploaded-photo backgrounds
- automatic light/dark contrast adaptation
- reduced-motion and typing-animation settings
- dedicated How to Play page
- top navigation plus More menu
- multi-page architecture


## Economy, Shop, and Tournaments

### Coins
Signed-in accounts now have a persistent coin wallet. New/existing accounts receive a starter balance when the economy is first initialized.

Coins can currently be earned from:
- completing rounds
- perfect rounds
- 5+ word streaks
- Daily Challenge completions
- newly unlocked achievements
- claiming the local Daily leaderboard #1 reward

Future real-money coin packs are shown in the Shop as a monetization preview, but payment buttons are intentionally disabled until a real payment/backend system exists.

Coins are cosmetic-only and have no cash-out value.

### Tournament Tickets
Tournament Tickets are separate from coins:
- they are earned through play
- they cannot be bought in the coin-pack UI
- they cannot be exchanged for money
- every 10 completed rounds awards one ticket

### Shop
The Shop has persistent ownership/equipping for:
- profile titles
- profile banners
- curated backgrounds
- avatar frames
- cursor effects
- autocomplete/predictor colors
- result-screen effects

The Showcase Spin is visual-only and never spends currency or gives a random prize.

### Tournaments
`tournaments.html` is a dedicated registration page with:
- Daily Open — free entry
- Ranked Circuit — earned Ticket entry
- Weekend Championship — earned Ticket entry

The current local prototype stores registrations and refunds earned Tickets when a registration is cancelled.

Live brackets, verified winners, and tournament prize payouts require a server backend. Purchased coins are deliberately not usable as tournament entry.


## Crates, Inventory, and Developer Account

### Earned-only crates
The Shop now includes three cosmetic crates with a horizontal reel/reveal animation. Crates use Crate Keys, not coins. Crate Keys are earned through gameplay milestones and cannot be purchased in the coin-pack UI.

Crates show their rarity odds before opening and prioritize unowned cosmetics until the applicable pool is complete. Once a pool is complete, duplicates convert to a fixed cosmetic-compensation coin amount. Rewards have no cash-out value.

### Inventory
Profile now includes a full inventory with category filters and direct equip controls for every owned cosmetic. Equipped banners, titles, backgrounds, frames, cursor effects, predictor colors, and result effects remain connected to the rest of the game.

### Developer account
A one-time migration looks for the already-existing account whose username is `Landon` and binds developer privileges to that account's immutable local ID. After the migration is marked complete, creating another account named Landon later does not grant developer access.

Developer Profile tools can set the coin balance, add 10,000 coins, and grant all cosmetics for testing. Developer shop purchases do not deduct coins. In a production backend, the developer role must be server-side rather than inferred from a username or client storage.

### Username uniqueness
Account creation remains case-insensitive for username uniqueness: `Landon`, `landon`, and `LANDON` are treated as the same username. Login is also case-insensitive.


Legacy username conflicts are also normalized on load. If an older local build somehow contains two accounts whose usernames differ only by capitalization, the later duplicate receives a numeric suffix so the stored account list becomes case-insensitively unique.


## Crate and cosmetic visual polish

- developer tools can now set arbitrary coin, Tournament Ticket, and Crate Key balances
- crate reel duration is about five seconds with a longer reel and aggressive early speed before slowing at the center pointer
- the old non-awarding Shop Showcase Spin was removed; crates are now the only spin/reveal interaction
- purchasable Shop backgrounds were retired so they no longer conflict with user-selected background colors/photos
- old purchased background cosmetics automatically migrate into equivalent Typing Trails
- Typing Trails are visible during actual gameplay as animated particles behind the typing cursor
- rarity is now five visible tiers:
  - Common — gray
  - Uncommon — green
  - Rare — blue
  - Epic — purple
  - Legendary — gold
- rarity borders are visible on Shop items, Inventory items, the crate reel, and crate rewards
- Shop/Inventory previews now animate or render the actual cosmetic: banners, titles, trails, cursors, predictor colors, avatar frames, and result-screen effects
- Profile includes a live game-FX loadout preview


## 2026 platform cleanup

This pass audited the current multi-page project after the feature expansion.

Removed / simplified:
- manual avatar fallback-color picker; avatar fallback color is now derived automatically from the account identity
- retired Home/shelf CSS from earlier layouts
- leftover Shop showcase/background-cosmetic CSS
- the legacy single-file build from the active project package (an archive is kept separately outside the project)
- unused public AutoType API exports

Fixed:
- the top navigation wallet now actually renders coins, Tournament Tickets, and Crate Keys

Revamped:
- Home into a player dashboard with Play, progress, wallet, tournaments, and community sections
- Play mode selection into core-mode cards plus special modes
- Create with a live target/predictor preview
- Friends with social summary metrics and clearer requests/network/race sections
- Prediction Lab with mapping/vote metrics and cleaner submit/preview/community structure
- Leaderboard with the current player's local rank summary
- How to Play with a visual core-loop example
- Settings with a compact section index and lifted groups
- Profile with a cleaner edit disclosure, inventory emphasis, and collapsed developer tools
- Account into a two-column identity/progress landing
- Tournaments with a four-step competition flow
- Shop with crates first, a cleaner direct catalog, and collapsed future coin packs

The visual system now uses one consistent raised-section language across pages instead of each feature looking like it came from a different iteration.


## Admin console and tournament management

A shared-store regression was fixed by restoring the `AutoType.store()` API. That bug had caused Home, Tournaments, Friends, Leaderboard, Prediction Lab, and some gameplay lookups to stop rendering after the navigation had already loaded.

The developer account now gets an `admin.html` console with:
- tournament creation
- tournament editing
- open / scheduled / closed status
- tournament deletion
- built-in tournament restoration
- player wallet management
- grant-all-cosmetics for any local player
- player progression reset
- homepage announcement management
- Prediction Lab suggestion removal
- local JSON backup export

Tournament definitions are now persistent data in the AutoType store rather than hard-coded display-only cards.

The Shop page was also rebuilt into a cleaner game-store layout with:
- wallet strip
- dedicated crate zone
- crate opening machine
- category sidebar
- consistent compact cosmetic cards
- visible rarity treatment
- inventory shortcut

The Admin Console tournament manager also includes local entrant lists and manual winner-award controls. Awarding a winner grants the configured coin prize, increments that player's tournament-win count, and records the winner state on the registration.

Tournament winner payouts are single-use: awarding a winner records the winner on the tournament, closes the event, and blocks duplicate first-place payouts.


## Smart overlap and prediction variety

The core typing mechanic now preserves correct overlap from an AI guess. Example: target `minutes`, typed prefix `m`, prediction `mild` — the player erases only `ld`; the correct `i` is retained and the usable prefix becomes `mi`.

Prediction selection also remembers recent guesses for the current target word and prefers an unseen plausible completion when one exists. Built-in sentence vocabulary is folded into the predictor to increase variety. Scoring now tracks actual clue letters typed rather than the length of a prefix that may include AI-retained letters.


## Shop V3

The Shop was simplified around cosmetics that are noticeable and desirable instead of exposing every category at once.

### Main navigation
- Featured
- Cosmetics
- Crates

### Collections
Collections bundle multiple cosmetics into one cohesive theme and support one-click equipping.

Current collections:
- Neon Circuit
- Afterglow
- Deep Void

Collection pricing automatically drops when the player already owns part of the bundle.

### Arena Skins
Arena Skins change the actual typing/gameplay panel without replacing the user's chosen website background color or photo.

Current arena skins:
- Study Grid
- Terminal Core
- Arcade Cabinet
- Void Chamber

### Cosmetic families
The direct-purchase catalog is grouped into only four player-facing families:
- Profile
- Arena Skins
- Typing FX
- Victory FX

Crates remain on their own tab, and future coin packs moved behind the compact Get Coins control rather than occupying the main Shop page.

The Mind Reader title is now treated as an earned prestige title rather than a normal store purchase.

The Mind Reader achievement now grants the matching Mind Reader prestige title directly into the player's inventory; it is no longer a normal store purchase.


## Crate modal and collection preview update

- crate opening now uses a fixed modal overlay, so opening a crate no longer doubles or stretches the Shop page
- crate opening still uses the ~5 second fast reel + slowdown animation
- Crate Tokens (stored internally in the legacy `crateKeys` field for migration compatibility) are now tournament/event reward currency rather than a normal-play milestone reward
- normal Coins remain earned from games and tournaments
- Tournament Tickets remain tournament-entry currency
- randomized crate currency is not sold for real money; future paid monetization should use exact/direct cosmetic purchases instead
- tournaments can award both Coins and Crate Tokens, including custom tournaments created in the Admin Console
- collection cards now preview every included cosmetic automatically, changing every 3 seconds
- partially owned collections visibly reduce their price and show the ownership credit


### Get Coins control restored
The simplified Shop still includes a visible Get Coins flow. Clicking the Coins wallet tile opens a separate coin-pack panel, keeping monetization discoverable without cluttering Featured/Cosmetics/Crates.

The local prototype shows example packs but does not process payments yet. Purchased Coins are intended for exact cosmetics and Collections; Crate Tokens remain earned-only.