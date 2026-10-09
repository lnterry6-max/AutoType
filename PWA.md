# AutoType installed web app (PWA)

AutoType is installable at https://auto-type.net/. It uses the same website and Supabase backend.

## Installation
- iPhone/iPad: Safari → Share → Add to Home Screen → enable **Open as Web App** if offered → Add.
- Android: Chrome → menu → **Install app** or **Add to Home screen** → confirm.
- Players can open /install.html for device instructions. A native install prompt is offered only when the browser makes it available and the player taps Install.

## Standalone design
- Branded square A| icons, color-matched status bar and launch background, standalone app window.
- Compact four-item dock for installed mobile browse pages; **never shown during active matches, Plinko, messaging, account recovery, admin or the keyboard-heavy pages**.
- Normal browser visitors see no dock or automatic install pop-up.
- Home and footer link to the installation guide.

## Network and security
- The service worker intercepts same-origin **navigation requests only**, first trying the live network.
- It caches **only** the generic offline-fallback.htm document—not account/session data, game rounds, results, JavaScript bundles or HTML pages.
- Restored connectivity fetches the current site, preventing stale game builds.
- Live gameplay and backend syncing require an internet connection.
- Installed mode can have separate browser storage; signed-in players might need to log in again. Local-only guest data isn't promised to carry over.
- This is not a native App Store application.

## Testing
Check installation, the app icon, opening directly to Home, clicking Play, sign-in and password reset, mobile typing keyboard, dock hiding in game, and offline/online recovery on physical iPhone and Android devices.
